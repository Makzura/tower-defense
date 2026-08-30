#!/usr/bin/env node
//
// check-gait-slip.js -- does a planted foot stay on the road?
//
// WHY THIS EXISTS. The walk is DISTANCE-DRIVEN: gl-world.js advances the frame
// index by `progress / stride`, stride = radiusPx * 2.6 = 28.6 * sizeScale
// board px, and drawActor scales the model by `unitsToPx * sizeScale` with
// unitsToPx = 31.8032 on every body in the library. So one full walk cycle is
//
//     28.6 / 31.8032 = 0.8992806 MODEL UNITS of forward travel
//
// for every body, at every sizeScale, at every speed. A planted foot must
// travel BACKWARD in model space by exactly that much over the cycle, or the
// body slides. Nothing in this pipeline has ever checked it.
//
// THE TRAVEL AXIS IS MODEL LOCAL +X. drawActor yaws the instance by
// atan2(heading.y, heading.x) via GLMath.modelYaw, which maps local +X onto
// the heading. Forward is +x; a planted foot therefore moves -x.
//
// THE TWO COMPONENTS, WHICH HAVE DIFFERENT FIXES:
//
//   A  GAIT ERROR -- authored slip. Peak-to-peak of the planted contact's
//      world track across its plant. Fixable in the rig. Target zero.
//
//   B  QUANTIZATION SAWTOOTH -- bandFrame floors (gl-world.js:1565), so the
//      pose is HELD while the body keeps translating. A perfectly authored
//      foot still creeps forward by stride/N and snaps back, once per frame.
//      Amplitude is stride/N no matter how good the gait is. The only lever
//      is N, the frame count of the walk band.
//
// `first`/`count` in groups[] are VERTEX indices, not triangle indices.
//
// ===========================================================================
// A CONTACT MEASURE MUST TRACK A **MATERIAL** POINT. THIS IS THE RULE THAT
// COST THREE PEOPLE A DAY, AND THE NATURAL DEFINITION IS THE WRONG ONE.
// ===========================================================================
//
// The obvious way to find the contact is "the lowest vertices, this frame".
// It is wrong, and it is wrong in the direction that looks like diligence.
//
// A foot ROLLS. The set of lowest vertices is a geometric LOCUS, and as the
// foot rolls that locus jumps between entirely different MATERIAL points. On
// enemy-normal's `leg_l` the changeover is total: the sole goes flat at frames
// 0 and 4 (26 coplanar vertices at the minimum) and stands on a single corner
// elsewhere -- rest x +0.125 through the toe half, -0.035 through the heel
// half -- so frame 0 to frame 1 shares ZERO of 26 vertices, and so does frame
// 4 to frame 5. The displacement of that locus is not the displacement of
// anything physical.
//
// Measured three ways on the same file, same group, same window {6,7,0,1}:
//
//     mean of the lowest vertices per frame   0.18643 u    55.3%   WRONG
//     fixed sole set, chosen once at rest     0.33251 u    98.6%   right
//     one material vertex (heel 2856)         0.34252 u   101.6%   right
//
// The two material routes bracket 100% from either side. The locus measure
// under-reports the true sweep by about 45% and reads as a body that slides:
// a FALSE ALARM, not a false pass, which is the harder kind to disbelieve.
//
// So `sole` below is computed ONCE from the REST positions and then tracked --
// it is a fixed set of material points, not a per-frame lowest set. The
// per-frame minimum z is used ONLY to decide whether the foot is down, never
// to decide where it is.
//
// `contactChurn` reports the membership change anyway, so that anyone who
// reimplements this the natural way is told rather than left to discover it.
//
// Usage:
//   node tools/check-gait-slip.js                    # every meshed enemy
//   node tools/check-gait-slip.js enemy-normal ...   # named models
//   node tools/check-gait-slip.js --scale 2.4 boss   # quote px at a sizeScale
//   node tools/check-gait-slip.js --json             # machine readable
//   node tools/check-gait-slip.js --verbose          # per-frame tracks

"use strict";

var fs = require("fs");
var path = require("path");

var STRIDE_PX_AT_1 = 28.6;          // radiusPx(11) * 2.6, gl-world.js:1328
var UNITS_TO_PX = 31.8032;          // every model in the library declares this
var CYCLE_UNITS = STRIDE_PX_AT_1 / UNITS_TO_PX;   // 0.8992806...

// A vertex counts as part of the sole if it sits within this much of the
// group's own lowest rest vertex. In model units; 0.02 u = 0.64 px at scale 1.
var SOLE_BAND = 0.02;
// A foot is "planted" in the frames where its sole is within this much of its
// own lowest point across the cycle. Chosen against enemy_chassis.py's own
// swing lift, `swing_z = 0.012 + 0.045 * abs(cos(t))` -- the smallest lift a
// swinging leg ever carries is 0.012, so anything at or below that is contact.
// 0.015 recovers exactly the support windows support_left_frames() authors.
var PLANT_BAND = 0.015;
// A GROUP IS WEIGHT-BEARING ONLY IF IT REACHES THE GROUND PLANE ITSELF.
//
// Tested against z = 0 ABSOLUTELY, not against the lowest group on the body.
// A relative test cannot work: enemy-hive's six feet sit between -0.0057 and
// -0.0000, so any band tight enough to reject a non-contact part would reject
// four of hive's real feet by measuring them against each other.
//
// WHAT THIS EXISTS TO REJECT. enemy-angry's `crank` is a wheel that hangs at
// z = 0.0180 and NEVER touches the road. It was being counted as a foot, which
// made a biped report `feet 3`, and -- far worse -- promoted it to `worst foot`
// with 8.622 px in the summary A column, where its legs read 3.164. **A gate
// reads the summary**, so the Hedger would have failed on a part with no ground
// contact and sent the next reader hunting a gait defect that does not exist.
//
// Excluded groups are REPORTED BY NAME with their height, never dropped
// quietly -- modelled on how enemy-flying is annotated rather than hidden. A
// foot that has genuinely gone missing must not be able to hide inside this
// filter.
var GROUND_TOL = 0.005;

// The drawn size of each enemy type, from `sizeScale` in js/enemy.js. Slip in
// board px scales with it, so quoting a body at 1 understates every big one --
// and the two worst offenders are the two biggest bodies on the board.
var SIZE_SCALE = {
  "enemy-normal": 1, "enemy-fast": 1, "enemy-slow": 1, "enemy-swarm": 0.55,
  "enemy-armored": 1.05, "enemy-brute": 1.5, "enemy-colossus": 2.1,
  "enemy-camo_normal": 1, "enemy-flying": 0.85, "enemy-angry": 1.25,
  "enemy-shielded": 1.15, "enemy-hive": 1.6, "enemy-shieldbearer": 1.35,
  "enemy-boss": 2.4, "enemy-boss_fast": 1.9, "enemy-midboss": 1.8,
  // ONE TYPE, TWO MODELS, ONE SIZE. The Revenant swaps to the undead mesh when
  // it gets back up (gl-world.js::enemyModel), and `sizeScale: 1.2` on the
  // `revenant` row scales both -- so the variant is graded at 1.2 too. Graded
  // at the default 1 it would under-report its own slip by 20%.
  "enemy-revenant": 1.2, "enemy-revenant-undead": 1.2,
  // AND THE SECOND TYPE TO DO IT, for a different reason and with the same
  // consequence for this table. The Bulwark swaps to the stripped mesh when its
  // shield breaks (gl-world.js::enemyModel), and `sizeScale: 1.15` on the
  // `shielded` row scales both -- the swap is a change of body, never of size.
  "enemy-shielded-broken": 1.15,
  // AND THE THIRD, for the same reason again. The Vanguard wears the shattered
  // mesh while its self-granted shield is down (gl-world.js::enemyModel), and
  // `sizeScale: 1.9` on the `boss_fast` row scales both -- the swap is a change
  // of body, never of size, and 1.9 is the largest multiplier in this table
  // bar the Tyrant's, so grading the variant at the default 1 would understate
  // its slip by 47%.
  "enemy-boss_fast-shattered": 1.9,
  "enemy-healer": 1.45,
  // ONE MODEL, SIX SIZES, AND THE ROW IN js/enemy.js IS THE SMALL ONE. The
  // Fractal Slime's `sizeScale` is 1, and no instance is ever drawn at it
  // alone: every body carries `fractalSizeScale = minSizeScale + tier *
  // sizeStep` = 0.65 + 0.35 * tier on top, and `radiusPx()` multiplies the two.
  // The ladder is 0.65 / 1.00 / 1.35 / 1.70 / 2.05 / 2.40, so a T5 is drawn at
  // 2.4 and its slip in board px is 2.4x what this file would otherwise quote.
  // Graded at the WORST tier, for the same reason the Revenant's variant is
  // graded at its parent's 1.2 rather than at the default: a gate reads the
  // summary, and a summary that flatters the body is worse than no summary.
  "enemy-fractal_slime": 2.4,
  // The three v0.5.1 bodies, 2026-08-28. The Dinomech's 2.6 is the largest
  // multiplier in this table -- larger than the Tyrant's 2.4 -- so grading it
  // at the default 1 would understate its slip by 160%.
  "enemy-herald": 1.15, "enemy-sapper": 1, "enemy-dinomech": 2.6
};
// Types whose frames are NOT distance-driven: gl-world.js drives these by a
// CLOCK -- a flier's wingbeat at `HOVER_HZ`, a hovering body's drift at its own
// type's `hover.animHz`. Neither has a planted foot and neither has a slip to
// measure, so A is not a defect on these -- it is not even defined.
//
// THIS TABLE IS THE ONE THING HERE THAT MUST BE KEPT IN STEP BY HAND, and the
// cost of forgetting is not a missing check, it is a WRONG one: the Healer's
// skirt sweeps 8.6 px through a cycle it is supposed to sweep, and graded as a
// gait that reads as the second-worst body in the library. `clockRate` in
// js/gl/gl-world.js is the list this mirrors -- a type is on it if it is
// `isFlying` or carries a `hover` block in js/enemy.js.
var HOVERS = { "enemy-flying": true, "enemy-healer": true,
  // The Shieldbearer joined them on 2026-08-18, when its body became the
  // Auroris beacon: a legless thing on a floating plinth, `hover` block on
  // its row in js/enemy.js, cycle driven by that block's `animHz`. Left
  // off this table it grades as a walker whose one ground-touching group is
  // planted in every frame -- which reads a full cycle as slip, A = 37.0 px at
  // its sizeScale, and would be the worst figure in the library for a body
  // that is not touching the road at all.
  "enemy-shieldbearer": true };

// AND A THIRD CATEGORY, WHICH IS NEITHER A WALKER NOR A HOVERER: A BAND WHOSE
// CONTACT IS SUPPOSED TO SLIDE.
//
// `HOVERS` above exempts bodies with no foot on the road at all. This exempts
// bands whose foot IS on the road and is MEANT to travel with the machine
// rather than with the tarmac. The Vanguard skates the whole road after its
// opening dash (the owner, 2026-08-26: "make the vanguard slide as if he has
// roller skates after his initial dash"), and a wheel that stayed on one patch
// of road would be a wheel that had stopped rolling. A reads 53.7 px on that
// band and every one of those pixels is the animation.
//
// KEYED PER BAND, `model#band`, AND THAT IS THE WHOLE REASON THIS TABLE IS NOT
// SHAPED LIKE `HOVERS`. The same two meshes carry a dash in band 1 that plants
// properly and must keep being graded at zero -- exempting the MODEL would
// stop checking the gait that still has a right answer, which is the failure
// mode this file's own header warns about at length. Adding a body here is
// therefore a claim about one band of it and never about the mesh.
//
// AND IT IS AN EXEMPTION FROM `A`, NOT FROM THE FILE. A glide band is still
// walked, still measured and still printed -- with its real number and a note
// saying why it is not a fault -- because a glide that changed shape should
// still show up in a diff of this output.
var GLIDES = {
  // The two Vanguard meshes, band 0 only. See `vanguard_skate_cycle` in
  // tools/glb_to_model.py: there is no plant window, no swing lift and no
  // solve in that cycle at all, which is the honest way to author a body on
  // wheels and the reason no rig change could bring this number down.
  "enemy-boss_fast#0": true,
  "enemy-boss_fast-shattered#0": true
};

// AND A FOURTH CATEGORY, WHICH IS THE ONE CONTACT THAT MOVES AND IS STILL
// CORRECT: A WHEEL THAT IS ROLLING.
//
// `GLIDES` above is for a contact that is MEANT to slide -- the Vanguard on
// its skates. This is not that, and conflating the two would file a solved
// problem under an accepted one. A rolling wheel's contact patch is
// momentarily at REST: that is the definition of rolling, `roll_cycle` in
// tools/glb_to_model.py solves each wheel's rate off its own measured radius so
// that it is true, and the Herald -- whose plant window happens to be four
// frames -- reads A = 1.5 px on exactly that rig.
//
// WHAT A IS MEASURING ON THE OTHER ONE IS THE CYCLOID, NOT A DEFECT. This file
// picks a foot's `sole` as every vertex within SOLE_BAND (0.02 u) of the
// group's lowest, which on a foot is the underside of a boot and on a wheel is
// a 60-degree ARC of tyre -- and then tracks that arc's MEAN x. On a small
// wheel turning 28 degrees a frame the arc is most of the way round the rim
// within one plant window, so the mean sweeps a full sine of the wheel's own
// radius. The Sapper reads 8.0 px of that and every pixel is the wheel going
// round. Making the number small would mean making the wheel large or stopping
// it, and both are worse pictures.
//
// KEYED PER BAND like `GLIDES`, for the same reason, and it is an exemption
// from A and NOT from the file: both carts are still walked, still measured
// and still printed with their real numbers, so a rig change that broke the
// roll would still show up in a diff of this output.
var ROLLS = {
  "enemy-herald#0": true,
  "enemy-sapper#0": true
};

// ---------------------------------------------------------------------------

function loadModel(file) {
  var src = fs.readFileSync(file, "utf8");
  var captured = null;
  var GLModels = {
    register: function (name, data) { captured = { name: name, data: data }; }
  };
  // eslint-disable-next-line no-new-func
  (new Function("GLModels", src))(GLModels);
  if (!captured) throw new Error("no GLModels.register call in " + file);
  return captured;
}

// pg is column-major 16, as drawActor hands it to GLMath.multiply.
function applyX(m, x, y, z) { return m[0] * x + m[4] * y + m[8] * z + m[12]; }
function applyY(m, x, y, z) { return m[1] * x + m[5] * y + m[9] * z + m[13]; }
function applyZ(m, x, y, z) { return m[2] * x + m[6] * y + m[10] * z + m[14]; }

// THE RING BUDGET. The frost and camo rings are drawn at `radiusPx() + 4` and
// the hover ring at `+ 9` (js/enemy.js:1134-1139), in ABSOLUTE board px. The
// body's own drawn size scales with sizeScale but that pad does not, so the
// budget SHRINKS as a body grows -- the biggest bodies have the least room, and
// the Tyrant at 2.4 has the least of anyone.
//
// Returned in MODEL UNITS of plan RADIUS, which is the space a rig is authored
// in: (11 * sizeScale + 4) board px / (31.8032 * sizeScale) px per unit.
//
// This matters to the gait and not only to the mesh: a foot planted for a
// fraction `d` of the cycle must travel back `d * 0.899281` u, so ZERO SLIP
// COSTS PLAN EXTENT and a sliding gait is cheaper here. The chassis's
// under-travel is not only its defect -- it is also how every shipped body has
// been staying inside its own rings.
function ringBudgetUnits(scale, pad) {
  return (11 * scale + (pad === undefined ? 4 : pad)) / (UNITS_TO_PX * scale);
}

// A NULL GROUP MATRIX IS IDENTITY IN MODEL SPACE, AND THAT IS NOT A GUESS.
// export_mesh.py emits None for the unnamed group "" and for world_fixed, and
// drawActor spends it as `base = pg ? multiply(instanceMat, pg) : instanceMat`
// (gl-world.js:1626) -- the group is drawn with the instance matrix unchanged,
// which in the model's own space is exactly the identity. Substituting IDENT
// here reproduces the runtime rather than merely avoiding a crash.
// Measured across the library: only enemy-flying carries nulls, 12 of 96, all
// of them group 0, which is its unnamed 2223-vertex static remainder.
var IDENT = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

function analyse(name, data, opts) {
  var pos = data.positions;
  var groups = data.groups || [];
  var frames = data.frames || [];
  var scale = opts.scale || SIZE_SCALE[name] || 1;
  var unitsToPx = data.unitsToPx || UNITS_TO_PX;

  var out = {
    model: name,
    unitsToPx: unitsToPx,
    sizeScale: scale,
    vertices: pos.length / 3,
    triangles: (pos.length / 3) / 3,
    frameCount: frames.length,
    bands: data.bands || null,
    axis: "model local +X (heading)",
    feet: [],
    excluded: [],
    notes: []
  };
  if (HOVERS[name]) {
    out.notes.push("CLOCK-DRIVEN (boardClock * the body's own rate), not " +
      "distance-driven -- A is not a slip figure for this body");
  }
  if (ROLLS[name + "#" + (opts.band || 0)]) {
    out.rolls = true;
    out.notes.push("ROLLING CONTACT -- the wheels are solved to roll TRUE " +
      "(roll_cycle in tools/glb_to_model.py, off each wheel's own radius). A " +
      "here is the cycloid traced by the rest-pose sole band as the tyre " +
      "turns, not slip");
  }
  if (GLIDES[name + "#" + (opts.band || 0)]) {
    out.glides = true;
    out.notes.push("GLIDE BAND -- the contact is MEANT to travel with the " +
      "machine (wheels), so A is the animation and not a defect. Other " +
      "bands of this model are graded normally");
  }
  if (data.unitsToPx && Math.abs(data.unitsToPx - UNITS_TO_PX) > 1e-6) {
    out.notes.push("unitsToPx is " + data.unitsToPx + ", not " + UNITS_TO_PX +
      " -- cycle length recomputed for this body");
  }

  // WHICH BAND IS BEING GRADED, by exactly the rule gl-world.js walkBand()
  // uses -- extended to any band index, because a model may declare several.
  //
  // THIS USED TO READ BAND 0 AND ONLY BAND 0, WHICH IS A CHECK THAT CANNOT
  // FAIL ON THE THING IT IS ABOUT. Every banded body in the library had one
  // gait until the Vanguard arrived with two, and a second gait skates in
  // exactly the way the first one is graded for: `plant_windows` and
  // `leg_series` are per-gait, so a duty or a phase authored for band 1 gets
  // its own solve and its own chance to be wrong. Grading band 0 twice and
  // calling it a library sweep is the failure this file's own header warns
  // about -- "an instrument that has only ever returned one answer has not
  // been tested". `main` now walks every declared band and prints one row per
  // band; band 0's row is bit-identical to what it printed before.
  var n = frames.length || 1;
  var wanted = opts.band || 0;
  var band = wanted ? null : [0, n];
  var b = data.bands;
  if (b && b.length && b[wanted] && b[wanted].length === 2) {
    var first = b[wanted][0], count = b[wanted][1];
    if (typeof first === "number" && typeof count === "number" &&
        first >= 0 && count > 0 && first + count <= n) band = [first, count];
  }
  // A band that was asked for and does not exist is reported, never silently
  // graded as band 0 -- that would print a clean row for a gait nothing looked
  // at, which is worse than printing nothing.
  if (!band) {
    out.notes.push("no band " + wanted + " declared");
    out.N = 0;
    out.gaitErrorUnits = 0; out.gaitErrorPx = 0;
    out.sawtoothPx = 0; out.totalSlipPx = 0;
    out.planPercentOfRing = 0;
    return out;
  }
  out.walkBand = band;
  out.bandIndex = wanted;
  var N = band[1];
  out.N = N;

  var cycleUnits = STRIDE_PX_AT_1 / unitsToPx;
  out.cycleUnits = cycleUnits;
  out.strideBoardPx = STRIDE_PX_AT_1 * scale;
  var perFrame = cycleUnits / N;            // ideal backward step per frame
  out.stepUnits = perFrame;
  // B is a property of N and the stride alone.
  out.sawtoothUnits = perFrame;
  out.sawtoothPx = perFrame * unitsToPx * scale;

  if (!frames.length) { out.notes.push("no frames -- static model"); return out; }

  // Vertex z of every point, rest pose, to find each group's sole.
  var gi, k;
  var candidates = [];
  var modelMinZ = Infinity;
  for (k = 0; k < pos.length; k += 3) if (pos[k + 2] < modelMinZ) modelMinZ = pos[k + 2];
  out.restMinZ = modelMinZ;

  for (gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    if (!g.count) continue;
    var lo = g.first * 3, hi = (g.first + g.count) * 3;
    var gMinZ = Infinity;
    for (k = lo; k < hi; k += 3) if (pos[k + 2] < gMinZ) gMinZ = pos[k + 2];
    var sole = [];
    for (k = lo; k < hi; k += 3) {
      if (pos[k + 2] <= gMinZ + SOLE_BAND) sole.push(k);
    }
    if (!sole.length) continue;
    candidates.push({ index: gi, name: g.name, sole: sole, restMinZ: gMinZ });
  }

  // Per frame, per candidate group: the sole's mean x and min z after its own
  // group matrix. Frames are walked in BAND order, and the wrap from the last
  // band frame back to the first is included -- that wrap is where a gait that
  // looks clean frame to frame usually pays for itself.
  var f, c;
  for (c = 0; c < candidates.length; c++) {
    var cand = candidates[c];
    cand.x = new Array(N);
    cand.z = new Array(N);
    for (f = 0; f < N; f++) {
      var pose = frames[band[0] + f];
      var m = (pose && pose[cand.index]) ? pose[cand.index] : IDENT;
      var sx = 0, mz = Infinity;
      for (k = 0; k < cand.sole.length; k++) {
        var vi = cand.sole[k];
        var x = pos[vi], y = pos[vi + 1], z = pos[vi + 2];
        sx += applyX(m, x, y, z);
        var wz = applyZ(m, x, y, z);
        if (wz < mz) mz = wz;
      }
      cand.x[f] = sx / cand.sole.length;
      cand.z[f] = mz;
      // The LOCUS of lowest vertices this frame -- computed only to report how
      // badly it churns, never to measure position. See the header.
      var lowest = {};
      for (k = 0; k < cand.sole.length; k++) {
        var vj = cand.sole[k];
        var zj = applyZ(m, pos[vj], pos[vj + 1], pos[vj + 2]);
        if (zj <= mz + 1e-4) lowest[vj] = 1;
      }
      cand.lowest = cand.lowest || [];
      cand.lowest[f] = lowest;
    }
    cand.minZ = Math.min.apply(null, cand.z);
    // Membership overlap between consecutive frames, wrap included.
    var churn = [], worstChurn = 1;
    for (f = 0; f < N; f++) {
      var a = cand.lowest[f], bnext = cand.lowest[(f + 1) % N];
      var ka = Object.keys(a), shared = 0;
      for (k = 0; k < ka.length; k++) if (bnext[ka[k]]) shared++;
      var frac = ka.length ? shared / ka.length : 1;
      churn.push({ from: f, to: (f + 1) % N, of: ka.length, shared: shared });
      if (frac < worstChurn) worstChurn = frac;
    }
    cand.churn = churn;
    cand.worstOverlap = worstChurn;
  }

  // PLAN EXTENT, per frame, over every vertex through its own group matrix.
  // Per frame and not over the union: the ring is drawn around the body in the
  // pose it is currently in, so the figure that can fail is the worst FRAME,
  // not the swept envelope. Reported as a radius, to compare against the ring.
  var planWorst = 0, planWorstFrame = -1, planPerFrame = new Array(N);
  for (f = 0; f < N; f++) {
    var poseF = frames[band[0] + f];
    var rMax = 0;
    for (gi = 0; gi < groups.length; gi++) {
      var gg = groups[gi];
      if (!gg.count) continue;
      var mm = (poseF && poseF[gi]) ? poseF[gi] : IDENT;
      var lo3 = gg.first * 3, hi3 = (gg.first + gg.count) * 3;
      for (k = lo3; k < hi3; k += 3) {
        var vx = pos[k], vy = pos[k + 1], vz = pos[k + 2];
        var wx = applyX(mm, vx, vy, vz), wy = applyY(mm, vx, vy, vz);
        var rr = wx * wx + wy * wy;
        if (rr > rMax) rMax = rr;
      }
    }
    rMax = Math.sqrt(rMax);
    planPerFrame[f] = rMax;
    if (rMax > planWorst) { planWorst = rMax; planWorstFrame = f; }
  }
  var budget = ringBudgetUnits(scale, 4);
  out.planRadiusUnits = planWorst;
  out.planWorstFrame = planWorstFrame;
  out.ringBudgetUnits = budget;
  out.planPercentOfRing = 100 * planWorst / budget;
  out.planRadiusPx = planWorst * unitsToPx * scale;
  out.ringRadiusPx = 11 * scale + 4;
  if (opts.verbose) out.planPerFrame = planPerFrame;

  var groundZ = Infinity;
  for (c = 0; c < candidates.length; c++) {
    if (candidates[c].minZ < groundZ) groundZ = candidates[c].minZ;
  }
  out.groundZ = groundZ;

  for (c = 0; c < candidates.length; c++) {
    var cd = candidates[c];
    // Weight-bearing? Its sole must reach the GROUND PLANE, absolutely.
    if (cd.minZ > GROUND_TOL) {
      out.excluded.push({ group: cd.name, minContactZ: cd.minZ,
        reason: "never reaches the ground plane (z > " + GROUND_TOL + ")" });
      continue;
    }

    // Planted frames: sole within PLANT_BAND of this foot's own low point.
    var planted = [];
    for (f = 0; f < N; f++) if (cd.z[f] <= cd.minZ + PLANT_BAND) planted.push(f);
    if (!planted.length) continue;

    // The contact's WORLD track. Frame f is displayed while the body has
    // travelled f*perFrame .. (f+1)*perFrame of the cycle, and the pose is
    // held throughout. Track the position at the START of each displayed
    // frame: a perfect gait holds this constant across the plant.
    var track = new Array(N);
    for (f = 0; f < N; f++) track[f] = cd.x[f] + f * perFrame;

    // Plant spans, as runs of consecutive frames -- wrapping. A foot planted
    // across the seam (frames N-2, N-1, 0, 1) is one plant, not two, and its
    // wrap step is the one an eye-authored gait gets wrong.
    var spans = [];
    var inRun = null;
    var isPlanted = new Array(N);
    for (f = 0; f < N; f++) isPlanted[f] = false;
    for (k = 0; k < planted.length; k++) isPlanted[planted[k]] = true;
    // Rotate the start so a wrapping run is contiguous.
    var start = 0;
    if (planted.length < N) {
      while (isPlanted[start]) start = (start + 1) % N;
    }
    for (var i = 0; i < N; i++) {
      f = (start + i) % N;
      if (isPlanted[f]) {
        if (!inRun) { inRun = []; spans.push(inRun); }
        inRun.push(f);
      } else inRun = null;
    }

    var worst = 0, worstSpan = null;
    var spanReports = [];
    for (var s = 0; s < spans.length; s++) {
      var sp = spans[s];
      // Track value at each planted frame, with the cycle wrap unwound: a run
      // that crosses the seam continues forward, it does not jump back a
      // whole cycle.
      var vals = [], laps = 0, prev = sp[0];
      for (i = 0; i < sp.length; i++) {
        if (sp[i] < prev) laps++;
        prev = sp[i];
        vals.push(cd.x[sp[i]] + (sp[i] + laps * N) * perFrame);
      }
      var lo2 = Math.min.apply(null, vals), hi2 = Math.max.apply(null, vals);
      var pp = hi2 - lo2;
      // Also the authored travel over the whole plant vs the ideal, signed:
      // positive means the foot did not go back far enough (it slid forward).
      var authored = vals[vals.length - 1] - vals[0];
      spanReports.push({
        frames: sp.slice(),
        length: sp.length,
        dutyCycle: sp.length / N,
        peakToPeakUnits: pp,
        peakToPeakPx: pp * unitsToPx * scale,
        netDriftUnits: authored,
        netDriftPx: authored * unitsToPx * scale
      });
      if (pp > worst) { worst = pp; worstSpan = spanReports[spanReports.length - 1]; }
    }

    out.feet.push({
      group: cd.name,
      groupIndex: cd.index,
      soleVerts: cd.sole.length,
      restMinZ: cd.restMinZ,
      minContactZ: cd.minZ,
      plantedFrames: planted,
      // How much the lowest-vertex LOCUS churns. 0 means a frame pair shares
      // no material point at all -- a rolling foot. Reported so that a reader
      // who measures the locus instead of a fixed material set is warned.
      worstLocusOverlap: cd.worstOverlap,
      locusChurn: opts.verbose ? cd.churn : undefined,
      spans: spanReports,
      gaitErrorUnits: worst,
      gaitErrorPx: worst * unitsToPx * scale,
      track: opts.verbose ? track : undefined,
      soleX: opts.verbose ? cd.x : undefined,
      soleZ: opts.verbose ? cd.z : undefined
    });
  }

  var maxA = 0, maxFoot = null;
  for (i = 0; i < out.feet.length; i++) {
    if (out.feet[i].gaitErrorUnits > maxA) {
      maxA = out.feet[i].gaitErrorUnits; maxFoot = out.feet[i].group;
    }
  }
  out.gaitErrorUnits = maxA;
  out.gaitErrorPx = maxA * unitsToPx * scale;
  out.worstFoot = maxFoot;
  out.totalSlipPx = out.gaitErrorPx + out.sawtoothPx;
  if (!out.feet.length) out.notes.push("no weight-bearing group found");
  return out;
}

// ---------------------------------------------------------------------------

function main() {
  var args = process.argv.slice(2);
  var opts = { scale: null, json: false, verbose: false, band: null };
  var names = [];
  for (var i = 0; i < args.length; i++) {
    if (args[i] === "--scale") opts.scale = parseFloat(args[++i]);
    else if (args[i] === "--json") opts.json = true;
    else if (args[i] === "--verbose") opts.verbose = true;
    // `--band N` grades that band and nothing else. Without it every declared
    // band is graded, which is the default because a sweep that skips a gait
    // is the defect this option exists to make impossible to reintroduce.
    else if (args[i] === "--band") opts.band = parseInt(args[++i], 10);
    else names.push(args[i]);
  }
  var dir = path.join(__dirname, "..", "js", "gl", "models");
  if (!names.length) {
    names = fs.readdirSync(dir).filter(function (f) {
      return /^enemy-.*\.js$/.test(f);
    }).map(function (f) { return f.replace(/\.js$/, ""); });
  }
  var results = [];
  for (i = 0; i < names.length; i++) {
    var file = names[i].indexOf(path.sep) >= 0 || /\.js$/.test(names[i])
      ? names[i] : path.join(dir, names[i] + ".js");
    if (!fs.existsSync(file)) { console.error("missing: " + file); continue; }
    var m = loadModel(file);
    if (opts.band !== null) {
      results.push(analyse(m.name, m.data, opts));
      continue;
    }
    var declared = (m.data.bands && m.data.bands.length) || 1;
    for (var bi = 0; bi < declared; bi++) {
      var one = analyse(m.name, m.data,
        { scale: opts.scale, json: opts.json, verbose: opts.verbose, band: bi });
      // The suffix goes on ONLY when there is a second band to tell it from,
      // so every single-gait row in the library reads exactly as it did.
      if (declared > 1) one.model = m.name + " #" + bi;
      results.push(one);
    }
  }
  if (opts.json) { console.log(JSON.stringify(results, null, 2)); return; }

  console.log("GAIT SLIP -- travel axis: model local +X (the heading).");
  console.log("One walk cycle = " + CYCLE_UNITS.toFixed(6) +
    " model units of travel (28.6 / 31.8032), at every sizeScale and speed.");
  console.log("A = authored gait error (rig-fixable, target 0). " +
    "B = quantization sawtooth = stride/N (only lever is N).");
  console.log(opts.scale
    ? "Quoted at sizeScale " + opts.scale + " for every body.\n"
    : "Quoted at each type's OWN sizeScale from js/enemy.js" +
      " -- board px, the space `pos` lives in.\n");
  var head = pad("model", 20) + pad("size", 6) + pad("N", 4) + pad("feet", 5) +
    pad("A units", 11) + pad("A px", 9) + pad("B px", 9) + pad("A+B px", 9) +
    pad("plan/ring", 10) + "worst foot";
  console.log(head);
  console.log(new Array(head.length + 1).join("-"));
  for (i = 0; i < results.length; i++) {
    var r = results[i];
    console.log(
      pad(r.model, 20) + pad(String(r.sizeScale), 6) + pad(String(r.N), 4) +
      pad(String(r.feet.length), 5) +
      pad(r.gaitErrorUnits.toFixed(5), 11) +
      pad(r.gaitErrorPx.toFixed(3), 9) +
      pad(r.sawtoothPx.toFixed(3), 9) +
      pad(r.totalSlipPx.toFixed(3), 9) +
      pad(r.planPercentOfRing.toFixed(0) + "%", 10) +
      (r.worstFoot || "-") +
      (r.notes.length ? "   ! " + r.notes.join("; ") : ""));
  }
  console.log("");
  for (i = 0; i < results.length; i++) {
    var rr = results[i];
    if (!rr.feet.length) continue;
    console.log(rr.model + ":");
    for (var j = 0; j < rr.feet.length; j++) {
      var ft = rr.feet[j];
      var sp = ft.spans.map(function (s) {
        return "[" + s.frames.join(",") + "] duty " +
          (s.dutyCycle * 100).toFixed(0) + "%  p2p " +
          s.peakToPeakPx.toFixed(3) + "px  net " +
          (s.netDriftPx >= 0 ? "+" : "") + s.netDriftPx.toFixed(3) + "px";
      }).join("\n        ");
      console.log("  " + pad(ft.group, 16) + "A=" + ft.gaitErrorPx.toFixed(3) +
        "px  contactZ=" + ft.minContactZ.toFixed(4) +
        "  sole=" + ft.soleVerts + "v\n        " + sp);
      if (rr.feet[j].track) {
        console.log("        track: " + ft.track.map(function (t) {
          return t.toFixed(4); }).join(" "));
      }
    }
    console.log("");
  }
}

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += " ";
  return s + " ";
}

if (require.main === module) main();
module.exports = { analyse: analyse, loadModel: loadModel,
  CYCLE_UNITS: CYCLE_UNITS };
