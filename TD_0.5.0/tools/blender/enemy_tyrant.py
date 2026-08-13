# ---------------------------------------------------------------------------
# Enemy type `boss` -- the TYRANT. The wave-35 boss, 5000 hp, sizeScale 2.4,
# no armor, no defence, the slowest body in the game at 15 u.l./s.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-boss
#
# THE FILE NAME IS THE TYPE ID. `gl-world.js::enemyModel()` looks up
# "enemy-" + enemy.typeId and the type id is `boss`, so the generated file is
# `enemy-boss.js`. This module is named for the lore name, the convention the
# 2026-08-13 batch settled on.
#
# ** `--only=enemy-boss` ALSO BUILDS `enemy-boss_fast`. ** The exporter matches
# targets BY PREFIX and "enemy-boss" is a prefix of "enemy-boss_fast" -- the
# first time that has been true of any pair in TARGETS, and its header's claim
# that "no full target name is a prefix of another" stopped being true the day
# this file landed. A run therefore rewrites the Vanguard too. That is harmless
# to its CONTENT (re-exports differ in byte order, never in triangles) but it
# is a spurious diff; back the Vanguard up before a run and put it back after.
#
# ---------------------------------------------------------------------------
# WHAT THIS BODY IS
# ---------------------------------------------------------------------------
#
# A CONTAINER WITH LEGS. Diego's ruling in his own words: "just a machine
# bigger than others that was given more resources to capture humans." So:
#
#   NO HEAD, NO FACE, NO SINGLE LARGE EYE. `chassis.head()` is never called.
#     A lens at the top of a body is a face and a face is a character; the
#     aimed shot reaches the whole map and needs no eye. Every other body in
#     the faction has a lens on a neck. This one has a CLOSED LID, and that
#     absence is the loudest thing on the silhouette.
#   A RANK OF THREE ORDINARY CARGO CAGES, never one enlarged one. A row of
#     identical small cages says capacity; one big cage says importance.
#     `chassis.cargo_cage()` is SEALED -- placed three times at scale 0.46,
#     which is roster Law 02's own sanctioned variation ("the same lens ring at
#     three scales, variation in count and plating, never in kind").
#   NO ARMS, NO NECK, NO ANTENNA, NO TORSO FRAME. This body does not use the
#     chassis silhouette at all -- only its palette and its cage.
#
# ---------------------------------------------------------------------------
# THE BRIEF THIS SUPERSEDES, AND EXACTLY WHICH PART OF IT
# ---------------------------------------------------------------------------
#
# `tools/blender/BRIEF-enemy-boss-tyrant.md` sections 2 and 3 specify an
# APEX-UP plate with a flat sole 0.420 long, a heel-to-toe roll, theta_m 32
# degrees and duty 0.625. **THAT IS SUPERSEDED. Do not build it and do not
# re-derive it from the brief.** kaz's later direction is APEX DOWN, one point
# contact, "the same primitive mirrored in z" -- the Vanguard's blade turned
# over -- and he has confirmed in writing that section 2/3 is dead rather than
# a second live answer. Everything else in that brief stands and is used here.
#
# THERE ARE TWO MEASURED REASONS BEYOND THE INSTRUCTION, and both were derived
# and sent up BEFORE any geometry was cut:
#
#   1. THE GATE CANNOT SCORE AN APEX-UP TYRANT CORRECTLY. `check-gait-slip.js`
#      tracks the MEAN X of a fixed sole band -- a material set, which is the
#      correct choice, and on a flat sole rocking about a pin above it that
#      mean is the sole MIDPOINT. The midpoint sweeps 2 L sin(theta_m) =
#      0.49124 u while the requirement is (P-1) S / F = 0.55503 u. A perfectly
#      correct apex-up Tyrant scores A = 0.06380 u = 4.87 board px at 2.4.
#      The 0.0638 is exactly the brief's own `B (1 - cos theta_m)` term -- the
#      part of the contact travel that comes from the pivot MOVING from heel to
#      toe, which no fixed material point can carry. kaz holds an independent
#      written record of the same 0.55, from a different route.
#      The general rule out of it, which is worth more than the geometry it
#      settled: A MEASUREMENT ERROR IN A REPORT COSTS ONE CORRECTION; THE SAME
#      ERROR IN A GATE COSTS EVERY BODY THE GATE TOUCHES, and it is harder to
#      disbelieve because turning a finding into a check reads as diligence.
#
#   2. DUTY 0.625 IS NOT BUILDABLE ON A POINT CONTACT. Two point-contact legs
#      both planted demand hip heights `depth * cos(theta)` at two different
#      thetas. At the brief's own schedule those differ by 0.022 u at 8 frames
#      of overlap and 0.050 u at 32, against the brief's stated 0.005 u
#      tolerance. Duty is forced to exactly 0.5, and 0.5 turns out to be the
#      better answer anyway -- see THE SCHEDULE below.
#
# ---------------------------------------------------------------------------
# THE GAIT LAW
# ---------------------------------------------------------------------------
#
# One walk cycle is exactly 0.899281 MODEL UNITS of travel along model +x, for
# every body, at every sizeScale, at every speed. Diego's instruction was "make
# sure the tyrant doesn't slide but actually walks", and the slip has two
# components with different fixes:
#
#   A  AUTHORED GAIT ERROR. The pose failing to sweep that distance. Solved to
#      zero here by construction, not tuned.
#   B  THE QUANTIZATION SAWTOOTH. `bandFrame` FLOORS (gl-world.js:1565), so the
#      pose is HELD while the body keeps translating. Amplitude is exactly S/F
#      and no rig quality touches it. The only lever is F.
#
# F = 128, settled with kaz. Frames cost ZERO triangles and ZERO draw calls --
# a frame is one 4x4 per animated group -- and bosses are exempt from the
# triangle budget on Diego's ruling, so nothing here is economised. B is
# 0.899281 / 128 = 0.007026 u = 0.536 board px at 2.4, which is a third of what
# the brief's own frame-count law asks for (F_min 43).
#
# PLANT REQUIREMENT IS COUNTED IN INTERVALS, NOT SAMPLES. P planted frames are
# P poses and therefore P-1 TRANSITIONS, so the sweep is (P-1) S / F. Getting
# this off by one is a whole frame-step of error and it is the single most
# likely way to produce a wrong answer that looks right.
#
# ---------------------------------------------------------------------------
# THE SCHEDULE: P = 64, OFFSET 64. NO DOUBLE SUPPORT, AND NO FLOAT PHASE.
# ---------------------------------------------------------------------------
#
# Exactly one blade is on the road at every one of the 128 frames, and the
# handover is instantaneous. Both halves of that matter and for different
# reasons.
#
# NO DOUBLE SUPPORT because a point contact cannot have it -- see reason 2
# above. This is forced.
#
# NO FLOAT PHASE, unlike the Vanguard, and this one is chosen. The Vanguard
# sprints and 6 airborne frames of 36 read as a sprint. The Tyrant is the one
# body in the game that never hurries, and it also FREEZES: `currentSpeedUlps()`
# returns 0 while `windUpTimer > 0`, so it holds whatever frame it is on for
# 1.3 s every 12 s -- 30% of a 4.400 s walk cycle, 11% of its life, and
# `stunTimer` and `rooted` do the same. **Every frame of this strip has to be a
# pose it can hold for a second and a half.** A frozen frame with nothing
# touching the road is the one pose that cannot survive that, so there is no
# such frame. The brief reached the same requirement and answered it with
# double support; on this primitive the answer is a zero-length transfer
# instead.
#
# ---------------------------------------------------------------------------
# THE ONE GEOMETRIC DEVIATION, AND IT IS FORCED RATHER THAN CHOSEN
# ---------------------------------------------------------------------------
#
# For a single apex a depth `D` below the pin, swept through +-theta_m, the
# contact travels `2 D sin(theta_m)`. Three constraints, and they use up every
# degree of freedom:
#
#     P = 64        forced by the point contact (no double support possible)
#     D = 0.4635    the brief's pin height. Section 8: "never out of the sole
#                   length, the pin height or the frame count."
#     2 D sin(theta_m) = 63 * 0.899281 / 128 = 0.442615 u
#
# so theta_m = 28.520 degrees, NOT the brief's 32. The 32 was solved against
# the flat-sole identity `B (1 - cos) + 2 L sin`, which is superseded with the
# sole. THETA_M IS DERIVED HERE RATHER THAN TYPED, from D and the schedule, so
# a later change to either cannot leave a stale angle behind. The brief's own
# instruction on this is explicit: "If you change any of B, L or theta_m, hold
# that identity."
#
# ---------------------------------------------------------------------------
# WHAT IS FREE AND MUST NOT BE AUTHORED A SECOND TIME
# ---------------------------------------------------------------------------
#
#   THE BOB. With the apex directly below the pin, the hip rides at D at
#     mid-stance and D cos(theta_m) at both stride extremes: the body rises and
#     falls 0.0563 u = 2.26 screen px TWICE per cycle without a keyframe. That
#     is the heavy beat. An authored bob over the top of it produces a limp.
#   THE CADENCE. The cycle is keyed to distance, so the half-health speed
#     change (15 -> 20.25 u.l./s) speeds the walk up by itself. There is no
#     second gait for the phase change and there must not be one.
#   NO ROLL about x. A roll on a container on a rack reads as a limp.
#
# THE APEX IS DIRECTLY BELOW THE PIN (cx = 0) AND THAT IS WHAT KEEPS THE BOB
# SYMMETRIC. Offsetting the apex behind the pin, as the Vanguard does, makes
# the hip `|C| cos(theta + phi)` -- peaked off mid-stance, so the body pitches
# DOWN across every plant. Right for a sprinter, wrong for this. The rake Diego
# asked for is carried by the forward vertex B instead: the mass overhangs a
# contact point that is under the pin, which is what "reads as falling" means
# here. The identity above does not involve cx at all, so this costs nothing.
#
# ---------------------------------------------------------------------------
# THE SWING NEEDS A LIFT, AND IT IS A PROOF RATHER THAN A CHOICE
# ---------------------------------------------------------------------------
#
# With the apex under the pin, the apex's height above the road while swinging
# is `D (cos theta_planted - cos theta_swing)`. Positive requires
# |theta_swing| > |theta_planted| at every instant -- but the swing has to
# travel from +theta_m to -theta_m and therefore PASSES THROUGH ZERO, and at
# that instant |theta_swing| = 0 which cannot exceed anything. So:
#
#   A RIGID SINGLE-SEGMENT LEG WITH A POINT CONTACT AND DUTY 0.5 CANNOT CLEAR
#   THE ROAD ON THE RECOVERY AT ANY SWING PATH WHATSOEVER.
#
# It is not fixable by a better curve. The leg root is therefore lifted in z
# through the swing -- the chassis's own mechanism, `_set_sole_height` lifts
# every swinging foot on every body in the project -- and the lift is swallowed
# by a HIP HOUSING deep enough to contain it, which is declared in
# PENETRATION_CONTACTS. The Vanguard shipped exactly this and the Dray shipped
# it before that ("a leg is socketed into its rail and slides up into it
# through the swing -- that is what the rail depth is for").
#
# ---------------------------------------------------------------------------
# CLAUSE 3b, BY CONSTRUCTION
# ---------------------------------------------------------------------------
#
# The body root's rest pose is its HIGHEST: `bob = hip(f) - hip_max` is never
# positive, and it is exactly zero at mid-stance, which the schedule reaches.
# So the raw maximum z IS the posed maximum z and `model.top` cannot
# under-report. This body has `showHealthBanner: true` and sizeScale 2.4 -- the
# largest multiplier in the game on any such error -- so it is the worst case
# on the board and is built to be immune rather than merely inside tolerance.
# Quote the margin from `node tools/check-model-top.js`, never from a root's z.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy

import td_scene as td
import enemy_chassis as chassis
import gait_solve

ORTHO_SCALE = 1.6               # the biggest body on the board; preview only

WALK_FRAMES = 128               # F. Settled with kaz. See THE GAIT LAW above.
PLANT_FRAMES = 64               # P. Duty exactly 0.5 -- forced, see above.
LEG_OFFSET = 64                 # half a cycle

# --- the blade ---------------------------------------------------------------
#
# Leg-local, hip pin at the origin, in the model's x-z plane. "Perpendicular to
# the ground" is resolved as the brief resolves it: the plate's PLANE is
# vertical and contains the travel axis, so it rotates only about y, never
# presents as a line, and shows its whole triangular area at camera yaw 0 --
# the bearing 25 of 42 road segments across all six maps give.
#
#   A  the hip pin, and the REAR end of the top edge
#   B  the front end of the top edge -- the forward reach, and the rake
#   C  THE SINGLE GROUND APEX, directly below the pin. One contact identity,
#      no heel-to-toe handover, no frame at which the measured point changes
#      owner. That is the property that makes the zero-slip arithmetic a single
#      clean identity, and it is the whole reason the inversion is worth having.
BLADE_DEPTH = 0.4635            # D: the brief's pin height. Section 8: frozen.
BLADE_A = (0.000, 0.000)
BLADE_B = (0.420, -0.200)       # 0.420 is the brief's plate long dimension
#
# B's DEPTH IS FREE AND ITS REACH IS NOT. With the apex directly under the pin
# (cx = 0) the blade's area is `0.5 * 0.420 * BLADE_DEPTH` and BLADE_B[1] does
# not appear in it at all -- so dropping the forward vertex costs NO plate area
# and no silhouette, while it directly buys hull clearance: the top edge's rise
# at swing angle theta is `-0.420 sin(theta) + BLADE_B[1] cos(theta)`. The
# first build had it at -0.160 and cleared the hull by 0.00006 u after the
# bevel pad -- a pass I would not defend, and one that any later change would
# have broken silently. -0.200 buys 0.034 u for nothing. It also reads better:
# a steeper top edge is more raked, which is the direction the body wants.
BLADE_C = (0.000, -BLADE_DEPTH)
BLADE_Y = 0.110                 # blade centreline offset, the brief's y
BLADE_T = 0.140                 # thickness in y, the brief's

# The two blades span y in [0.040, 0.180] and [-0.180, -0.040], so there is
# 0.080 u of clear air between their facing faces at EVERY frame and
# blade-against-blade contact is structurally impossible rather than checked.

# THE PINS SIT BEHIND THE HULL CENTRE so the CONTACT SWEEP is centred under the
# body rather than the blade's rest outline. The contact travels from
# +D sin(theta_m) to -D sin(theta_m) about the pin, i.e. +-0.2213 u, so a pin
# at -0.150 puts the footprint at x in [-0.371, +0.071] against a hull spanning
# [-0.390, +0.390]. Setting the pin at the hull centre instead would throw the
# whole blade -- which reaches 0.420 FORWARD of its pin and nothing behind it --
# out in front of the container it is carrying.
PIN_X = -0.150

# --- the container -----------------------------------------------------------
#
# All z below are REST WORLD z: the animated body root sits at z = 0 in its
# rest pose (clause 3b), so the numbers here are heights above the road.

# Clearance from the hip pin up to the hull underside. NOT the brief's 0.030 --
# that figure is the cost of an APEX-UP plate, which never lifts anything above
# its own pivot. Inverted, the WIDE edge is at the pivot and the forward vertex
# B sweeps UP as the blade rotates back, and the swing lift raises it further
# still. `build()` MEASURES the worst plate-top rise across the whole solved
# cycle and asserts this gap against it, so the number cannot be quietly
# outgrown by a change to the blade or to the schedule. The Vanguard paid 0.46
# for the same inversion because its top edge is far shallower in z; the cost
# is real on both bosses and the brief costs it on neither.
HULL_GAP = 0.110

HULL_LEN = 0.780                # x, the brief's
HULL_WID = 0.520                # y, the brief's
HULL_H = 0.360                  # z, the brief's
LID_INSET = 0.040               # per side, x and y
LID_H = 0.030                   # proud of the hull top: the closed lid's step

# The rank. Three cages, ranked along model +x. THE RANK RUNS ALONG THE TRAVEL
# AXIS AND NOT ACROSS IT: at camera yaw 0 -- the dominant bearing -- model x
# maps to screen x, so a fore-aft rank reads as three blocks in a row, where a
# transverse rank would sit one behind another and merge into one lump at
# exactly the bearing the player gets most often.
CAGE_SCALE = 0.46
CAGE_PITCH = 0.276              # centre to centre, the brief's
CAGE_X0 = -0.009                # centres the rank's own asymmetric extent

# How far the cages are LET INTO the lid. The brief carries two statements that
# cannot both hold: "0.120 proud of the lid" and "set the cages into the top
# edge so their upper halves break the outline". At scale 0.46 the whole cage
# is only 0.1173 u tall, so 0.120 proud puts ALL of it above the lid and it is
# let into nothing. Resolved toward the sentence that names the requirement --
# section 8's third priority is "the rank rhythm on the top edge" -- by sinking
# a quarter of the cage into the lid. Proud is then 0.0873 u = 3.50 screen px
# against the brief's 4.8. Reported rather than silently taken.
CAGE_SINK = 0.030

# The hip housings. Depth is a requirement, not a proportion: `build_gait`
# asserts it against the worst swing lift the schedule actually demands.
RAIL_X = 0.030                  # centre, relative to the pin
RAIL_L = 0.200
RAIL_T = 0.190                  # thicker than the blade's 0.140, so it wraps
RAIL_DROP = 0.055               # how far the housing hangs BELOW the pin

# --- the swing ---------------------------------------------------------------
#
# The brief asks for >= 0.02 u of clearance on every swing frame, peaking at
# 0.06 at mid-swing, and says below 0.02 a tipped corner clips the road on a
# body this large. With cx = 0 the geometric clearance is exactly zero at every
# swing frame (see the proof above), so the lift supplies the whole profile.
# The SHAPE exponent is what keeps the first and last swing frames above the
# 0.02 floor while the lift still starts and ends at zero: a plain sine would
# reach only 0.0029 u one frame after toe-off.
SWING_CLEARANCE = 0.020
SWING_PEAK = 0.060
SWING_SHAPE = 0.35

# check-gait-slip.js's own SOLE_BAND, in model units: a vertex counts as sole
# if it sits within this much of its GROUP's lowest rest vertex. Copied rather
# than derived because the gate is JavaScript; if it moves, this moves.
SOLE_BAND = 0.02

# THE NEGATIVE CONTROL, and it defaults to off. A gate that has only ever been
# shown to pass has not been shown to do anything: it must also FAIL something
# known bad, ON REAL GEOMETRY, because synthetics prove the arithmetic and say
# nothing about the population. Setting TYRANT_GAIT_DEFECT=0.8 in the
# environment multiplies the plant's contact travel by 0.8 and nothing else --
# a body that is correct in every other respect and slides by a known amount.
# Predicted A at 0.8: (1 - 0.8) * 0.442615 = 0.088523 u = 6.757 board px at
# 2.4. Compare that against what the gate reports. It is 1.0 unless somebody
# deliberately sets it, so it cannot reach a shipped export.
GAIT_DEFECT = float(os.environ.get("TYRANT_GAIT_DEFECT", "1.0"))


PENETRATION_CONTACTS = [
    ("blade_", "hip_housing_", "THE BLADE IS PINNED INTO ITS HOUSING and "
     "slides up into it across the swing -- that is what the housing depth is "
     "for, and it is the only thing there is for a limb with no knee to hang "
     "from. The same declaration the Dray and the Vanguard make about their "
     "own rails, and `build_gait` asserts the depth against the measured lift "
     "rather than trusting it"),
    ("hip_housing_", "hull", "the two housings are welded up into the hull "
     "underside; the hull is what carries them"),
    ("blade_", "hull", "NOT A CONTACT -- AN ARTEFACT OF THE AABB PASS, and "
     "this is the ONLY entry in this list that excuses a reported hit rather "
     "than declaring a real one. The blade is a diagonal taper whose local "
     "bounding box is HALF EMPTY, and the empty corner (0.420, 0) is the one "
     "that swings highest: at maximum negative swing it rises 0.2006 u above "
     "the pin while the real top edge rises 0.0815. That is this file's own "
     "documented limitation -- 'a box is a poor proxy for a diagonal taper, "
     "whose box is mostly air'. The pair is measured instead by "
     "`enemy_tyrant.blade_hull_clearance()`, exact convex separation on the "
     "TRUE triangle against the TRUE hull footprint, every frame, both legs, "
     "with a bevel pad -- which is STRICTER than the test it replaces and "
     "raises at build time. An exclusion paired with a sharper instrument is "
     "not an exclusion that grew; clause 8's failure is one paired with "
     "nothing"),
    ("hull", "hull_lid", "the lid seats into the top of the hull -- it is a "
     "closed lid let into the rim, not a plate resting on one"),
    ("cargo_", "cargo_", "each cage is ONE SEALED ASSEMBLY; every glow surface "
     "is recessed inside a larger dark housing and that recess IS the contact"),
    ("cargo_", "cage_", "as above -- cage_top and cage_bottom are the plates "
     "the assembly is carried on"),
    ("cage_", "cage_", "as above"),
    ("cargo_", "hull_lid", "the rank is LET INTO the lid by CAGE_SINK, which "
     "is the whole point of the rank breaking the top outline rather than "
     "sitting on it"),
    ("cage_", "hull_lid", "as above"),
]

# THE ONE THING THOSE DECLARATIONS HIDE, AND WHAT IS DONE ABOUT IT.
# check_penetration matches by PREFIX, and Blender gives the second and third
# cage `.001` / `.002` suffixes -- so ("cargo_", "cargo_") excuses cage 1
# against cage 2 as well as each cage against itself. That is clause 8's own
# failure mode: an exclusion quietly grown until the check measures the
# requirement instead of the defect. It cannot be narrowed by prefix, so it is
# covered by a DIFFERENT instrument instead: `assert_rank_disjoint()` measures
# the three cages' real world AABBs and asserts they do not touch. The gap it
# checks is not excusable by anything in the list above.


# --- geometry ----------------------------------------------------------------


def blade_mesh(name, a, b, c, thickness, mat, parent, location=(0.0, 0.0, 0.0)):
    """One triangular plate, standing in the model's x-z plane.

    Built with `from_pydata` rather than out of boxes because a triangle is not
    a stretched cube and the apex is the contact: a box proxy would put the
    contact on a face centre away from where the gait solve expects it.
    Normals are recalculated rather than trusted to vertex order.
    """
    import bmesh

    (ax, az), (bx, bz), (cx, cz) = a, b, c
    h = thickness * 0.5
    verts = [(ax, h, az), (bx, h, bz), (cx, h, cz),
             (ax, -h, az), (bx, -h, bz), (cx, -h, cz)]
    faces = [(0, 1, 2), (3, 4, 5),
             (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]

    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    obj.location = location
    mesh.materials.append(mat)
    td.bevel(obj, width=0.010, segments=2)
    return obj


def _local_points(root):
    """Every evaluated, triangulated loop position under `root`, in its space.

    This is what `export_mesh.extract` writes and what the gate reads. Nothing
    downstream sees the ideal vertices, so nothing upstream should measure them.
    """
    import bmesh

    depsgraph = bpy.context.evaluated_depsgraph_get()
    to_local = root.matrix_world.inverted_safe()

    meshes = []

    def descend(node):
        for child in node.children:
            if child.type == "MESH":
                meshes.append(child)
            descend(child)

    descend(root)

    points = []
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(mesh)
        bm.free()
        matrix = to_local @ evaluated.matrix_world
        for poly in mesh.polygons:
            for loop_index in poly.loop_indices:
                vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
                points.append(matrix @ vertex.co)
        evaluated.to_mesh_clear()
    return points


def sole_reference(leg):
    """The contact point of one leg, in that leg root's own local space.

    SOLVE AGAINST THE POINT THE GATE MEASURES, OR THE SOLVE IS AGAINST NOTHING.
    `check-gait-slip.js` selects its sole vertices from the group's REST
    geometry (`pos[k+2] <= gMinZ + SOLE_BAND`, unposed) and averages their x
    AFTER posing -- a fixed material set, so the point it tracks is the
    centroid of the sole band. This reproduces that rule exactly.

    A BEVELLED APEX IS NOT ITS IDEAL APEX, AND THAT IS THE WHOLE REASON THIS
    EXISTS. `td_scene.bevel` rounds the contact corner off, so the centroid of
    the band sits above and inboard of the point the brief names. Left
    uncorrected on the Vanguard's first build -- with a box foot, where the
    effect is smaller -- it cost 0.180 board px of pure net drift.
    """
    from mathutils import Vector

    points = _local_points(leg)
    floor = min(p.z for p in points)
    band = [p for p in points if p.z <= floor + SOLE_BAND]
    total = Vector((0.0, 0.0, 0.0))
    for p in band:
        total += p
    return total / float(len(band))


def sole_band_points(leg):
    """Every point of the contact band, in leg-local (x, z). Clause 6's input.

    THE CONTACT IS A CENTROID BUT THE GROUND IS A MINIMUM, and the two are not
    the same point on a bevelled apex. `sole_reference` gives the centroid,
    which is what the gait GATE tracks in x and therefore what the swing angle
    is solved against. The ROAD is touched by the LOWEST vertex of the band.
    Planting the centroid at z = 0 would sink the blade tip into the road,
    which is clause 6's "feet at z = 0" missed by a small amount for a subtle
    reason.

    So z is solved against this set and x against the centroid. They do not
    fight: a translation in z cannot change any contact's x, so the clause 6
    correction is exactly free for the gait.
    """
    points = _local_points(leg)
    floor = min(p.z for p in points)
    return [(p.x, p.z) for p in points if p.z <= floor + SOLE_BAND]


def blade_top_points(leg):
    """Leg-local (x, z) of every point in the blade's TOP band.

    The input to the hull clearance assert. Selected as a band rather than as
    the two ideal vertices for the same reason the sole is: the bevel rounds
    the pin corner and the forward vertex, so the ideal triangle's top edge is
    not the built mesh's top edge.
    """
    points = _local_points(leg)
    roof = max(p.z for p in points)
    return [(p.x, p.z) for p in points if p.z >= roof - 0.25]


def build_legs(m, body, hip_z):
    """Two blades on their own animated roots. Returns (leg_l, leg_r).

    THE BLADE IS SHIFTED SO ITS MEASURED CONTACT IS THE BRIEFED APEX. Built
    nominally, measured through `sole_reference`, then translated by the
    difference. The visual shift is under one bevel width; what it buys is that
    the derived theta_m stays exactly correct on the BUILT mesh instead of
    being correct only on the ideal triangle. Re-measured afterwards and
    asserted, so a change to the bevel cannot silently reopen the gap.

    THE NAMES ARE UNIQUE PER LEG -- `blade_l` / `blade_r`, roots `leg_l` /
    `leg_r` -- because every measurement here resolves objects through
    `bpy.data.objects[...]`, a GLOBAL lookup: a duplicate name collects
    Blender's automatic `.001` suffix and the wrong leg gets measured with
    nothing raised anywhere.

    THE BLADE IS `tin`, WHICH IS THE BRIEF'S SECTION 7 AND THE OPPOSITE OF THE
    VANGUARD'S ARRANGEMENT. Here the hull is the largest surface in the game
    and takes the darkest value; the plates must separate from it above and
    from the road below, so they take the lighter one. The brief flags this as
    the one material call that carries a read and that the palette table cannot
    settle -- it is owed a rendered-pixel measurement at the worst frame, which
    is juno's and is reported as owed rather than assumed.
    """
    from mathutils import Vector

    out = []
    for tag, sign in (("l", 1.0), ("r", -1.0)):
        leg = td.root("leg_" + tag)
        leg.parent = body
        leg.location = (PIN_X, sign * BLADE_Y, hip_z)
        blade_mesh("blade_" + tag, BLADE_A, BLADE_B, BLADE_C, BLADE_T,
                   m["tin"], leg)
        bpy.context.view_layer.update()
        measured = sole_reference(leg)
        delta = Vector((BLADE_C[0] - measured.x, 0.0, BLADE_C[1] - measured.z))
        blade = bpy.data.objects["blade_" + tag]
        blade.location = delta
        bpy.context.view_layer.update()
        check = sole_reference(leg)
        residual = max(abs(check.x - BLADE_C[0]), abs(check.z - BLADE_C[1]))
        if residual > 1e-6:
            raise AssertionError(
                "blade_%s contact did not land on the apex: measured "
                "(%.6f, %.6f) against C (%.6f, %.6f)"
                % (tag, check.x, check.z, BLADE_C[0], BLADE_C[1]))
        out.append(leg)
    return tuple(out)


def build_hull(m, body, underside):
    """The container, its closed lid, and the two hip housings.

    NO HEAD. `chassis.head()` is deliberately never called and there is no lens
    anywhere on this body -- see the header. The lid is the statement.

    Surface detail is deliberately absent: panel lines, rivets, bracing and
    weld beads are all sub-pixel at the default view and this body is not
    inspected. The brief says to drop them without asking, and a part that is
    dropped for a stated reason is cheaper to defend than one that is kept.
    """
    top = underside + HULL_H
    parts = [
        td.box("hull", (HULL_LEN, HULL_WID, HULL_H),
               location=(0.0, 0.0, underside + HULL_H * 0.5),
               mat=m["tin_dark"], parent=body),
        td.box("hull_lid",
               (HULL_LEN - 2 * LID_INSET, HULL_WID - 2 * LID_INSET, LID_H),
               location=(0.0, 0.0, top + LID_H * 0.5),
               mat=m["tin_dark"], parent=body),
    ]
    return parts, top + LID_H


def build_hip_housings(m, body, hip_z, underside, worst_lift):
    """The two housings the blades are pinned into and slide up into.

    NEW PART, DECLARED, AND STRUCTURAL RATHER THAN DECORATIVE. A blade has no
    knee, so the recovering leg is lifted bodily in z (see the header) and the
    housing is what that lift disappears into. Its DEPTH IS A REQUIREMENT and
    is asserted here against the worst lift the schedule actually demands, so
    it cannot be quietly outgrown by a change to the geometry or the schedule.
    """
    height = (underside - hip_z) + RAIL_DROP
    if height < worst_lift + 0.020:
        raise AssertionError(
            "the swing lift is %.5f u and the hip housing is only %.5f deep -- "
            "the blade would climb out of its own housing. Deepen it or change "
            "the schedule; do NOT clip the lift, which drives the apex through "
            "the road." % (worst_lift, height))
    parts = []
    for tag, sign in (("l", 1.0), ("r", -1.0)):
        parts.append(
            td.box("hip_housing_" + tag, (RAIL_L, RAIL_T, height),
                   location=(PIN_X + RAIL_X, sign * BLADE_Y,
                             hip_z - RAIL_DROP + height * 0.5),
                   mat=m["tin_dark"], parent=body))
    return parts


def _world_span(parts, axis):
    """(min, max) of a part list along one world axis, over real vertices."""
    vals = [(obj.matrix_world @ v.co)[axis]
            for obj in parts for v in obj.data.vertices]
    return min(vals), max(vals)


def build_rank(m, body, lid_top):
    """Three ordinary cargo cages, ranked along model +x. One list per cage.

    `chassis.cargo_cage()` is SEALED. This PLACES it three times and scales it
    uniformly, which is the only variation roster Law 02 sanctions in its own
    words. Nothing about its construction, bar count, proportions or materials
    is touched, and it must not be: it is the one part every body in this
    faction shares, and a variant that restyles it removes the only common
    element.

    Its `at` is the cage's own origin, and the cage is NOT symmetric about it,
    so CAGE_X0 shifts the whole rank to centre the BUILT extent on the hull
    rather than centring the origins and letting the extent fall where it may.
    """
    cages = [chassis.cargo_cage(m, body, 0.0, scale=CAGE_SCALE,
                               at=(CAGE_X0 + i * CAGE_PITCH, 0.0, 0.0))
             for i in (-1, 0, 1)]
    bpy.context.view_layer.update()
    # Seat the rank so its BOTTOM is CAGE_SINK below the lid top. MEASURED off
    # the built cages rather than computed from the sealed part's source, so a
    # change inside that part moves this correctly instead of silently.
    flat = [obj for cage in cages for obj in cage]
    low = _world_span(flat, 2)[0]
    shift = (lid_top - CAGE_SINK) - low
    for obj in flat:
        obj.location = (obj.location[0], obj.location[1],
                        obj.location[2] + shift)
    bpy.context.view_layer.update()
    return cages


def assert_rank_disjoint(parts_per_cage):
    """The three cages must not touch. NOT excusable by PENETRATION_CONTACTS.

    See the note under PENETRATION_CONTACTS: prefix matching cannot tell cage 1
    from cage 2, so ("cargo_", "cargo_") excuses a real collision between
    neighbours along with the intended self-contact. This measures the thing
    the exclusion hides, with a different instrument, and it is the only reason
    that exclusion is honest.
    """
    spans = sorted(_world_span(parts, 0) for parts in parts_per_cage)
    gaps = []
    for i in range(len(spans) - 1):
        gap = spans[i + 1][0] - spans[i][1]
        gaps.append(gap)
        if gap <= 0.0:
            raise AssertionError(
                "cages %d and %d overlap by %.5f u -- PENETRATION_CONTACTS "
                "cannot see this, because prefix matching excuses "
                "cargo_x against cargo_x.001" % (i, i + 1, -gap))
    return spans, gaps


# --- the gait ----------------------------------------------------------------


def contact_x(theta, point):
    """Where a leg-local point sits in x after a rotation of `theta` about y."""
    return point[0] * math.cos(theta) + point[1] * math.sin(theta)


def contact_z(theta, point):
    """...and in z. Rotation about +y: z' = -x sin(theta) + z cos(theta)."""
    return -point[0] * math.sin(theta) + point[1] * math.cos(theta)


def solve_theta(target_x, point, bracket=(-1.4, 1.4)):
    """The rotation that puts `point` at `target_x`.

    Bisection: `contact_x` is monotonic across this bracket for any apex below
    its pivot, and bisection needs nothing more. A closed form exists and is
    not used -- it has a branch choice that is right for this apex and wrong
    for one placed forward of the pin, which is a trap for whoever next edits
    BLADE_C.
    """
    lo, hi = bracket
    for _ in range(90):
        mid = 0.5 * (lo + hi)
        if contact_x(mid, point) > target_x:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def theta_m():
    """The half-swing angle. DERIVED from the depth and the schedule.

    Not typed, so that a change to BLADE_DEPTH, PLANT_FRAMES or WALK_FRAMES
    cannot leave a stale angle behind -- which is the exact defect
    `gait_solve`'s header describes on the chassis's fixed 28 degrees, where
    "every body that changed its leg length inherited the same 28 and slid by
    the difference, out to 19.867 px on the Dray".
    """
    span = gait_solve.plant_span_units(WALK_FRAMES, PLANT_FRAMES)
    angle = gait_solve.swing_angle_for(BLADE_DEPTH, span)
    if angle is None:
        raise AssertionError(
            "a pivot %.4f u above the apex cannot reach a %.6f u plant at any "
            "angle -- this is the Dray's defect and no angle fixes it; change "
            "the geometry or the plant schedule" % (BLADE_DEPTH, span))
    return angle


def build_gait(frames=WALK_FRAMES, sole=None):
    """The whole cycle, solved: per-leg angles, per-leg lift, and the body bob.

    Returns (theta[leg][frame], lift[leg][frame], bob[frame], report).

    THE PLANT ANGLES ARE SOLVED SO THE CONTACT IS LINEAR IN FRAME INDEX, which
    is the brief's "ramp the contact, not the angle". Ramping theta linearly
    instead and letting the contact follow leaves the curvature of sin as
    residual -- the brief measures that at 0.011 u, half a screen pixel, and
    says it would accept it on review but not choose it. It costs one arcsin.

    THE SWING ANGLES are a cubic Hermite whose end tangents match the plant's
    own angular rate at toe-off and at heel strike, so the blade does not
    visibly change gear at either transition.
    """
    step = gait_solve.travel_per_frame(frames)
    span = gait_solve.plant_span_units(frames, PLANT_FRAMES)
    tm = theta_m()

    report = {"span_required": span, "theta_m_deg": math.degrees(tm),
              "step_units": step, "defect_factor": GAIT_DEFECT}

    # z comes from the LOWEST point of the contact band, x from its centroid.
    # Falls back to the ideal apex only for the layout pass in `build()`, where
    # the mesh does not exist yet.
    band = sole or [BLADE_C]

    def ground_z(theta):
        return min(contact_z(theta, p) for p in band)

    # GAIT_DEFECT is 1.0 for every real export. See its definition.
    anchor = contact_x(-tm, BLADE_C)
    plant = [solve_theta(anchor - k * step * GAIT_DEFECT, BLADE_C)
             for k in range(PLANT_FRAMES)]
    hip_max = max(-ground_z(t) for t in plant)
    report["span_built"] = (contact_x(plant[0], BLADE_C)
                            - contact_x(plant[-1], BLADE_C))
    report["span_error"] = report["span_built"] - span

    swing_intervals = frames - (PLANT_FRAMES - 1)
    v0 = (plant[-1] - plant[-2]) * swing_intervals
    v1 = (plant[1] - plant[0]) * swing_intervals

    def swing(s):
        u = (s - (PLANT_FRAMES - 1)) / float(swing_intervals)
        return ((2 * u ** 3 - 3 * u ** 2 + 1) * plant[-1]
                + (u ** 3 - 2 * u ** 2 + u) * v0
                + (-2 * u ** 3 + 3 * u ** 2) * plant[0]
                + (u ** 3 - u ** 2) * v1)

    def phase(leg, f):
        return (f - (0 if leg == 0 else LEG_OFFSET)) % frames

    theta = [[0.0] * frames, [0.0] * frames]
    for leg in (0, 1):
        for f in range(frames):
            s = phase(leg, f)
            theta[leg][f] = plant[s] if s < PLANT_FRAMES else swing(s)

    # THE BODY HEIGHT IS THE PLANTED LEG'S DEMAND, never an authored curve.
    # With duty exactly 0.5 there is a planted leg at EVERY frame, so unlike
    # the Vanguard there are no float frames to interpolate across -- and a
    # missing demand here would be a schedule bug rather than a gap to fill.
    bob = [None] * frames
    for f in range(frames):
        for leg in (0, 1):
            if phase(leg, f) < PLANT_FRAMES:
                bob[f] = -ground_z(theta[leg][f]) - hip_max
    missing = [f for f in range(frames) if bob[f] is None]
    if missing:
        raise AssertionError(
            "frames %s have NO planted leg. Duty 0.5 with LEG_OFFSET %d and "
            "PLANT_FRAMES %d of %d must leave none -- this body must never "
            "present an airborne frame, because it freezes for 1.3 s on "
            "whatever frame it is on." % (missing, LEG_OFFSET, PLANT_FRAMES,
                                          frames))

    # The swing lift: whatever it takes to hold the apex on the required
    # profile, and exactly zero while the blade is planted.
    lift = [[0.0] * frames, [0.0] * frames]
    worst = 0.0
    worst_clear = None
    for leg in (0, 1):
        for f in range(frames):
            s = phase(leg, f)
            if s < PLANT_FRAMES:
                continue
            u = (s - (PLANT_FRAMES - 1)) / float(swing_intervals)
            want = max(SWING_CLEARANCE,
                       SWING_PEAK * math.sin(math.pi * u) ** SWING_SHAPE)
            apex = hip_max + bob[f] + ground_z(theta[leg][f])
            need = want - apex
            if need > 0.0:
                lift[leg][f] = need
                worst = max(worst, need)
            clear = apex + lift[leg][f]
            if worst_clear is None or clear < worst_clear:
                worst_clear = clear

    if worst_clear < SWING_CLEARANCE - 1e-9:
        raise AssertionError(
            "a swing frame clears the road by only %.5f u, under the %.5f the "
            "brief requires; a tipped corner clips the road on a body this "
            "large" % (worst_clear, SWING_CLEARANCE))

    report["hip_max"] = hip_max
    report["hip_min"] = hip_max + min(bob)
    report["bob_units"] = -min(bob)
    report["worst_swing_lift"] = worst
    report["worst_swing_clearance"] = worst_clear
    return theta, lift, bob, report


def worst_plate_top(theta, lift, tops):
    """How far the blade's top band rises above the hip pin's REST height.

    Swept over every frame of both legs, with the swing lift in it -- the peak
    is neither at the extreme angle nor at peak lift but between them, so it
    has to be measured across the schedule rather than reasoned to.

    THE BODY BOB IS DELIBERATELY NOT IN THIS. The hull and the leg roots are
    both children of the body, so the bob moves them together and cancels
    exactly. An earlier version of this function subtracted it, which flattered
    the answer by up to 0.057 u -- a clearance measured in the wrong frame of
    reference, which is a comparison straddling an owner change with the owner
    being the coordinate system.
    """
    worst, at = -1e9, None
    for leg in (0, 1):
        for f in range(len(theta[leg])):
            for p in tops:
                z = contact_z(theta[leg][f], p) + lift[leg][f]
                if z > worst:
                    worst, at = z, (leg, f)
    return worst, at


def _sat_separation(poly, rect):
    """2D separation between a convex polygon and an axis-aligned rectangle.

    Positive is the gap; negative is the overlap depth. Exact for two convex
    sets: the separating-axis set is the rectangle's two axes plus the
    polygon's own edge normals, and nothing else can separate two convex
    polygons in the plane.

    `rect` is (xmin, xmax, zmin, zmax).
    """
    xmin, xmax, zmin, zmax = rect
    corners = [(xmin, zmin), (xmax, zmin), (xmax, zmax), (xmin, zmax)]
    axes = [(1.0, 0.0), (0.0, 1.0)]
    for i in range(len(poly)):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % len(poly)]
        nx, nz = -(bz - az), (bx - ax)
        length = math.hypot(nx, nz)
        if length > 1e-12:
            axes.append((nx / length, nz / length))

    best = -1e9
    for ax, az in axes:
        pa = [p[0] * ax + p[1] * az for p in poly]
        pb = [c[0] * ax + c[1] * az for c in corners]
        sep = max(min(pa) - max(pb), min(pb) - max(pa))
        if sep > best:
            best = sep
    return best


def blade_hull_clearance(theta, lift, hip_z, rect, pad=0.015):
    """The real triangle against the real hull, every frame, both legs.

    THIS EXISTS BECAUSE `check_penetration.py` CANNOT SEE THIS PAIR CORRECTLY,
    AND ITS OWN HEADER SAYS SO: "a box is a poor proxy for a diagonal taper,
    whose box is mostly air -- so a hit on a long thin diagonal member deserves
    a look at the solid before it is believed." An apex-down plate is exactly
    that. Its local bounding box is the rectangle [0, 0.420] x [-0.4635, 0] and
    the triangle fills half of it; the empty corner sits at (0.420, 0), which
    is the corner that swings HIGHEST as the blade rotates back. At maximum
    negative swing that phantom corner rises 0.2006 u above the pin while the
    real top edge rises 0.0600 -- so the AABB pass reports a 0.10 u overlap on
    a plate that is 0.03 u clear of the hull.

    So the pair is declared in PENETRATION_CONTACTS **and replaced by this**,
    which is STRICTER than the test it excuses rather than weaker: exact convex
    separation on the true triangle, every frame, with `pad` covering the
    bevel. An exclusion paired with a sharper instrument is not an exclusion
    that grew -- clause 8's failure is an exclusion paired with nothing.

    Returns (worst_clearance, leg, frame).
    """
    worst, at = 1e9, None
    for leg in (0, 1):
        for f in range(len(theta[leg])):
            t, dz = theta[leg][f], hip_z + lift[leg][f]
            poly = [(PIN_X + contact_x(t, p), dz + contact_z(t, p))
                    for p in (BLADE_A, BLADE_B, BLADE_C)]
            sep = _sat_separation(poly, rect) - pad
            if sep < worst:
                worst, at = sep, (leg, f)
    return worst, at[0], at[1]


def animate_walk(body, parts, hip_z, frames=WALK_FRAMES, sole=None):
    """Key the solved cycle. Returns the gait report.

    NOT `chassis.animate_walk_grouped`, and the reason is structural rather
    than stylistic: that function plants a fixed hip rotation of 28 degrees
    never compared to the stride, authors its own bob and roll, and ramps the
    ANGLE. This body solves its angle against the stride, takes its bob from
    the blade's own geometry, and ramps the CONTACT. None of that is reachable
    through that function's arguments.

    NO ROLL. The geometric bob is this body's beat; a roll laid over it reads
    as a limp, and the Tyrant does not limp -- it is the one body in the game
    that never hurries.
    """
    theta, lift, bob, report = build_gait(frames, sole)
    keys = ("leg_l", "leg_r")
    for f in range(frames):
        frame = 1 + f
        body.location = (0.0, 0.0, bob[f])
        body.keyframe_insert("location", frame=frame)
        for leg, key in enumerate(keys):
            obj = parts[key]
            obj.rotation_euler = (0.0, theta[leg][f], 0.0)
            obj.keyframe_insert("rotation_euler", frame=frame)
            obj.location = (PIN_X, obj.location[1], hip_z + lift[leg][f])
            obj.keyframe_insert("location", frame=frame)
    bpy.context.scene.frame_set(1)
    report["theta"] = theta
    report["lift"] = lift
    report["bob"] = bob
    return report


def measure_plant(leg_name, frames=WALK_FRAMES):
    """Re-measure a solved plant from POSED geometry. (peak, track).

    Separate from the solver ON PURPOSE, for the reason `gait_solve` gives: the
    solver's own convergence proves only that it hit the target it was handed,
    not that the target was right. This reads `matrix_world` frame by frame --
    so the leg rotation, the swing lift and the body bob are all in it -- and
    walks the plant in CYCLE order, including the wrap the solver never sees.

    The authority is still `node tools/check-gait-slip.js enemy-boss` on the
    EXPORTED file. Agreement between this number and that one is the evidence;
    this number alone is not.
    """
    leg = bpy.data.objects[leg_name]
    reference = sole_reference(leg)
    step = gait_solve.travel_per_frame(frames)
    offset = 0 if leg_name.endswith("_l") else LEG_OFFSET
    plant = [f for f in range(frames)
             if (f - offset) % frames < PLANT_FRAMES]
    track = []
    for i, f in enumerate(plant):
        bpy.context.scene.frame_set(1 + f)
        bpy.context.view_layer.update()
        track.append((leg.matrix_world @ reference).x + i * step)
    return max(track) - min(track), track


# --- assembly ----------------------------------------------------------------


def build():
    """Returns (root, body, parts, hip_z, band).

    TWO PASSES, AND THE ORDER IS THE POINT. The hip height is set by whatever
    actually touches the road, and that is the BEVELLED contact band, which
    does not exist until the blade has been built. So the blades go up first
    against the ideal apex, the band is measured off them, and the hip is
    re-solved against the measurement before anything else is placed. Building
    the container first and correcting afterwards would leave the hull and the
    pins out of register -- small, but exactly the kind of small that nobody
    finds later.
    """
    m = chassis.materials()

    root = td.root("boss")
    body = td.root("boss_body")
    body.parent = root
    body.location = (0.0, 0.0, 0.0)

    # PASS 1 -- the blades, seated on the ideal apex.
    layout = build_gait(WALK_FRAMES)[3]
    leg_l, leg_r = build_legs(m, body, layout["hip_max"])
    parts = {"leg_l": leg_l, "leg_r": leg_r}

    # PASS 2 -- re-solve the hip against the band that will actually touch the
    # road, and re-seat the pins on the answer. Clause 6: feet at z = 0.
    band = sole_band_points(leg_l)
    theta, lift, bob, report = build_gait(WALK_FRAMES, band)
    hip_z = report["hip_max"]
    for key in ("leg_l", "leg_r"):
        location = parts[key].location
        parts[key].location = (location[0], location[1], hip_z)
    bpy.context.view_layer.update()

    # HULL_GAP IS ASSERTED AGAINST THE MEASURED SWEEP, NOT DECLARED. An
    # apex-down plate's WIDE edge is at the pivot and rises above it as the
    # blade rotates back; the Vanguard found 26 real penetrations this way and
    # had to move its whole frame. Measured here across every frame of both
    # legs with the lift and the bob in it, and asserted before the hull is
    # placed rather than discovered by check_penetration afterwards.
    tops = blade_top_points(leg_l)
    rise, at = worst_plate_top(theta, lift, tops)
    if rise + 0.020 > HULL_GAP:
        raise AssertionError(
            "the blade's top band rises %.5f u above the pin (leg %d, frame "
            "%d) and HULL_GAP is only %.5f -- the plate would cut into the "
            "container. Raise HULL_GAP or lower BLADE_B." % (
                rise, at[0], at[1], HULL_GAP))

    underside = hip_z + HULL_GAP
    _hull, lid_top = build_hull(m, body, underside)

    # The exact solid test that stands in for the AABB pass on this one pair.
    # See `blade_hull_clearance`. Run AFTER the hull is placed, against the
    # hull's real footprint rather than against the intent.
    rect = (-HULL_LEN * 0.5, HULL_LEN * 0.5, underside, underside + HULL_H)
    clear, cleg, cframe = blade_hull_clearance(theta, lift, hip_z, rect)
    # A MARGIN, NOT A SIGN TEST. The first build of this body passed a `> 0`
    # version of this assert at 0.00006 u and that is not a pass, it is a
    # coincidence that any later edit would have turned into a defect without
    # anyone touching this line.
    if clear < 0.020:
        raise AssertionError(
            "the blade comes within %.5f u of the hull (leg %d, frame %d), "
            "under the 0.020 margin. This is a SOLID test, not the AABB pass, "
            "so it is not an artefact. Lower BLADE_B -- its depth costs no "
            "plate area -- or raise HULL_GAP." % (clear, cleg, cframe))
    build_hip_housings(m, body, hip_z, underside, report["worst_swing_lift"])
    cages = build_rank(m, body, lid_top)
    spans, gaps = assert_rank_disjoint(cages)

    report["plate_rise"] = rise
    report["hull_clearance"] = clear
    report["hull_clearance_at"] = (cleg, cframe)
    report["rank_spans"] = spans
    report["rank_gaps"] = gaps
    report["lid_top"] = lid_top
    report["cage_proud"] = _world_span(
        [obj for cage in cages for obj in cage], 2)[1] - lid_top
    report["figure_top"] = lid_top + report["cage_proud"]

    bpy.context.view_layer.update()
    return root, body, parts, hip_z, band, report


def export_build():
    """The exporter contract: build, animate, return the frame count."""
    _root, body, parts, hip_z, band, layout = build()
    report = animate_walk(body, parts, hip_z, WALK_FRAMES, band)
    peak, _track = measure_plant("leg_l", WALK_FRAMES)
    peak_r, _t = measure_plant("leg_r", WALK_FRAMES)
    peak = max(peak, peak_r)
    px = gait_solve.UNITS_TO_PX * 2.4
    print("  tyrant: F=%d  P=%d  duty %.3f  offset %d  "
          "theta_m=%.4f deg (DERIVED from depth %.4f, not typed)"
          % (WALK_FRAMES, PLANT_FRAMES, PLANT_FRAMES / float(WALK_FRAMES),
             LEG_OFFSET, report["theta_m_deg"], BLADE_DEPTH))
    print("  tyrant: span required %.6f u   built %.6f u   error %+.2e u"
          % (report["span_required"], report["span_built"],
             report["span_error"]))
    print("  tyrant: hip %.5f..%.5f   free bob %.5f u = %.3f board px"
          % (report["hip_min"], report["hip_max"], report["bob_units"],
             report["bob_units"] * px))
    print("  tyrant: worst swing lift %.5f u   worst swing clearance %.5f u"
          % (report["worst_swing_lift"], report["worst_swing_clearance"]))
    print("  tyrant: A (pre-export, posed) %.6f u = %.4f board px at 2.4"
          % (peak, peak * px))
    print("  tyrant: B (sawtooth) %.6f u = %.4f board px at 2.4"
          % (gait_solve.travel_per_frame(WALK_FRAMES),
             gait_solve.travel_per_frame(WALK_FRAMES) * px))
    print("  tyrant: plate top rises %.5f u above the pin (HULL_GAP %.3f)"
          % (layout["plate_rise"], HULL_GAP))
    print("  tyrant: blade-vs-hull SOLID clearance %.5f u (leg %d, frame %d) "
          "-- the AABB pass reports ~0.105 u of PHANTOM overlap on this pair"
          % (layout["hull_clearance"], layout["hull_clearance_at"][0],
             layout["hull_clearance_at"][1]))
    print("  tyrant: rank gaps %s   cages proud of the lid %.5f u = %.2f "
          "screen px" % (["%.4f" % g for g in layout["rank_gaps"]],
                         layout["cage_proud"], layout["cage_proud"] * 40.11))
    print("  tyrant: figure top %.5f u   plates are %.1f%% of it"
          % (layout["figure_top"], 100.0 * BLADE_DEPTH / layout["figure_top"]))
    if GAIT_DEFECT != 1.0:
        print("  tyrant: *** TYRANT_GAIT_DEFECT=%.4f -- THIS IS THE NEGATIVE "
              "CONTROL AND MUST NOT BE COMMITTED ***" % GAIT_DEFECT)
    bpy.context.scene.frame_set(1)
    return WALK_FRAMES
