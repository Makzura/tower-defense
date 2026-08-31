// ---------------------------------------------------------------------------
// SiphonFXBeam -- THE SIPHON'S BEAM. The thing that was invisible.
//
// WHY IT WAS INVISIBLE, established before any of this was written:
//
//   1. The only code that has ever drawn a Siphon beam is the 2D canvas block
//      in js/towers/beam-adapter.js (BeamTower.prototype.draw, the loop
//      commented "--- the beams. One per locked target"). In 3D that method is
//      NEVER CALLED. game.js:3011 -- `actors[i].actor.draw(ctx)` -- sits inside
//      the 2D world layer, which closes at game.js:3040 with the comment
//      "end of the 2D world layer -- see the 3D branch above". The 3D branch
//      hands the board to GLWorld, which draws towers itself (gl-world.js:908,
//      `drawActor(model, t.x + kx, ...)`) and never asks a tower to paint.
//
//   2. gl-world.js contains no Siphon beam code at all. Every occurrence of
//      "siphon" in that file is the body picker (`siphonGroup`, :377), the
//      authored-front regex (:452), `towerModel` (:473) and two comments.
//      Nothing there reads `tower.locks`.
//
//   3. js/gl/siphon-beam-spec.js is loaded (index.html:166) and `SiphonBeamSpec`
//      is referenced by NOTHING outside its own file.
//
//   4. The eight meshes siphon-beam-{thread,ramp,saturated,seeking,gold,column,
//      tendon,chain} are loaded (index.html:261-268) and register themselves
//      with GLModels, but no call site anywhere passes one of those names to
//      `drawActor` or `GLModels.get`.
//
//   So the beam was authored twice over -- a spec and eight reference meshes --
//   and then never wired to anything. It is not dim, occluded or mis-coloured.
//   Nothing draws it. Verified in game: a Siphon holding a lock and visibly
//   draining HP (4000 -> 3987) rendered with empty air between its hands and
//   the enemy, at 1278x719.
//
// WHY THIS IS PROCEDURAL AND NOT THE EIGHT MESHES. The spec says so itself, in
// its own header: "The meshes ... are the REFERENCE BUILD of this spec at a
// 60 u.l. run; this file is what drives a beam between two points that are
// MOVING." A baked mesh cannot serve: `drawActor` offers yaw plus a UNIFORM
// scale, so it can neither stretch a 60 u.l. cord to the 8..78 px run a real
// lock asks for, nor tilt it from a tower standing on a raised deck down to an
// enemy on the road. The meshes stay what they are -- the reference this file
// is measured against. Every number below is read from SiphonBeamSpec.
//
// THE ONE MESSAGE: IT FLOWS TOWARD THE TOWER. Carried four ways, all of them
// in the matter, never as a glyph (`SiphonBeamSpec.forbidden` bans arrows,
// icons and interface indicators, and nothing here draws one):
//
//   GROW     the cord is measurably fatter at the tower end -- r(t) is the
//            spec's own law, and the knots on it grow the same way.
//   SCROLL   the knots travel target -> tower, and ACCELERATE as they close on
//            it. That is the strongest of the four: matter speeding up as it
//            nears a point reads as being drawn in, not thrown out. It comes
//            out of the spec's scroll law for free (see FLOW COORDINATE).
//   CHEVRON  every knot is a wedge, and its point faces the tower.
//   SPOUT    the tower end opens into an intake bell; the enemy end is BLUNT,
//            cut flat, with nothing pointing outward anywhere.
//
// NO ATTACK PULSE. This file holds no hook into the damage pipeline and never
// reads a fire timer -- `sinceShot`, `gearPhase` and the damage tick are all
// deliberately untouched, because at this fire rate separate impacts read as
// flicker. The only events that may show are TRANSFERS (gold banked, HP
// returned), and only for the states whose spec entry says `pulses: transfer
// only`.
//
// PRESENTATION ONLY. Nothing here is written back into the simulation and no
// property is added to a tower or an enemy. The module reads `locks` /
// `visibleLocks()`, `core.purchased`, `core.stats`, `ramp.multiplier()`,
// `hpHealed` and `goldGenerated` -- all read-only -- and keeps every byte of
// its own state in its own Map, keyed by tower and pruned when the tower goes.
//
// ---------------------------------------------------------------------------
// WHERE gl-world.js MUST CALL THIS  (this file changes nothing else)
// ---------------------------------------------------------------------------
//
// 1. index.html, beside the other js/gl effect modules -- after gl-world.js and
//    AFTER siphon-beam-spec.js, whose table it reads at call time:
//
//        <script src="js/gl/siphon-beam-draw.js"></script>
//
// 2. js/gl/gl-world.js, in `drawOverlays`, at the END of the tower-hardware
//    pass and immediately BEFORE `drawShots`. The beam is hardware -- it is on
//    screen permanently while a lock is held -- so it belongs in the layer the
//    file's own comment reserves for hardware ("Tower hardware lighting up,
//    then the shots, then the cosmetic burst"), under the shots and under the
//    cosmetic burst. The surrounding lines are, verbatim (gl-world.js:1629-1632):
//
//              }
//            }
//          }
//          drawShots(ctx, state);
//
//    where the first `}` closes the recruit loop, the second closes
//    `if (fxId === "soldier")` and the third closes
//    `for (i = 0; i < state.towers.length; i++)`. Insert BETWEEN the third `}`
//    and `drawShots(ctx, state);`:
//
//        // THE SIPHON'S BEAM (js/gl/siphon-beam-draw.js). Hardware, not a
//        // shot: it is continuous while a lock is held, so it draws with the
//        // hardware pass, under the shots and under the cosmetic burst.
//        if (typeof SiphonFXBeam !== "undefined") {
//          SiphonFXBeam.draw(ctx, state, BLUB_FX_API);
//        }
//
//    AT TOP LEVEL, OUTSIDE the tower loop's `withGround(...)`, and that is not
//    a detail. A beam spans TWO ground heights -- the deck the tower stands on
//    and the road the enemy walks -- so it pins its own reference by calling
//    `api.withGround(0, ...)` internally and then feeding `project` ABSOLUTE
//    heights. That is the same rule gl-world.js:1176-1187 states for a shot in
//    flight: one owner, one pinned reference, a straight line angled between
//    the height it left and the height it is going to. Called from inside the
//    per-tower `withGround` it would instead flatten every beam onto the
//    tower's own deck and the far end would float.
//
// 3. OPTIONAL, in `ensureMap()` beside the other reset()s -- a new board keeps
//    no old transfer boluses. Skipping it costs at most a few stale records
//    that the draw pass prunes on its next pass anyway:
//
//        if (typeof SiphonFXBeam !== "undefined") SiphonFXBeam.reset();
//
// 4. Nothing else. There is no update() to schedule: the module's only state is
//    a scroll phase driven by `state.now` (so a paused game freezes the beam,
//    which is correct) and a short list of transfer boluses.
//
// ---------------------------------------------------------------------------
// PERFORMANCE -- OVERDRAW is the axis, per visual-pass/PERF.md
// ---------------------------------------------------------------------------
//
// A beam is at most 78 board px long (the tower's range) and a few px wide, so
// the fill area is tiny -- a maxed Siphon's cord covers roughly 900 px^2, one
// eight-hundredth of a 720p frame. The costs that would actually matter are
// per-frame ALLOCATION and per-frame STRING BUILDING, and neither happens:
//
//   * every sample buffer is a module-level typed-ish scratch array, grown
//     once and reused for every beam of every frame;
//   * every colour is a pre-built `rgba()` string from a 25-step alpha table
//     (`ink`), built lazily per colour and cached forever;
//   * the flow tables (the arc-length warp that makes the scroll accelerate)
//     are built once per distinct scroll law and cached -- eight of them, ever;
//   * no gradients, no shadowBlur, no filters, no per-frame closures.
//
// Per beam that is ~18 `project` calls and 4-6 fills. Six beams on screen is
// about a hundred projections a frame, against the ~180 a single Summoner vein
// pays, and the projections are the whole cost.
// ---------------------------------------------------------------------------

var SiphonFXBeam = (function () {
  "use strict";

  var VERSION = "1.0";

  // The spec is the source of truth for every number in this file. It is read
  // at CALL time, not at load time, so script order cannot silently produce a
  // beam built out of fallbacks.
  function spec() {
    return (typeof SiphonBeamSpec !== "undefined") ? SiphonBeamSpec : null;
  }

  // ---- small maths ---------------------------------------------------------

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) {
    var t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // ---- colour --------------------------------------------------------------
  //
  // Quantised alpha, cached strings. 25 steps is finer than the eye resolves on
  // a translucent overlay and it means a beam allocates no strings at all once
  // it has been on screen for one frame.

  var ALPHA_STEPS = 24;
  var inkCache = Object.create(null);

  function rgbOf(hex) {
    var h = hex.charAt(0) === "#" ? hex.slice(1) : hex;
    return [parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16)];
  }

  // `key` is a palette name; `lift` brightens toward white without inventing a
  // new palette entry (used for the core, which is the same material catching
  // more light, not a different substance).
  function inkTable(key, lift) {
    var id = key + "|" + lift;
    var got = inkCache[id];
    if (got) return got;
    var sp = spec();
    var entry = sp && sp.palette && sp.palette[key];
    var rgb = rgbOf(entry ? entry.hex : "#B08A66");
    if (lift) {
      rgb = [Math.round(lerp(rgb[0], 255, lift)),
             Math.round(lerp(rgb[1], 255, lift)),
             Math.round(lerp(rgb[2], 255, lift))];
    }
    var head = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",";
    var table = new Array(ALPHA_STEPS + 1);
    for (var i = 0; i <= ALPHA_STEPS; i++) {
      table[i] = head + (i / ALPHA_STEPS).toFixed(3) + ")";
    }
    inkCache[id] = table;
    return table;
  }

  function ink(key, lift, alpha) {
    var t = inkTable(key, lift || 0);
    return t[clamp(Math.round(alpha * ALPHA_STEPS), 0, ALPHA_STEPS)];
  }

  // ---- what the tower is ---------------------------------------------------

  function tiers(tower) {
    var p = tower && tower.core && tower.core.purchased;
    return { a: (p && p.A) || 0, b: (p && p.B) || 0 };
  }

  // WHICH BODY IS ON SCREEN. This mirrors gl-world.js:377 `siphonGroup` line for
  // line, and it is mirrored rather than re-derived from `tiers(tower).a >= 3`
  // on purpose. Those are not the same question. `originByTier` asks WHERE on
  // the body the cord leaves (hands or ring), which A3 settles for every tier
  // above it; `originFrames` is a table PER BODY, and the Siphon has eleven
  // bodies. Reading a4's ring position out of a3's row would put the cord a few
  // pixels off the ring in a way that reads as a modelling error rather than as
  // the plumbing error it would be -- and nobody would ever spot it by eye.
  //
  // If gl-world's picker ever changes, this must change with it. That is the
  // cost of the mirror; the alternative was exporting the picker out of a
  // closure that has no other reason to open.
  function bodyKey(tower) {
    var t = tiers(tower);
    if (t.a >= 3) return "a" + Math.min(t.a, 5);
    if (t.b >= 3) return "b" + Math.min(t.b, 5);
    if (t.a >= 1) return "a" + t.a;
    if (t.b >= 1) return "b" + t.b;
    return "base";
  }

  // A DISAGREEMENT BETWEEN THE TABLE AND THE MODEL IS SURFACED, NOT ABSORBED.
  //
  // `originFrameCount` is written by the generator; `m.frames.length` is what
  // the exported body actually carries. If the two drift -- a regenerated spec
  // against a stale model, or the reverse -- clamping alone would keep drawing a
  // plausible cord off the wrong pose, silently, forever. So the clamp stays
  // (a wrong ring beats no beam) and the mismatch is recorded and warned once.
  var mismatchSeen = Object.create(null);

  function noteMismatch(key, modelFrames, tableFrames) {
    var id = key + ":" + modelFrames + "/" + tableFrames;
    if (mismatchSeen[id]) return;
    mismatchSeen[id] = { body: key, modelFrames: modelFrames,
                         originFrames: tableFrames };
    if (typeof console !== "undefined" && console.warn) {
      console.warn("SiphonFXBeam: siphon-" + key + " draws " + modelFrames +
        " frames but SiphonBeamSpec.originFrames has " + tableFrames +
        " -- the ring is being read from a clamped index. Regenerate " +
        "tools/blender/siphon_beam.py against the current bodies.");
    }
  }

  // A KEY MISS IS THE OTHER WAY THIS CHANGE SHIPS AS A NO-OP, and it is the
  // quieter of the two. `originFrames` is keyed by `siphonGroup()`'s LOWERCASE
  // body names -- "base", "a1".."a5", "b1".."b5" -- while the spec's own
  // `originByTier` is uppercase. Index it with the wrong case and every lookup
  // misses, every miss falls back to the static ring, the beam still starts
  // somewhere plausible, and every capture passes while nothing new is in use.
  // So a miss is warned once per key, with the keys the table actually has.
  //
  // EXCEPT ON A B BODY, WHICH IS A CONTRACT AND NOT AN ERROR. The b1..b5 bodies
  // are authored by tools/blender/siphon_abyss.py, which never writes the
  // origins file, and a B-path Siphon pours from the HANDS -- there is no ring
  // on it to follow. A b-tier miss is therefore expected and silent by design;
  // if that ever changes, the only edit needed is to drop this branch.
  function noteKeyMiss(key, table) {
    if (key.charAt(0) === "b" && key !== "base") return;   // documented above
    var id = "miss:" + key;
    if (mismatchSeen[id]) return;
    var have = [];
    for (var k in table) have.push(k);
    mismatchSeen[id] = { body: key, missing: true, tableKeys: have };
    if (typeof console !== "undefined" && console.warn) {
      console.warn("SiphonFXBeam: SiphonBeamSpec.originFrames has no row for " +
        "body \"" + key + "\" -- falling back to the STATIC ring, so the " +
        "per-frame origin is not in use for this tower. Table has: [" +
        have.join(", ") + "].");
    }
  }

  function mismatches() {
    var out = [];
    for (var k in mismatchSeen) out.push(mismatchSeen[k]);
    return out;
  }

  // The origin follows the TIER, never the state -- SiphonBeamSpec.originByTier
  // says so in as many words, and states like `ramp` exist on both sides of A3.
  // A3/A4/A5 pour from the RING; base, A1, A2 and the whole of path B pour from
  // the HANDS.
  //
  // AND, SINCE THE RING MOVES, IT FOLLOWS THE FRAME TOO. The sceptre's ring IS
  // the beam origin, and it is animated -- so the point this returns has to be
  // the one belonging to the frame the BODY IS ACTUALLY DRAWN AT this frame, or
  // the cord leaves the ring by a few pixels every time the arm swings. `frame`
  // comes from animFrame() below, which is the single place that arithmetic
  // lives; do not pass a frame worked out anywhere else.
  //
  // FALLBACK. With `originFrames` absent this is exactly the old static
  // HANDS/RING behaviour, so the tree is never broken mid-generation.
  //
  // THE TABLE HAS LANDED AND THE FALLBACK IS NO LONGER THE LIVE PATH. This
  // comment used to say the static path "is the live path until the generator
  // lands it"; the generator landed it, and the sentence outlived the fact.
  // Probed at runtime 2026-08-12: `SiphonBeamSpec.originFrames` is present with
  // 25 frames across six LOWERCASE body rows, the hands below A3 and the
  // sceptre's ring from A3 up. The fallback is now the broken-tree path only.
  //
  // It still matters, and this is why: a silent fallback looks identical to a
  // working per-frame origin AT REST, because frame 0 of the table IS the
  // static point. That is what `originAnimated()` is exported for -- a test
  // that cannot tell the two apart is not testing anything.
  function originPoint(tower, frame) {
    var sp = spec();
    var o = sp && sp.origins;
    var hands = (o && o.HANDS) || [0.055, 0.305, 1.045];
    var ring = (o && o.RING) || [0.315, 0.395, 1.190];
    var stat = tiers(tower).a >= 3 ? ring : hands;

    var table = sp && sp.originFrames;
    if (!table) return stat;
    var key = bodyKey(tower);
    var row = table[key];
    if (!row || !row.length) { noteKeyMiss(key, table); return stat; }

    // The model's own frame count, as reported by gl-world through animFrame on
    // this same rendered frame. Zero when the GL body pass has not run (the 2D
    // fallback, or a harness that draws overlays alone), in which case there is
    // nothing to disagree with.
    var modelFrames = (tower && tower._chanFrames) | 0;
    var declared = (typeof sp.originFrameCount === "number")
      ? sp.originFrameCount | 0 : row.length;
    if (declared !== row.length) noteMismatch(key, row.length, declared);
    if (modelFrames > 1 && modelFrames !== row.length) {
      noteMismatch(key, modelFrames, row.length);
    }

    var i = frame | 0;
    if (i < 0) i = 0;
    if (i > row.length - 1) i = row.length - 1;
    var p = row[i];
    return (p && p.length === 3) ? p : stat;
  }

  // Is the live spec actually driving the origin per frame, or is this the
  // static fallback? Exported so a test can assert which of the two it just
  // measured instead of photographing a plausible still.
  function originAnimated(tower) {
    var sp = spec();
    var table = sp && sp.originFrames;
    if (!table) return false;
    var row = table[bodyKey(tower)];
    return !!(row && row.length > 1);
  }

  // ---- the shared animation frame -----------------------------------------
  //
  // ONE PLACE. gl-world.js draws the Siphon's body at this frame and this file
  // reads the ring's position FOR THAT FRAME. If the two derived it separately
  // they would drift the moment either was tuned, and the cord would sit a few
  // pixels off the ring -- which looks like suki's problem and is not.
  //
  // THE TRAP, and the reason this is not a pure function. `_chanEase` is the
  // ease toward "he is channelling", MUTATED once per step at 0.06. This
  // function is called AT LEAST TWICE per rendered frame -- once from the GL
  // body pass (gl-world's tower loop) and once from the overlay pass (this
  // file's draw) -- so stepping the ease per call would spin the animation up
  // at twice its designed rate, and a 0.4 s ramp measured at 0.2 s is exactly
  // the sort of wrongness nobody reports because it still looks like an ease.
  //
  // So the step is memoised on the tower, keyed by `now`: the ease advances
  // only when the render clock has actually moved, and every later caller in
  // the same rendered frame reads the same value. A paused game holds `now`
  // still and therefore holds both the ease and the frame still, which is what
  // the beam already does and is correct.
  //
  // The FRAME is not cached, only the ease step, so two callers holding models
  // with different frame counts each get a right answer for their own strip
  // rather than whichever of them asked first.
  var CHAN_EASE = 0.06;        // per rendered frame -- ~0.4 s either way at 60
  var CHAN_ON = 0.02;          // below this he is at rest, and rest is frame 0
  var CHAN_SPIN = 0.42;        // Hz

  function animFrame(tower, now, frameCount) {
    if (!tower) return 0;
    var t = now || 0;
    if (tower._chanEase === undefined) tower._chanEase = 0;
    if (tower._chanStamp !== t) {
      var want = (tower.locks && tower.locks.length) ? 1 : 0;
      tower._chanEase += (want - tower._chanEase) * CHAN_EASE;
      tower._chanStamp = t;
    }
    var n = frameCount | 0;
    // Remembered for originPoint's mismatch check -- it is the only honest
    // reading of how many frames the body on screen actually has, and only the
    // GL pass knows it.
    if (n > 1) tower._chanFrames = n;
    if (n < 2 || tower._chanEase <= CHAN_ON) return 0;
    var ph = (((t * CHAN_SPIN) % 1) + 1) % 1;
    return 1 + Math.min(n - 2, Math.floor(ph * (n - 1)));
  }

  // How far the per-target ramp has climbed, 0..1. This is the ONE continuously
  // varying quantity the spec admits ("rampT is the lock timer") and it is read
  // straight off the simulation's own tracker rather than timed here, so the
  // cord cannot disagree with the damage.
  function rampOf(tower, target) {
    var st = tower.core && tower.core.stats;
    var mech = st && st.mechanics && st.mechanics.ramp_per_target;
    var cap = mech ? (mech.rampCap || 0) : 0;
    if (cap <= 0 || !tower.ramp || typeof tower.ramp.multiplier !== "function") {
      return 0;
    }
    var m = tower.ramp.multiplier(target);
    return isFinite(m) ? clamp((m - 1) / cap, 0, 1) : 0;
  }

  // Which state this tower is in. Grounded in the simulation, not in a
  // cosmetic timer:
  //
  //   no lock            -> null      (nothing is drawn; see THE IDLE CORD IS
  //                                    GONE at the top of draw())
  //   A5                 -> column
  //   A3 / A4            -> gold
  //   B3+ , >1 lock      -> chain     (it bounces; it does not fork -- see below)
  //   B3+ , one lock     -> tendon
  //   otherwise          -> the base ladder: thread -> ramp -> saturated, whose
  //                         position is rampT. At base rampCap is 0, so rampT
  //                         never leaves 0 and the cord stays `thread` -- which
  //                         is exactly what the spec means by tagging thread
  //                         `path: BASE` and ramp/saturated `path: A`.
  function stateFor(tower, lockCount, ramp) {
    var t = tiers(tower);
    // NO LOCK, NO CORD. This returned "seeking" until 2026-08-12; the idle
    // state was removed, so there is no name to give and null says so. Callers
    // hand this to stateSpec(), which returns undefined for it and draws
    // nothing -- but draw() does not rely on that, it bails on `live` first.
    if (lockCount <= 0) return null;
    if (t.a >= 5) return "column";
    if (t.a >= 3) return "gold";
    if (t.b >= 3) return lockCount > 1 ? "chain" : "tendon";
    if (ramp >= 0.78) return "saturated";
    if (ramp >= 0.30) return "ramp";
    return "thread";
  }

  // ---- the flow coordinate -------------------------------------------------
  //
  // THIS IS THE MECHANISM THAT MAKES THE BEAM READ AS FLOWING INWARD, so it is
  // worth stating plainly.
  //
  // Every state's spec gives a scroll law, speed(t) = base*(1 + gain*(1-t)^p),
  // and every one of them is FASTER near the tower (t = 0). If knots were laid
  // out uniformly in t and marched uniformly in t, that law would be decoration
  // -- the knots would crawl at one speed and the only inward cue left would be
  // the taper.
  //
  // Instead each knot carries a flow coordinate C, and C -- not t -- is what
  // advances linearly with time. C is the time-of-travel integral
  //
  //     C(t) = INT_t^1 dt' / speed(t')   , normalised so C(1)=0 and C(0)=1
  //
  // so a knot at C moves through t at exactly the local speed the spec asks
  // for. Near the target it inches; as it closes on the tower it visibly picks
  // up and is swallowed. Matter accelerating into a point is the single most
  // unambiguous way to say "this is being drawn in", and it costs one table
  // lookup: the table depends only on (base, gain, p), so there are eight of
  // them for the whole game and they are built once.
  //
  // C is also what the transfer boluses ride, which is why a bolus accelerates
  // toward the tower for free.

  var FLOW_N = 40;
  var flowCache = Object.create(null);

  function flowTable(base, gain, p) {
    var id = base + "|" + gain + "|" + p;
    var got = flowCache[id];
    if (got) return got;
    // C[i] at t = i/FLOW_N, integrated from t = 1 downward.
    var C = new Float64Array(FLOW_N + 1);
    var acc = 0, dt = 1 / FLOW_N;
    C[FLOW_N] = 0;
    for (var i = FLOW_N - 1; i >= 0; i--) {
      var tm = (i + 0.5) / FLOW_N;
      var v = base * (1 + gain * Math.pow(1 - tm, p));
      acc += dt / Math.max(0.02, v);
      C[i] = acc;
    }
    var total = acc || 1;
    for (var j = 0; j <= FLOW_N; j++) C[j] /= total;
    var table = { C: C };
    flowCache[id] = table;
    return table;
  }

  // C -> t. C is monotone decreasing in i, so walk it.
  function flowInverse(table, c) {
    var C = table.C;
    c = c - Math.floor(c);
    // C[0] = 1 (tower), C[FLOW_N] = 0 (target).
    for (var i = 0; i < FLOW_N; i++) {
      if (C[i] >= c && c >= C[i + 1]) {
        var span = C[i] - C[i + 1];
        var f = span > 1e-9 ? (C[i] - c) / span : 0;
        return (i + f) / FLOW_N;
      }
    }
    return 1;
  }

  function flowAt(table, t) {
    var x = clamp(t, 0, 1) * FLOW_N;
    var i = Math.min(FLOW_N - 1, Math.floor(x));
    return lerp(table.C[i], table.C[i + 1], x - i);
  }

  // ---- the states, resolved from the spec ---------------------------------
  //
  // The spec stores radius as a FORMULA STRING plus its numbers, because a JSON
  // file cannot store a branch. The branch lives here, keyed by state name, and
  // every number it uses is still read out of the spec.

  function stateSpec(name) {
    var sp = spec();
    return (sp && sp.states && sp.states[name]) || null;
  }

  // Blender units at parameter t, before the intake bell.
  function radiusAt(name, ss, t, ramp) {
    var r = ss.radius || {};
    var inward = 1 - t;
    if (name === "saturated" || name === "column") {
      // STEPPED. Drums that step wider inward -- the spec's own formula.
      var drums = r.drums || 4;
      var step = Math.min(drums - 1, Math.floor(inward * drums));
      return lerp(r.r_target, r.r_tower, drums > 1 ? step / (drums - 1) : 0);
    }
    if (name === "ramp") {
      // The one continuously-varying state. The spec hands over both ends of
      // the interpolation in `rampT_ends`, and they are exactly thread's and
      // saturated's radii -- so the base ladder never steps, it swells.
      var ends = r.rampT_ends || { "0.0": [0.018, 0.04], "1.0": [0.0455, 0.083] };
      var lo = ends["0.0"], hi = ends["1.0"];
      var rt = lerp(lo[0], hi[0], ramp), rw = lerp(lo[1], hi[1], ramp);
      return rt + (rw - rt) * Math.pow(inward, r.p || 1.4);
    }
    return (r.r_target || 0.02) +
      ((r.r_tower || 0.04) - (r.r_target || 0.02)) * Math.pow(inward, r.p || 1.35);
  }

  // THE INTAKE. The tower end opens; the enemy end does not. `spout` is one of
  // the spec's four permitted flow cues and the states that list it get the
  // full flare the reference meshes were built with (thread's flowReads: "the
  // body swells 2.2x into a flared intake"). The two that do not still swell --
  // a mouth is a mouth -- but only a quarter as much.
  function bellAt(ss, t) {
    var cues = ss.flowCues || [];
    var full = cues.indexOf("spout") >= 0;
    var peak = full ? 2.2 : 1.28;
    // Confined to the last eighth so it reads as a mouth on the cord rather
    // than as a cone, which would point the wrong way.
    return 1 + (peak - 1) * smoothstep(0.14, 0.0, t);
  }

  // Which palette entry plays which role. Every key below is a real entry in
  // SiphonBeamSpec.palette and every one is drawn from that state's own `mats`
  // list, so a state cannot be painted in a colour its spec does not own.
  var ROLES = {
    thread:    { body: "cloth_worn",  core: "skin",       bead: "hem_fray",  rim: "cloth_dark",  glow: null },
    ramp:      { body: "brass",       core: "amber",      bead: "amber",     rim: "gold_dark",   glow: "amber" },
    saturated: { body: "gold_dark",   core: "white_warm", bead: "amber",     rim: "ochre_cloth", glow: "amber" },
    gold:      { body: "gold",        core: "white_warm", bead: "gold",      rim: "gold_dark",   glow: "amber" },
    column:    { body: "gold",        core: "white_warm", bead: "gold",      rim: "purple_rich", glow: "white_warm" },
    tendon:    { body: "tendon",      core: "rose_sick",  bead: "oil_black", rim: "oil_black",   glow: "rose_sick" },
    chain:     { body: "membrane",    core: "rose_sick",  bead: "rose_dim",  rim: "oil_black",   glow: "rose_sick" }
  };

  // How the knots are drawn. `wedge` is the chevron; `box` is gold's cast
  // grain; `constriction` is the tendon's peristaltic pinch, which is a band
  // ACROSS the cord rather than a point along it -- its direction comes from
  // travelling inward and from each being larger than the one behind it.
  var BEAD_SHAPE = {
    thread: "wedge", ramp: "wedge", saturated: "wedge",
    gold: "box", column: "wedge", tendon: "constriction", chain: "wedge"
  };

  // ---- scratch -------------------------------------------------------------
  //
  // Grown once, reused for every beam of every frame. A beam samples at most
  // MAXS points; a chain concatenates its segments into the same buffers.

  var MAXS = 96;
  var sx = new Float64Array(MAXS), sy = new Float64Array(MAXS);
  var ss = new Float64Array(MAXS);          // projected px-per-world-px
  var st = new Float64Array(MAXS);          // parameter t, 0 at tower
  var nx = new Float64Array(MAXS), ny = new Float64Array(MAXS);   // screen normal
  var hw = new Float64Array(MAXS);          // screen half-width
  var cc = new Float64Array(MAXS);          // flow coordinate
  var seg = new Int32Array(MAXS);           // chain segment index
  var sd = new Float64Array(MAXS);          // projected depth (camera w)
  var sz = new Float64Array(MAXS);          // ABSOLUTE world height of the sample
  var sv = new Uint8Array(MAXS);            // 1 = this sample is not occluded
  var nS = 0;

  // ---- per-tower records ---------------------------------------------------

  var records = (typeof Map !== "undefined") ? new Map() : null;
  var seen = 0;

  function recordFor(tower) {
    if (!records) return null;
    var r = records.get(tower);
    if (!r) {
      r = { hp: tower.hpHealed || 0, gold: tower.goldGenerated || 0,
            pulses: [], now: 0, mark: 0 };
      records.set(tower, r);
    }
    r.mark = seen;
    return r;
  }

  function prune() {
    if (!records) return;
    records.forEach(function (r, t) {
      if (r.mark !== seen) records.delete(t);
    });
  }

  function reset() { if (records) records.clear(); }

  // ---- geometry ------------------------------------------------------------

  var SIPHON_YAW = -Math.PI / 2;   // gl-world's authoredFrontOffset for /^siphon-/

  function unitsToPx() {
    if (typeof GLModels !== "undefined" && GLModels.unitsToPx) {
      var k = GLModels.unitsToPx("siphon-base");
      if (k && k > 1.5) return k;
    }
    var sp = spec();
    return (sp && sp.unitsToPx) || 31.8032;
  }

  // Board px per u.l., for scaling the spec's bead counts (which are quoted at
  // a 60 u.l. run) to the run this beam actually has.
  function pxPerUl() {
    if (typeof ul === "function") {
      var v = ul(1);
      if (isFinite(v) && v > 0.01) return v;
    }
    return 1;
  }

  // The origin, in ABSOLUTE world coordinates. This reproduces by hand the
  // transform drawActor used on the body (gl-world.js:908) -- the same yaw, the
  // same uniform scale, the same ground -- which is the only thing that keeps
  // the cord welded to the hands instead of hanging near them. The yaw includes
  // gl-world's authored-front correction because every siphon-* model is
  // authored with front on +Y.
  var originScratch = { x: 0, y: 0, z: 0 };

  function originWorld(tower, groundAt, frame) {
    var p = originPoint(tower, frame);
    var aim = (typeof tower.aim === "number" && isFinite(tower.aim)) ? tower.aim : 0;
    var yaw = aim + SIPHON_YAW;
    var k = unitsToPx(), c = Math.cos(yaw), s = Math.sin(yaw);
    originScratch.x = tower.x + (c * p[0] - s * p[1]) * k;
    originScratch.y = tower.y + (s * p[0] + c * p[1]) * k;
    originScratch.z = groundAt(tower.x, tower.y) + p[2] * k;
    return originScratch;
  }

  // Where the cord bites. Chest height on the body, from the enemy's own
  // radius, so it scales with a brute and with a fractal split alike.
  function biteHeight(enemy) {
    var r = (enemy && typeof enemy.radiusPx === "function") ? enemy.radiusPx() : 11;
    return r * 1.35;
  }

  // ---- sampling ------------------------------------------------------------
  //
  // One run, tower -> target, laid down into the scratch buffers. Returns false
  // if any sample failed to project (behind the camera), because half a beam is
  // worse than none.

  function sampleRun(project, ax, ay, az, bx, by, bz, curve, phase,
                     i0, n, tFrom, tTo, segIndex) {
    var dx = bx - ax, dy = by - ay;
    var flat = Math.sqrt(dx * dx + dy * dy) || 1;
    // Horizontal normal, for sway and kink.
    var px = -dy / flat, py = dx / flat;
    var sag = curve.sag || 0, sway = curve.sway || 0;
    var kink = curve.kink || 0, kn = curve.kink_n || 3;

    for (var i = 0; i < n; i++) {
      var u = n > 1 ? i / (n - 1) : 0;
      var t = lerp(tFrom, tTo, u);
      // `arc` peaks mid-run and is zero at both ends, so neither the hands nor
      // the bite can be pulled off the thing they are attached to.
      var arc = Math.sin(u * Math.PI);
      var wob = kink ? Math.sin(u * kn * Math.PI + phase) * arc : 0;
      var ox = (sway * arc + kink * wob) * flat;
      var wx = lerp(ax, bx, u) + px * ox;
      var wy = lerp(ay, by, u) + py * ox;
      // sag pulls DOWN; column's negative sag therefore arches, as its spec
      // note demands ("it ARCHES: a column carries load").
      var wz = lerp(az, bz, u) - sag * arc * flat;
      var p = project(wx, wy, wz);
      if (!p) return false;
      var k = i0 + i;
      sx[k] = p.x; sy[k] = p.y; ss[k] = p.scale;
      st[k] = t; seg[k] = segIndex;
      // DEPTH AND HEIGHT, KEPT. `project` has always returned `out.depth = w`
      // (gl-camera.js:252) and this loop has always thrown it away. It is the
      // only depth information a 2D overlay can have, and without it a cord
      // behind a tower is indistinguishable from a cord in front of one. `wz`
      // is kept beside it because the occluders below compare depths AT THE
      // SAME HEIGHT -- see the note there for why the base depth alone lies.
      sd[k] = p.depth; sz[k] = wz;
    }
    return true;
  }

  // ---- occlusion -----------------------------------------------------------
  //
  // THE COMPLAINT: "the siphon's passive rays are seeable through everything,
  // other towers included." They are, and structurally: the cords are painted
  // in gl-world's `drawOverlays` on the 2D canvas STACKED OVER the WebGL one,
  // and that canvas carries no depth information at all. Everything drawn on it
  // is drawn over the whole board by construction.
  //
  // WHY THIS IS SCREEN-SPACE CAPSULES AND NOT SOMETHING BETTER. Decided after a
  // three-way comparison; recorded so it is not relitigated:
  //
  //   - Moving the cords into the GL pass. gl-renderer.js is STATIC_DRAW with
  //     no BLEND, so a cord that moves every frame means streaming buffers plus
  //     a blend mode -- and it would STILL lose the halo, the rim and the lifted
  //     core, which are the three things keeping the one non-emissive state
  //     (thread) legible against the board.
  //   - Reading the depth buffer. WebGL cannot. `readPixels` on the colour
  //     buffer can, and js/gl/tower-preview.js measures it at 3.6-7.1 ms a call,
  //     which is a frame budget for one query.
  //
  // So: the same trick js/gl/siphon-ground.js:797 already uses for the gold
  // pour -- a screen box plus a depth compare, because `project` returns both.
  // That module is dead code (in no script tag, referenced by nothing), which
  // made it a free reference implementation, and this is its structure with
  // three deliberate departures. All three are named below.
  //
  // DEPARTURE 1 -- NO PROXIMITY GATE. That module skips any occluder more than
  // 70 world px from the sample. It can: it masks a decal lying under the
  // tower's own feet. A cord runs up to 180 px, so the same gate would exempt
  // very nearly every occluder it crosses -- which is the whole defect. The
  // test here is the screen-space overlap and the depth compare, and nothing
  // else. (There IS a screen-bounding-box prefilter below, but that is a
  // broad phase for the exact test, not a rule: it can produce no false
  // negatives.)
  //
  // DEPARTURE 2 -- THE DEPTH COMPARE IS MADE AT THE SAMPLE'S OWN HEIGHT. That
  // module stores one depth, the tower's base at z = 0, and compares every
  // sample against it. `worldToScreen` sets `depth = w`, the homogeneous
  // divide, so bigger is farther -- and under a downward pitch a point HIGHER
  // UP is nearer the eye and has a SMALLER depth. Measured on the live camera
  // at the Siphon's own footing: z = 0 -> 175.24, z = 30 -> 158.30,
  // z = 60 -> 141.36. A tower's base is therefore the FARTHEST point of its own
  // vertical extent, and a cord crossing its chest or its head compares against
  // that base, comes out smaller, is judged "in front" and is drawn straight
  // through -- through most of the tower, and only the strip near its feet
  // would have worked. A verification that sampled near the ground would pass
  // while the visible half of the defect stood untouched.
  //
  //   The fix costs nothing, because `w` is AFFINE in world position: it is
  //   vp[3]*x + vp[7]*y + vp[11]*z + vp[15], so depth along an actor's vertical
  //   axis is exactly linear in z. Two projections give the slope, and the
  //   occluder's depth at any height is one multiply-add. Verified against the
  //   numbers above: 175.24 - 0.5647*z reproduces both to the last digit, where
  //   interpolating by SCREEN Y instead is out by 5% at mid-body.
  //
  // DEPARTURE 3 -- THE CROWN IS MEASURED, NOT GUESSED. That module falls back
  // to `b0.y - 40` when the crown fails to project. A crown that is too short
  // under-occludes the top of the body: the same failure as departure 2, from
  // the other end. gl-world's `crownOf` reads the model's own `top`, and this
  // takes it through `api.towerTop` / `api.enemyTop` -- the same measurement
  // without the readout headroom `crownOf` adds for a health bar.
  //
  // ---------------------------------------------------------------------------
  // THE LIMITATION, STATED WHERE THE EXEMPTION IS WRITTEN
  // ---------------------------------------------------------------------------
  //
  // THIS CANNOT HIDE A CORD BEHIND THE CASTER'S OWN BODY. The cord's origin is
  // the Siphon's hands or the ring on his sceptre; both sit INSIDE his own
  // footprint, a little above it. Every cord therefore begins inside the
  // caster's own occluder, and if he were allowed to occlude his own cords, the
  // root of every one of them -- the intake bell, the fattest and most
  // load-bearing part of the whole effect, the thing that carries the "it flows
  // TOWARD the tower" message -- would be cut off. So he is exempt, in full, at
  // any range. The visible consequence: stand a Siphon so that one of his own
  // cords swings behind his shoulder and that stretch will draw over him.
  // Nothing here fixes that, and nothing cheap can: it needs per-pixel depth for
  // the caster alone, which is the readback this approach exists to avoid.
  // Every OTHER tower, every blub and every enemy does occlude him normally.

  var OCC_MAX = 128;
  var occ = [];
  var occHit = new Int32Array(OCC_MAX);
  var occN = 0;
  var occlusionOn = true;      // module flag; see setOcclusion()

  function occSlot(i) {
    var o = occ[i];
    if (!o) {
      o = { actor: null, x0: 0, y0: 0, x1: 0, y1: 0, r0: 0, r1: 0,
            d0: 0, dPerZ: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, nearest: 0 };
      occ[i] = o;
    }
    return o;
  }

  // One capsule per actor: the segment from its feet to the top of its model,
  // in screen space, with the actor's own authored radius for a thickness --
  // flat-capped, for the reason axisDistSq gives at length. Both ends are
  // projected, so it leans exactly as the body leans under an orbited camera
  // and nothing has to assume the world's up is the screen's up.
  //
  // Called ONCE per frame, from draw(), inside the same pinned `withGround(0)`
  // the cords are sampled in -- so every z here is absolute and comparable with
  // `sz[]` without a second thought about which surface it was measured from.
  function pushOccluder(actor, project, footX, footY, groundZ, radiusPx, topPx) {
    if (occN >= OCC_MAX) return;
    if (!(topPx > 0.5) || !(radiusPx > 0.01)) return;
    var pb = project(footX, footY, groundZ);
    if (!pb) return;
    var topZ = groundZ + topPx;
    var pt = project(footX, footY, topZ);
    if (!pt) return;
    var o = occSlot(occN++);
    o.actor = actor;
    o.x0 = pb.x; o.y0 = pb.y; o.r0 = radiusPx * (pb.scale || 1);
    o.x1 = pt.x; o.y1 = pt.y; o.r1 = radiusPx * (pt.scale || 1);
    o.d0 = pb.depth;
    // Depth is affine in world position, so this slope is exact rather than a
    // fit. Guarded anyway: a degenerate topPx would divide by nothing.
    o.dPerZ = (topPx > 1e-6) ? (pt.depth - pb.depth) / topPx : 0;
    // The base of a standing body is its farthest point, so this is the whole
    // capsule's nearest depth -- used to reject, in one compare, an occluder
    // that is behind every sample of the cord being tested.
    o.nearest = Math.min(pb.depth, pt.depth);
    var r = Math.max(o.r0, o.r1);
    o.minX = Math.min(o.x0, o.x1) - r; o.maxX = Math.max(o.x0, o.x1) + r;
    o.minY = Math.min(o.y0, o.y1) - r; o.maxY = Math.max(o.y0, o.y1) + r;
  }

  function buildOccluders(state, api) {
    occN = 0;
    if (!occlusionOn) return;
    var project = api.project, groundAt = api.groundAt;
    var i, a;
    var list = state.towers || [];
    for (i = 0; i < list.length; i++) {
      a = list[i];
      if (!a || a.dead) continue;
      // `footprintPx` is the authored placement radius -- the actual width of
      // the thing on the board -- so it is used as-is. No widening factor: an
      // occluder wider than its body over-occludes, and over-occlusion is the
      // failure that photographs as success.
      pushOccluder(a, project, a.x, a.y, groundAt(a.x, a.y),
        a.footprintPx || 12,
        (api.towerTop ? api.towerTop(a) : (a.footprintPx || 12) * 2.2));
    }
    // ENEMIES TOO, and they are the commoner case. The complaint says "seeable
    // through everything"; a body walking the road in front of a cord is what a
    // player is looking at far more often than a second tower.
    list = state.enemies || [];
    for (i = 0; i < list.length; i++) {
      a = list[i];
      if (!a || a.dead || a.leaked || !a.pos) continue;
      var r = (typeof a.radiusPx === "function") ? a.radiusPx() : 11;
      pushOccluder(a, project, a.pos.x, a.pos.y, groundAt(a.pos.x, a.pos.y), r,
        (api.enemyTop ? api.enemyTop(a) : r * 2.2));
    }
  }

  // Squared PERPENDICULAR distance from a screen point to the capsule's axis,
  // and the parameter along that axis in `capT` -- so the radius can be taken
  // at the right end of the body.
  //
  // FLAT CAPS, AND THIS WAS MEASURED, NOT ASSUMED. Clamping the parameter to
  // [0, 1] before measuring -- the usual capsule form, and what a naive reading
  // of "capsule" gives you -- puts a hemispherical dome of one full radius
  // above the model's head and another below its feet. Measured on a Smasher at
  // this camera: screen radius 37 px, so a cord passing 26 px CLEAR of its
  // crown was being hidden by a dome that stands in for nothing. And it
  // photographs as a success: the cord vanishes behind a tower, which is the
  // thing being asked for, just not for the reason claimed.
  //
  // So the caller rejects any sample outside t = 0..1 and this measures to the
  // infinite line. The occluder is a rectangle from the feet to the measured
  // top, leaning exactly as the projected body leans -- which never claims the
  // body occupies space it does not.
  var capT = 0;

  function axisDistSq(o, x, y) {
    var ax = o.x1 - o.x0, ay = o.y1 - o.y0;
    var len2 = ax * ax + ay * ay;
    if (len2 <= 1e-9) { capT = 0; var qx = x - o.x0, qy = y - o.y0; return qx * qx + qy * qy; }
    var t = ((x - o.x0) * ax + (y - o.y0) * ay) / len2;
    capT = t;
    if (t < 0 || t > 1) return 1e30;          // past an end: flat cap, no dome
    var dx = x - (o.x0 + ax * t), dy = y - (o.y0 + ay * t);
    return dx * dx + dy * dy;
  }

  // The predicate. `caster` is exempted for the reason stated at length above.
  // Exported, so a review can ask it directly rather than inferring it.
  function occluded(x, y, depth, worldZ, caster) {
    if (!occlusionOn) return false;
    for (var i = 0; i < occN; i++) {
      var o = occ[i];
      if (o.actor === caster) continue;               // THE LIMITATION. See above.
      if (x < o.minX || x > o.maxX || y < o.minY || y > o.maxY) continue;
      if (depth <= o.nearest) continue;               // in front of all of it
      var d2 = axisDistSq(o, x, y);
      var r = o.r0 + (o.r1 - o.r0) * capT;
      if (d2 > r * r) continue;
      // The compare, at the sample's OWN height. Departure 2.
      if (depth <= o.d0 + o.dPerZ * worldZ) continue;
      return true;
    }
    return false;
  }

  // Fill sv[0..n-1]. One screen bounding box for the whole cord prefilters the
  // occluder list, which is what keeps this affordable with three hundred blubs
  // on the board: the inner loop then runs only over occluders that could
  // possibly touch this cord.
  var visN = 0;

  // THE SIPHON OCCLUDES ITS OWN CORDS, EXCEPT ACROSS THE ROOT.
  //
  // Until 2026-08-12 the caster was exempt from its own capsule, so every cord
  // it cast was drawn straight across its own chest. The owner overruled that:
  // a cord should be seeable through nothing, its own body included.
  //
  // But the cord ORIGINATES at the sceptre ring or the hands, which sit inside
  // or against that same capsule -- so a naive self-occlusion clips the cord at
  // its own attachment and leaves it floating unattached, which reads worse
  // than the fault it fixes. The first ROOT_FREE samples therefore ignore THE
  // CASTER ONLY; every other occluder still applies to them, and from there on
  // the caster is an occluder like any other.
  //
  // WHAT WAS ACTUALLY MEASURED FOR THIS 2, so nobody inherits a false claim:
  // with ROOT_FREE = 2 the root run still draws (4.8 px at the default camera,
  // 16.7 px at distance 600) and leak beyond the root is 0 at all 24 phases of a
  // full filament sweep. Values of 1 and 3 were NOT tested -- 2 is the first
  // value that met the acceptance test, not a proven optimum. If the attachment
  // ever reads badly, re-measure rather than nudging this.
  var ROOT_FREE = 2;

  function computeVisibility(n, caster) {
    var i;
    visN = 0;
    if (!occlusionOn || !occN) {
      for (i = 0; i < n; i++) sv[i] = 1;
      visN = n;
      return;
    }
    var lo = 1e9, hi = -1e9, loY = 1e9, hiY = -1e9, far = -1e9;
    for (i = 0; i < n; i++) {
      var pad = hw[i] * 2.4;              // the halo is the widest layer drawn
      if (sx[i] - pad < lo) lo = sx[i] - pad;
      if (sx[i] + pad > hi) hi = sx[i] + pad;
      if (sy[i] - pad < loY) loY = sy[i] - pad;
      if (sy[i] + pad > hiY) hiY = sy[i] + pad;
      if (sd[i] > far) far = sd[i];
    }
    var live = 0, j;
    for (i = 0; i < occN; i++) {
      var o = occ[i];
      if (o.maxX < lo || o.minX > hi || o.maxY < loY || o.minY > hiY) continue;
      if (o.nearest >= far) continue;     // behind every sample of this cord
      occHit[live++] = i;
    }
    if (!live) {
      for (i = 0; i < n; i++) sv[i] = 1;
      visN = n;
      return;
    }
    for (i = 0; i < n; i++) {
      var vis = 1;
      for (j = 0; j < live; j++) {
        var q = occ[occHit[j]];
        // THE ROOT STAYS ATTACHED. Everything else about the caster occludes.
        if (q.actor === caster && i < ROOT_FREE) continue;
        if (sx[i] < q.minX || sx[i] > q.maxX ||
            sy[i] < q.minY || sy[i] > q.maxY) continue;
        if (sd[i] <= q.nearest) continue;
        var d2 = axisDistSq(q, sx[i], sy[i]);
        var r = q.r0 + (q.r1 - q.r0) * capT;
        if (d2 > r * r) continue;
        if (sd[i] <= q.d0 + q.dPerZ * sz[i]) continue;
        vis = 0;
        break;
      }
      sv[i] = vis;
      visN += vis;
    }
  }

  // EVERY LAYER RESPECTS THE SAME SPANS, or the cord is still visible through
  // the body -- as a halo, or as a rim outline, which is worse than the whole
  // cord because it reads as a rendering fault rather than as a beam. `ribbon`
  // already takes an index range, so a polyline simply becomes a list of them
  // and no new drawing primitive is needed.
  //
  // A span needs two samples to be a ribbon at all, so an isolated visible
  // sample between two occluded ones is dropped. At 8..22 samples over a run
  // that is a sub-sample-length sliver, and dropping it errs toward hiding
  // rather than toward showing through.
  function eachSpan(i0, i1, fn) {
    var s = -1, i;
    for (i = i0; i <= i1; i++) {
      if (sv[i]) { if (s < 0) s = i; continue; }
      if (s >= 0 && i - 1 > s) fn(s, i - 1);
      s = -1;
    }
    if (s >= 0 && i1 > s) fn(s, i1);
  }

  // Screen-space normals from the projected polyline. Derived from the PROJECTED
  // points, not from the world direction, for the reason gl-world's `barrelAxis`
  // gives: under a turning camera the cord's direction on screen is not its
  // direction in the world.
  function normals(n) {
    for (var i = 0; i < n; i++) {
      var a = i > 0 ? i - 1 : i;
      var b = i < n - 1 ? i + 1 : i;
      var dx = sx[b] - sx[a], dy = sy[b] - sy[a];
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) { nx[i] = 0; ny[i] = -1; continue; }
      nx[i] = -dy / len; ny[i] = dx / len;
    }
  }

  // ---- ribbon --------------------------------------------------------------

  function ribbon(ctx, i0, i1, mul) {
    ctx.beginPath();
    var i;
    for (i = i0; i <= i1; i++) {
      var x = sx[i] + nx[i] * hw[i] * mul, y = sy[i] + ny[i] * hw[i] * mul;
      if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (i = i1; i >= i0; i--) {
      ctx.lineTo(sx[i] - nx[i] * hw[i] * mul, sy[i] - ny[i] * hw[i] * mul);
    }
    ctx.closePath();
  }

  // ---- knots ---------------------------------------------------------------
  //
  // Position by flow coordinate, size by the radius law, orientation by the
  // screen tangent. All three say the same thing.

  function sampleIndexAt(n, t) {
    // st[] runs tFrom -> tTo monotonically per segment; for a single run that
    // is 0 -> 1 across the whole buffer.
    var lo = 0, hi = n - 1;
    if (t <= st[0]) return 0;
    if (t >= st[n - 1]) return n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (st[mid] <= t) lo = mid; else hi = mid;
    }
    var span = st[hi] - st[lo];
    return lo + (span > 1e-9 ? (t - st[lo]) / span : 0);
  }

  function beadAt(n, t, out) {
    var f = sampleIndexAt(n, t);
    var i = Math.min(n - 2, Math.floor(f)), g = f - i;
    out.x = lerp(sx[i], sx[i + 1], g);
    out.y = lerp(sy[i], sy[i + 1], g);
    out.nx = lerp(nx[i], nx[i + 1], g);
    out.ny = lerp(ny[i], ny[i + 1], g);
    out.hw = lerp(hw[i], hw[i + 1], g);
    out.scale = lerp(ss[i], ss[i + 1], g);
    // Tangent pointing TOWARD THE TOWER, i.e. toward decreasing t. sx[0] is the
    // tower end, so that is the direction of decreasing index.
    var tx = sx[i] - sx[i + 1], ty = sy[i] - sy[i + 1];
    var len = Math.sqrt(tx * tx + ty * ty) || 1;
    out.tx = tx / len; out.ty = ty / len;
    return out;
  }

  var bead = { x: 0, y: 0, nx: 0, ny: 0, tx: 0, ty: 0, hw: 0, scale: 1 };

  // A knot rides the cord, so it is hidden exactly when the cord under it is.
  // Asked at BOTH samples it sits between rather than at a rounded one: a knot
  // straddling the edge of a body should disappear with the stretch it belongs
  // to, not survive as a chevron pasted on a chest.
  function beadVisible(n, t) {
    var f = sampleIndexAt(n, t);
    var i = Math.min(n - 2, Math.max(0, Math.floor(f)));
    return !!(sv[i] && sv[i + 1]);
  }

  // ---- one beam ------------------------------------------------------------

  var MIN_CORE_PX = 1.15;   // a thread must still be a thing you can see
  var MIN_BODY_PX = 2.10;

  function drawBeam(ctx, api, tower, name, ramp, nodes, now, rec) {
    var ss2 = stateSpec(name);
    if (!ss2) return;
    var project = api.project, groundAt = api.groundAt;
    var role = ROLES[name] || ROLES.thread;
    var curve = ss2.curve || {};
    var scroll = ss2.scroll || { base: 0.5, gain: 0.5, p: 1 };
    var flow = flowTable(scroll.base || 0.5, scroll.gain || 0, scroll.p || 1);

    // ---- lay the run(s) down ----------------------------------------------
    var segs = nodes.length - 1;
    var per = clamp(Math.round((ss2.sections || 14) / (segs > 1 ? 1.4 : 1)), 8, 22);
    var n = 0;
    var kink = curve.kink || 0;
    var phase = now * 1.1;
    for (var s = 0; s < segs; s++) {
      var a = nodes[s], b = nodes[s + 1];
      // Each segment owns its slice of the global t. t = 0 at the tower and
      // t = 1 at the LAST node, so the flow law and the knots run continuously
      // along the whole chain -- the spec's "arc-length along the whole chain,
      // target -> tower".
      var tA = s / segs, tB = (s + 1) / segs;
      var cs = {
        sag: pickSeg(curve.sag, s), sway: pickSeg(curve.sway, s),
        kink: kink, kink_n: curve.kink_n
      };
      var take = (s === 0) ? per : per - 1;
      var from = (s === 0) ? tA : lerp(tA, tB, 1 / (per - 1));
      if (n + take > MAXS) break;
      if (!sampleRun(project, a.x, a.y, a.z, b.x, b.y, b.z, cs, phase,
                     n, take, from, tB, s)) return;
      n += take;
    }
    if (n < 2) return;
    nS = n;
    normals(n);

    // ---- widths ------------------------------------------------------------
    var k = unitsToPx();
    var boluses = rec ? rec.pulses : null;
    var i;
    for (i = 0; i < n; i++) {
      var t = st[i];
      var r;
      if (name === "chain") {
        r = chainRadius(ss2, seg[i], segs, st[i], per, n, i);
      } else {
        r = radiusAt(name, ss2, t, ramp);
      }
      r *= bellAt(ss2, t);
      cc[i] = flowAt(flow, t);
      // TRANSFER PULSES. A local swelling riding the same flow coordinate the
      // knots ride, so it accelerates toward the tower exactly as they do. This
      // is the ONLY event this file draws, and only for the states whose spec
      // says `pulses: transfer only`.
      if (boluses) {
        for (var q = 0; q < boluses.length; q++) {
          var d = (cc[i] - boluses[q].c) / 0.13;
          if (d > -3 && d < 3) r *= 1 + 0.85 * boluses[q].a * Math.exp(-d * d);
        }
      }
      hw[i] = r * k * ss[i];
    }
    // Legibility floor. The ladder is RELATIVE -- thread is still the thinnest
    // cord in the game and column still the fattest -- but a cord that lands
    // under a pixel is the bug this file exists to fix, so the tower end is not
    // allowed below MIN_BODY_PX. Applied as a single scale on the whole cord so
    // the taper, which is the GROW cue, is preserved exactly.
    var lift = MIN_BODY_PX / Math.max(0.001, hw[0]);
    if (lift > 1) for (i = 0; i < n; i++) hw[i] *= lift;

    // ---- who can see this cord ----------------------------------------------
    // Done here, after the widths, because the screen bounding box that
    // prefilters the occluder list is built out of them. Every layer below
    // paints per visible SPAN and nothing paints the whole range unconditionally
    // -- one layer that forgot would put a halo or a rim outline through the
    // body, which reads as a rendering fault rather than as a beam.
    computeVisibility(n, tower);
    if (!visN) return;

    // ---- paint -------------------------------------------------------------
    var last = n - 1;

    // The halo, for the states whose spec says they emit. The non-emissive
    // state (thread) gets none -- it is matter catching light, and its
    // legibility comes from the rim and the core below.
    if (role.glow && ss2.emits) {
      ctx.fillStyle = ink(role.glow, 0.1, 0.13);
      eachSpan(0, last, function (a, b) {
        ribbon(ctx, a, b, 2.35);
        ctx.fill();
      });
    }

    // The body. For the two states that RIPEN, the colour ramp is painted in
    // bands along the run -- the spec calls that ripening "itself a statement
    // of direction", and it is: amber at the far end through to white at the
    // ring, so the cord tells you which way it is going even in a still frame.
    var ripen = ss2.ripen;
    if (ripen && ripen.length > 1) {
      for (var bnd = 0; bnd < ripen.length - 1; bnd++) {
        // ripen is quoted from the far end inward, entry [t, mat].
        var t0 = ripen[bnd][0], t1 = ripen[bnd + 1][0];
        var i0 = Math.floor(sampleIndexAt(n, Math.max(t1, t0)));
        var i1 = Math.ceil(sampleIndexAt(n, Math.min(t1, t0)));
        i0 = clamp(i0, 0, last); i1 = clamp(i1, 0, last);
        if (i1 <= i0) continue;
        ctx.fillStyle = ink(ripen[bnd][1], 0, 0.95);
        eachSpan(i0, i1, function (a, b) {
          ribbon(ctx, a, b, 1);
          ctx.fill();
        });
      }
    } else {
      ctx.fillStyle = ink(role.body, 0, 0.93);
      eachSpan(0, last, function (a, b) {
        ribbon(ctx, a, b, 1);
        ctx.fill();
      });
    }

    // The rim. A dark edge is what separates a cord from the board behind it
    // without adding light -- which is how the two non-emissive states stay
    // visible while honouring "no emission anywhere in the base ladder".
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink(role.rim, 0, 0.75);
    eachSpan(0, last, function (a, b) {
      ribbon(ctx, a, b, 1);
      ctx.stroke();
    });

    // The core: the lit crown of the cord, offset a little toward the light so
    // the cord reads as round rather than as a flat strap.
    ctx.fillStyle = ink(role.core, ss2.emits ? 0.15 : 0, ss2.emits ? 0.92 : 0.72);
    eachSpan(0, last, function (a, b) {
      var j;
      ctx.beginPath();
      for (j = a; j <= b; j++) {
        var cxp = sx[j] + nx[j] * hw[j] * 0.26;
        var cyp = sy[j] + ny[j] * hw[j] * 0.26;
        var cw = Math.max(MIN_CORE_PX, hw[j] * 0.40);
        var px2 = cxp + nx[j] * cw, py2 = cyp + ny[j] * cw;
        if (j === a) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
      }
      for (j = b; j >= a; j--) {
        var cxq = sx[j] + nx[j] * hw[j] * 0.26;
        var cyq = sy[j] + ny[j] * hw[j] * 0.26;
        var cwq = Math.max(MIN_CORE_PX, hw[j] * 0.40);
        ctx.lineTo(cxq - nx[j] * cwq, cyq - ny[j] * cwq);
      }
      ctx.closePath();
      ctx.fill();
    });

    // ---- the knots ---------------------------------------------------------
    drawKnots(ctx, name, ss2, n, ramp, k, flow, now, role);

    // ---- the intake --------------------------------------------------------
    // The mouth at the tower end. Not a flash and not an icon: the swelling the
    // cord already has, closed off with a lip so it reads as an opening that
    // the cord is running into. It belongs to sample 0, so it is drawn only when
    // sample 0 survived -- an intake bell floating on a hidden cord root would
    // be the single most obvious leak of the lot.
    if (sv[0]) {
      var mouthW = hw[0];
      ctx.beginPath();
      ctx.moveTo(sx[0] + nx[0] * mouthW, sy[0] + ny[0] * mouthW);
      ctx.lineTo(sx[0] - nx[0] * mouthW, sy[0] - ny[0] * mouthW);
      ctx.lineWidth = Math.max(1.2, mouthW * 0.42);
      ctx.strokeStyle = ink(role.core, ss2.emits ? 0.35 : 0.12, ss2.emits ? 0.95 : 0.8);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.lineCap = "butt";
    }
  }

  // The chain's radius: THINNER OUTWARD, per segment, from the spec's own
  // table. The spec explains why in one line -- "the trunk carries the sum of
  // every bite, so the taper alone proves it does not split at the source" --
  // and that taper is the whole reason this state is allowed to touch several
  // enemies with one line.
  function chainRadius(ss2, s, segs, t, per, n, i) {
    var tab = (ss2.radius && ss2.radius.per_segment) || [[0.07, 0.047]];
    var idx = Math.min(tab.length - 1, s);
    var pair = tab[idx];
    // Position inside this segment, 0 at its tower-side end.
    var tA = s / segs, tB = (s + 1) / segs;
    var u = (tB - tA) > 1e-9 ? (t - tA) / (tB - tA) : 0;
    var rw = pair[0], rt = pair[1];
    if (s >= tab.length) {
      // Beyond the spec's three segments the taper simply keeps going at the
      // last ratio, so a B5 holding many locks still thins outward all the way.
      var ratio = tab[tab.length - 1][1] / tab[tab.length - 1][0];
      var f = Math.pow(ratio, s - tab.length + 1);
      rw *= f; rt *= f;
    }
    return lerp(rw, rt, clamp(u, 0, 1));
  }

  function pickSeg(v, s) {
    if (v === undefined || v === null) return 0;
    return (typeof v === "number") ? v : (v[Math.min(v.length - 1, s)] || 0);
  }

  function drawKnots(ctx, name, ss2, n, ramp, k, flow, now, role) {
    var bs = ss2.beads;
    if (!bs) return;
    var shape = BEAD_SHAPE[name] || "wedge";

    // The spec's counts are quoted at a 60 u.l. run; scale to the real one, as
    // its own `spacingNote` instructs.
    var sp = spec();
    var canon = (sp && sp.canonicalRunUl) || 60;
    var runPx = 0;
    for (var q = 1; q < n; q++) {
      var ddx = sx[q] - sx[q - 1], ddy = sy[q] - sy[q - 1];
      runPx += Math.sqrt(ddx * ddx + ddy * ddy);
    }
    var baseCount = countOf(bs);
    var count = clamp(Math.round(baseCount * (runPx / 46)), 3, 20);

    // ONE PHASE FOR ALL OF THEM, advancing in the flow coordinate -- so the
    // acceleration is entirely the warp's doing and no knot can drift out of
    // step with its neighbours.
    var phase = (now * (ss2.scroll ? (ss2.scroll.base || 0.5) : 0.5) * 0.9) % 1;
    // A state's beads start at its spec's `t_from`, so a state can keep its
    // last stretch bare. (`seeking` was the one that used it; it is no longer
    // drawn, and every state still reads its own value here.)
    var tFrom = (bs.t_from !== undefined) ? bs.t_from : 1;

    var twist = ss2.twist || {};
    var tw = twist.total || 0, twp = twist.p || 1;

    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var c = ((i / count) + phase) % 1;
      var t = flowInverse(flow, c);
      if (t > tFrom) continue;
      if (!beadVisible(n, t)) continue;         // behind a body -- see above
      beadAt(n, t, bead);
      var r = (name === "chain")
        ? chainRadius(ss2, seg[Math.min(n - 1, Math.round(sampleIndexAt(n, t)))],
                      Math.max(1, seg[n - 1] + 1), t, 0, n, 0)
        : radiusAt(name, ss2, t, ramp);
      var size = Math.max(1.3, r * k * bead.scale * (bs.proud || 1.25) * 1.55);
      // THE TWIST, expressed where it can actually be seen on a ribbon: the
      // knots weave around the cord, and because the spec's law accumulates as
      // (1-t)^p they weave FASTER as they near the tower -- one more thing that
      // changes in only one direction.
      var weave = tw ? Math.sin(tw * Math.PI * 2 * Math.pow(1 - t, twp) + phase * 6) : 0;
      var ox = bead.nx * weave * bead.hw * 0.55;
      var oy = bead.ny * weave * bead.hw * 0.55;
      knot(ctx, shape, bead.x + ox, bead.y + oy, bead.tx, bead.ty,
           bead.nx, bead.ny, size);
    }
    ctx.fillStyle = ink(bs.mat || role.bead, ss2.emits ? 0.1 : 0, ss2.emits ? 0.95 : 0.9);
    ctx.fill();

    // Gold's grains carry a bright facet, the spec's `accent`. One extra fill.
    if (bs.accent) {
      ctx.beginPath();
      for (var j = 0; j < count; j++) {
        var c2 = ((j / count) + phase) % 1;
        var t2 = flowInverse(flow, c2);
        if (!beadVisible(n, t2)) continue;
        beadAt(n, t2, bead);
        var r2 = radiusAt(name, ss2, t2, ramp);
        var s2 = Math.max(0.9, r2 * k * bead.scale * 0.8);
        knot(ctx, shape, bead.x + bead.tx * s2 * 0.35, bead.y + bead.ty * s2 * 0.35,
             bead.tx, bead.ty, bead.nx, bead.ny, s2 * 0.55);
      }
      ctx.fillStyle = ink(bs.accent, 0.2, 0.9);
      ctx.fill();
    }
  }

  function countOf(bs) {
    var c = bs.count;
    if (typeof c === "number") return c;
    if (c && c.length) {
      var sum = 0;
      for (var i = 0; i < c.length; i++) sum += c[i];
      return sum;
    }
    return 10;
  }

  // A knot, added to whatever path is open. `tx,ty` points AT THE TOWER, and
  // every shape here is built around that axis -- which is what makes the
  // direction a property of the matter rather than a symbol laid over it.
  function knot(ctx, shape, x, y, tx, ty, px, py, s) {
    if (shape === "constriction") {
      // A pinch across the cord. No point, no direction of its own: the tendon
      // reads inward from peristalsis -- each constriction travels toward the
      // hands and is larger than the one behind it.
      ctx.moveTo(x + px * s * 0.95 - tx * s * 0.30, y + py * s * 0.95 - ty * s * 0.30);
      ctx.lineTo(x + px * s * 0.95 + tx * s * 0.30, y + py * s * 0.95 + ty * s * 0.30);
      ctx.lineTo(x - px * s * 0.95 + tx * s * 0.30, y - py * s * 0.95 + ty * s * 0.30);
      ctx.lineTo(x - px * s * 0.95 - tx * s * 0.30, y - py * s * 0.95 - ty * s * 0.30);
      ctx.closePath();
      return;
    }
    if (shape === "box") {
      // A cast grain: blunt, but seated with its leading face square to the
      // ring, so a row of them still steps inward.
      ctx.moveTo(x + tx * s * 0.85 + px * s * 0.62, y + ty * s * 0.85 + py * s * 0.62);
      ctx.lineTo(x + tx * s * 0.85 - px * s * 0.62, y + ty * s * 0.85 - py * s * 0.62);
      ctx.lineTo(x - tx * s * 0.75 - px * s * 0.86, y - ty * s * 0.75 - py * s * 0.86);
      ctx.lineTo(x - tx * s * 0.75 + px * s * 0.86, y - ty * s * 0.75 + py * s * 0.86);
      ctx.closePath();
      return;
    }
    // The chevron. A wedge whose apex is toward the tower and whose back is
    // swallowed by the cord -- a knot on the rope, not a glyph floating over it.
    ctx.moveTo(x + tx * s * 1.30, y + ty * s * 1.30);
    ctx.lineTo(x - tx * s * 0.42 + px * s * 0.95, y - ty * s * 0.42 + py * s * 0.95);
    ctx.lineTo(x - tx * s * 0.10, y - ty * s * 0.10);
    ctx.lineTo(x - tx * s * 0.42 - px * s * 0.95, y - ty * s * 0.42 - py * s * 0.95);
    ctx.closePath();
  }

  // ---- transfer boluses ----------------------------------------------------
  //
  // A transfer is gold arriving or HP returning. Both are counters the adapter
  // already keeps for its own panel; watching them is read-only and, crucially,
  // is NOT a damage hook -- the beam still never flinches per shot.

  var BOLUS_SECONDS = 0.62;

  function updatePulses(tower, rec, ss2, dt) {
    var allowed = ss2 && ss2.pulses && ss2.pulses !== "none";
    var hp = tower.hpHealed || 0, gold = tower.goldGenerated || 0;
    var fired = (hp > rec.hp + 0.0001) || (gold > rec.gold + 0.0001);
    rec.hp = hp; rec.gold = gold;
    if (allowed && fired && rec.pulses.length < 4) rec.pulses.push({ c: 0, a: 0 });
    for (var i = rec.pulses.length - 1; i >= 0; i--) {
      var p = rec.pulses[i];
      p.c += dt / BOLUS_SECONDS;
      // Swells on the way in and is gone at the mouth: it is being swallowed,
      // not landing.
      p.a = Math.sin(clamp(p.c, 0, 1) * Math.PI) * 0.9 + 0.1;
      if (p.c >= 1) rec.pulses.splice(i, 1);
    }
  }

  // ---- entry ---------------------------------------------------------------

  var nodeBuf = [];

  function node(i, x, y, z) {
    var n = nodeBuf[i] || (nodeBuf[i] = { x: 0, y: 0, z: 0 });
    n.x = x; n.y = y; n.z = z;
    return n;
  }

  function draw(ctx, state, api) {
    if (!ctx || !state || !api || !api.project || !api.withGround) return;
    var sp = spec();
    if (!sp) return;
    var towers = state.towers;
    if (!towers || !towers.length) return;
    var now = state.now || 0;
    seen++;

    var saveCap = ctx.lineCap, saveJoin = ctx.lineJoin;
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";

    // ONE pinned reference for the whole pass, and every height fed to
    // `project` below is ABSOLUTE. See the note at the head of this file: a
    // beam spans two ground heights and must fly a straight line between them.
    api.withGround(0, function () {
      // OCCLUDERS ONCE PER FRAME AT MOST, AND ONLY IF A CORD IS ACTUALLY DRAWN.
      //
      // Built inside this pinned reference so that every height in `occ` and
      // every height in `sz[]` is measured from the same z = 0 and the two are
      // comparable without a second thought. `occBuilt` keeps the original
      // guarantee -- a board with five Siphons on it builds the list once, not
      // five times -- while skipping it entirely on a frame where no Siphon
      // holds a lock.
      //
      // That case used to be impossible: every Siphon drew idle filaments, so
      // every Siphon needed the list. With the idle cord gone it is the common
      // case, and MEASURED on a board of 12 idle Siphons and 120 bodies the
      // build was the entire remaining cost of this module -- 0.218 ms/frame
      // with it, 0.020 ms/frame without.
      //
      // `occN` is cleared up front so a frame that builds nothing reports
      // nothing, rather than leaving the previous frame's capsules visible to
      // the exported `occluders()`.
      occN = 0;
      var occBuilt = false;

      for (var i = 0; i < towers.length; i++) {
        var t = towers[i];
        if (!t || !t.constructor || t.constructor.ID !== "siphon") continue;
        var rec = recordFor(t);
        var dt = rec ? clamp(now - (rec.now || now), 0, 0.12) : 0;
        if (rec) rec.now = now;

        var locks = (typeof t.visibleLocks === "function")
          ? t.visibleLocks() : (t.locks || []);
        // Dead and leaked bodies are dropped by the adapter on its next update;
        // until then they must not be drawn to.
        var live = [];
        for (var j = 0; j < locks.length; j++) {
          var e = locks[j];
          if (e && !e.dead && !e.leaked && e.pos) live.push(e);
        }

        // THE IDLE CORD IS GONE. A Siphon with nothing to drain draws nothing.
        //
        // It used to cast three groping filaments (`seeking`). The owner
        // reported it twice -- "the beam is unreadable as it just passes
        // through the siphon body", "so it cause buggs", "and it's not clean"
        // -- and the second report was after the self-occlusion fix in 7506bf4,
        // so that fix did not settle it.
        //
        // WHY THIS COULD NOT BE FIXED IN PLACE. All of it measured at the
        // DEFAULT CAMERA (1280x720, distance 2022, pitch 0.5945) -- the one the
        // owner plays at, where this whole effect is about 20 px of cord. The
        // first four are a 24-phase sweep of one idle Siphon at board centre;
        // the last is the 12-phase canonical scene (Siphon plus one pinned
        // enemy) that can be rebuilt bit-identically.
        //
        //   - The cord's origin projects INSIDE the Siphon's own rendered
        //     silhouette -- 6.6 px from the nearest pixel outside it. A cord
        //     that begins inside the body must cross the body to leave, at any
        //     length, so no re-anchoring or shortening removes the crossing.
        //     That is what rules out shortening it instead of deleting it.
        //   - The whole effect spans 26 x 17 px against a 19 x 32 px body.
        //     There is no room to route around what it has to avoid.
        //   - Painted ink over its own body: mean 79.6 px per phase, 39.9% of
        //     the effect's own ink, worst 144 px -- WITH self-occlusion on.
        //     7506bf4 measured the centre-line polyline and read 0; a visible
        //     sample still paints its full half-width, so the ribbon crosses
        //     the body where the centre line does not.
        //   - At 7 of those 24 phases the effect left a component with no ink
        //     connecting it to the tower (worst 90 px, 12.2 px clear) -- the
        //     detached tendril in the owner's screenshot.
        //   - It was also louder than the thing it was not doing: 179.5 px of
        //     idle ink per phase against 29.5 px for a real attack beam.
        //
        // The attack cords are untouched and are the readable, intentional
        // ones. Nothing here is behind a flag: there is no idle path left to
        // turn back on.
        if (!live.length) continue;

        if (!occBuilt) { buildOccluders(state, api); occBuilt = true; }

        var ramp = rampOf(t, live[0]);
        var name = stateFor(t, live.length, ramp);
        var ss2 = stateSpec(name);
        if (!ss2) continue;
        if (rec) updatePulses(t, rec, ss2, dt);

        // THE FRAME THE BODY IS ACTUALLY DRAWN AT, from the one place that
        // derives it. `_chanFrames` was set by gl-world's GL pass earlier in
        // this same rendered frame, which is the only reading of how many
        // frames the body on screen has; with no GL pass it is 0, animFrame
        // returns 0, and originPoint reads the table's rest pose. The ease is
        // memoised on `now`, so calling it here does NOT step it a second time.
        var frame = animFrame(t, now, t._chanFrames || 0);
        var o = originWorld(t, api.groundAt, frame);
        var ox = o.x, oy = o.y, oz = o.z;

        // THE BEAMS LEAVE THE RITUAL CIRCLE, NOT THE BODY.
        //
        // The owner's design: he extends both hands (or puts the staff forward
        // from A3) and a circle forms in front of him; the beams come out of
        // THAT. So when the ritual module is present it owns the cords, and
        // this falls through to the hands/ring origin below when it is not --
        // which is also what keeps this file working on its own.
        //
        // WHAT `plan()` ACTUALLY RETURNS. This used to read `rite.origin` and
        // take a single point off it. There is no `origin` on that object and
        // there never was -- it returns `{ beams, idle }` -- so the test was
        // always false, every rim anchor and every chain assignment the ritual
        // computed was thrown away, and the beams kept leaving the hands. It
        // failed silently and looked exactly like a module that was not loaded,
        // which is the worst way for a seam to be wrong.
        var rite = (typeof SiphonFXRitual !== "undefined")
          ? SiphonFXRitual.plan(t, live, ox, oy, oz, now, api) : null;

        // `idle` is the ritual's blended root point: the circle's centre while
        // it is open, the hands once it has closed, eased across the handover
        // so it cannot pop. It is named for the idle filaments it was built
        // for; those are gone, and it now serves only the two fallback paths
        // below -- the ones taken when the ritual supplies no rim anchors. The
        // rim-anchor path just above ignores it and starts on the circle.
        if (rite && rite.idle) { ox = rite.idle.x; oy = rite.idle.y; oz = rite.idle.z; }

        // ONE CORD PER ARM. The ritual has already placed `beamCount(tower)`
        // anchors around the rim and dealt every lock to one of them, nearest
        // first, so each cord starts on the circle and rebounds through its own
        // share. Chaining is therefore not a separate case here -- an arm with
        // three locks IS a chain, and an arm with one is a straight cord.
        if (rite && rite.beams && rite.beams.length) {
          for (var a = 0; a < rite.beams.length; a++) {
            var arm = rite.beams[a];
            if (!arm.targets || !arm.targets.length) continue;
            var an = [node(0, arm.x, arm.y, arm.z)];
            for (var ah = 0; ah < arm.targets.length; ah++) {
              var ae = arm.targets[ah];
              an.push(node(ah + 1, ae.pos.x, ae.pos.y,
                api.groundAt(ae.pos.x, ae.pos.y) + biteHeight(ae)));
            }
            drawBeam(ctx, api, t, name, rampOf(t, arm.targets[0]), an, now, rec);
          }
          continue;
        }

        if (name === "chain") {
          // ONE line leaves the hands and bounces. It does not fork at the
          // source -- `splitsAtSource: false` -- so the locks are visited in
          // order of proximity and the cord thins at every knuckle.
          var order = live.slice(0).sort(function (p, q) {
            var dp = (p.pos.x - ox) * (p.pos.x - ox) + (p.pos.y - oy) * (p.pos.y - oy);
            var dq = (q.pos.x - ox) * (q.pos.x - ox) + (q.pos.y - oy) * (q.pos.y - oy);
            return dp - dq;
          });
          var hops = Math.min(order.length, 6);
          var nodes = [node(0, ox, oy, oz)];
          for (var h = 0; h < hops; h++) {
            var en = order[h];
            nodes.push(node(h + 1, en.pos.x, en.pos.y,
              api.groundAt(en.pos.x, en.pos.y) + biteHeight(en)));
          }
          drawBeam(ctx, api, t, name, ramp, nodes, now, rec);
          continue;
        }

        for (var m = 0; m < live.length; m++) {
          var tgt = live[m];
          var r2 = (m === 0) ? ramp : rampOf(t, tgt);
          var pair = [node(0, ox, oy, oz),
                      node(1, tgt.pos.x, tgt.pos.y,
                        api.groundAt(tgt.pos.x, tgt.pos.y) + biteHeight(tgt))];
          drawBeam(ctx, api, t, name, r2, pair, now, rec);
        }
      }
    });

    ctx.lineCap = saveCap;
    ctx.lineJoin = saveJoin;
    prune();
  }

  return {
    VERSION: VERSION,
    draw: draw,
    reset: reset,
    // THE ONE PLACE THE SIPHON'S ANIMATION FRAME IS DERIVED. gl-world.js calls
    // this from its tower loop and this module calls it from the overlay pass.
    // gl-world deliberately holds NO fallback copy of the formula: if this
    // module is missing it draws frame 0 and the body simply does not animate,
    // because a fallback copy is exactly the duplication this export removes.
    animFrame: animFrame,
    // Exposed for review and for the harness; nothing in the game calls them.
    stateFor: stateFor,
    originPoint: originPoint,
    // Is the per-frame origin table actually driving this tower, or is it the
    // static HANDS/RING fallback? A test that cannot tell the two apart is not
    // a test -- with the table absent the picture is plausible either way.
    originAnimated: originAnimated,
    bodyKey: bodyKey,
    // Every table/model frame-count disagreement and every key miss seen so
    // far, so a review can assert the list is empty instead of reading the
    // console.
    mismatches: mismatches,
    // ---- occlusion, for review ---------------------------------------------
    // The predicate itself, and a flag to force it off. The flag is the point:
    // the only scene-invariant way to prove occlusion is to render the SAME
    // frame twice and diff, and deleting the blocking tower makes the two
    // frames differ by a whole tower instead. It is a module-level boolean read
    // once per cord, so it costs nothing per frame.
    occluded: occluded,
    setOcclusion: function (on) { occlusionOn = !!on; return occlusionOn; },
    occlusion: function () { return occlusionOn; },
    // The capsules built for the last frame drawn, and the per-sample
    // visibility of the last cord drawn -- so a review can aim a pixel probe at
    // a sample that is genuinely meant to be hidden rather than guessing.
    occluders: function () { return occ.slice(0, occN); },
    lastSpans: function () {
      var out = [], n = nS;
      eachSpan(0, n - 1, function (a, b) { out.push([a, b]); });
      return { n: n, visible: visN, spans: out };
    },
    lastSamples: function () {
      var out = [];
      for (var i = 0; i < nS; i++) {
        out.push({ i: i, x: sx[i], y: sy[i], depth: sd[i], z: sz[i],
                   hw: hw[i], vis: sv[i] });
      }
      return out;
    }
  };
})();
