# ---------------------------------------------------------------------------
# Enemy type `boss_fast` -- the VANGUARD. 750 hp, sizeScale 1.9,
# speedMultiplier 1.75, and a doubled sprint over the first 400 u.l.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-boss_fast
#
# THE FILE NAME IS THE TYPE ID. `gl-world.js::enemyModel()` looks up
# "enemy-" + enemy.typeId and the type id is `boss_fast`, so the generated file
# is `enemy-boss_fast.js`, underscore and all. This module is named for the
# lore name, which is the convention the 2026-08-13 batch settled on.
#
# ---------------------------------------------------------------------------
# PROVENANCE -- READ THIS BEFORE TRUSTING A NUMBER BELOW
# ---------------------------------------------------------------------------
#
# This body was built while its own brief did not exist, and the two halves of
# its direction have DIFFERENT evidence behind them. A reader must be able to
# tell them apart, so:
#
#   DOCUMENT-BACKED. `tools/blender/BRIEF-enemy-boss-tyrant.md`, mira, same day:
#     * line 65 -- the frame-count table carries a Vanguard row of its own,
#       `| Vanguard enemy-boss_fast | 1.90 | 36 | 0.94 | 34 |`. F = 36 is hers
#       and is checkable in the tree.
#     * line 163 -- the Tyrant's plate is apex-UP and that is "the correct
#       orientation *for this body* and the wrong one for the Vanguard ... the
#       same primitive is inverted there". Apex-DOWN is hers too.
#
#   RELAY ONLY, NOT IN ANY DOCUMENT. The blade vertices, theta_m, the plant
#     count, the leg offset and the float phase reached this module through
#     mira -> suki -> here, verbally. `BRIEF-enemy-boss_fast-vanguard.md` is
#     named as the Tyrant brief's companion at its line 5 and DOES NOT EXIST on
#     disk. Every geometric number in the next section rests on that two-hop
#     chain and on the arithmetic check below -- which it passes, but a passing
#     check on a relayed number is not a document.
#
# WHAT WAS CHECKED RATHER THAN BELIEVED, and it closes to six decimals:
#
#     2 * 0.41773 * cos(11.0409 deg) * sin(25.2449 deg) = 0.349720 u
#     (15 - 1) * 0.899281 / 36                          = 0.349720 u
#
# with 11.0409 deg = atan(0.08 / 0.41). The 0.82 lever arm is exact and not a
# rounding of 2 x 0.41: it is the horizontal reach of an apex 11.04 degrees off
# vertical. The angle was VERIFIED here, never re-solved -- the blade and the
# angle are coupled and the blade is the art director's call.
#
# ---------------------------------------------------------------------------
# THE GAIT LAW, AND WHY F IS 36 AND NOT 8
# ---------------------------------------------------------------------------
#
# One walk cycle is exactly 0.899281 MODEL UNITS of travel along model +x, for
# every body, at every sizeScale, at every speed. The slip has two components
# and only one of them is authorable:
#
#   A -- AUTHORED GAIT ERROR. The pose failing to sweep that distance. This is
#        what the plant solve below drives to zero.
#   B -- THE QUANTIZATION SAWTOOTH. `bandFrame` FLOORS (gl-world.js:1565), so a
#        pose is HELD while the body keeps translating. The contact drags
#        forward by one step every displayed frame and snaps back. Amplitude is
#        exactly S/F and NO RIG QUALITY TOUCHES IT. The only lever is F.
#
# THE FIRST BUILD OF THIS BODY SHIPPED F = 8 AND IT WAS THE WRONG TEST. Eight
# frames were justified on POSE HOLD -- 0.0746 s, level with the Gleaner -- and
# pose hold is about smoothness while B is about distance. At F = 8 this body
# drags 6.79 board px per frame with a perfectly authored gait; at F = 36 it is
# 1.51. Frames cost ZERO triangles and ZERO draw calls -- a frame is one 4x4
# per animated group -- so the whole fix is bytes.
#
# PLANT REQUIREMENT IS COUNTED IN INTERVALS, NOT SAMPLES. P planted frames are
# P poses and therefore P-1 TRANSITIONS, so the sweep is (P-1)*S/F and not
# P*S/F. Getting this off by one is a whole frame-step of error, and it is the
# single most likely way to produce a wrong answer that looks right.
#
# RAMP THE CONTACT, NOT THE ANGLE -- mira's rule, in her Tyrant brief's words.
# The plant angles below are solved one per frame so the CONTACT X is linear in
# frame index. Ramping theta linearly instead and letting the contact follow
# leaves the curvature of sin as residual; on this blade at P = 15 that is
# 0.0044 u, which is 0.27 board px and about thirty times the residual the
# solved version reaches.
#
# ---------------------------------------------------------------------------
# THE SWING NEEDS A LIFT, AND THAT IS A FINDING RATHER THAN A CHOICE
# ---------------------------------------------------------------------------
#
# A blade with a POINT contact has a hip height of `|C| * cos(theta + 11.04)`,
# which peaks at 0.41773 u and falls to 0.33678 u at toe-off -- the body pitches
# down 0.081 u, 4.9 board px at 1.9, across every plant. That pitch is FREE and
# is deliberately not damped: mira's own rule is that an authored bob fights a
# geometric one and produces a limp, and damping this one means moving C, which
# is hers and not mine.
#
# BUT IT ALSO MEANS THE HIP DROPS 19% BELOW THE LEG'S OWN LENGTH. A rigid
# single-segment leg with no knee cannot then clear the road on the recovery: at
# the worst frame the apex would be driven 0.083 u THROUGH it. Measured across
# the whole cycle, not estimated -- and it is not fixable by a better swing
# path, because at that frame the recovering blade is four frames from heel
# strike and has to be near -theta_m to plant at all.
#
# So the swinging leg's ROOT is lifted in z, which is the chassis's own
# mechanism (`_set_sole_height` lifts every swinging foot on every body in the
# project) and the blade itself still only rotates while it is planted -- which
# is the part of "the plate does not translate" that the gait actually rests on.
# The lift is swallowed by a HIP RAIL deep enough to contain it, and the rail is
# declared in PENETRATION_CONTACTS: the Dray already ships exactly this
# ("a leg is socketed into its rail and slides up into it through the swing --
# that is what the rail depth is for").
#
# **THIS IS WORTH A RULING AND HAS BEEN REPORTED UP.** If mira wants a leg that
# never translates, the geometry has to change -- a shorter |C|, a longer duty,
# or no float phase. Nothing in the rig can produce it from these numbers.
#
# ---------------------------------------------------------------------------
# THE BODY: THREE REMOVALS AND ONE PROPORTION
# ---------------------------------------------------------------------------
#
#   removed  the crown -- no antenna, the Skimmer's separator and the fast
#            family's signature. The top fifth of the Gleaner's outline is the
#            one place nothing else occludes.
#   removed  the arms, entirely. Not stubs -- gone. `chassis.arms()` is never
#            called and the gait is handed no arms at all, exactly as the
#            Tender does. This is the most stripped-down body in its faction
#            and a thing that carries nothing needs nothing to carry with.
#   removed  the shield projectors. The seven-second pulse is `pick: "self"`
#            and the runtime supplies the field, so baking clamped-on hardware
#            would put permanent glass on a body whose statement is that it has
#            none.
#   changed  THE LEGS, into mira's inverted plate. Two blades, 0.418 u from pin
#            to apex, 44% of the figure's height -- the same fraction her Tyrant
#            gives its plates.
#
# The 20-degree chassis stoop is KEPT and unmodified. On the Gleaner it reads as
# carrying something heavier than it was built for; on a body with nothing in
# its hands and a blade under it, the same angle reads as a sprinter's forward
# pitch. Free, and it keeps the family stamp intact.
#
# CLAUSE 3b, BY CONSTRUCTION. The body root's rest is its HIGHEST pose: the
# per-frame bob is `hip(f) - HIP_MAX` and is therefore never positive, so no
# frame rises above the geometry stored in the root's local space. The head owns
# the top and hangs off that root; the blades are limb roots and hang DOWN.
# Quote the margin from `node tools/check-model-top.js`, never from the root's z.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import bpy

import td_scene as td
import enemy_chassis as chassis
import gait_solve

ORTHO_SCALE = chassis.ORTHO_SCALE

# mira's Vanguard row in BRIEF-enemy-boss-tyrant.md line 65. Document-backed.
WALK_FRAMES = 36

# --- the blade ---------------------------------------------------------------
#
# RELAY, NOT DOCUMENT -- see the provenance note above. Leg-local, hip pin at
# the origin, in the model's x-z plane. Apex DOWN: the Tyrant's plate inverted,
# which is line 163 of her brief.
#
#   A  the hip pin, and the rear end of the top edge
#   B  the front end of the top edge -- the blade's forward reach
#   C  THE SINGLE GROUND APEX. One contact, so there is no heel-to-toe handover
#      and no frame at which the identity of the measured point changes. That
#      is the property the Tyrant's flat sole has to work around with a
#      per-corner check, and this body gets it for free.
BLADE_A = (0.000, 0.000)
BLADE_B = (0.340, -0.060)
BLADE_C = (-0.080, -0.410)
BLADE_Y = 0.095                 # blade centreline offset from the model axis
BLADE_T = 0.130                 # thickness in y

# The two blades span y in [0.030, 0.160] and [-0.160, -0.030], so there is
# 0.060 u of clear air between their facing faces at EVERY frame and
# blade-against-blade contact is structurally impossible rather than checked.

# mira's solve. VERIFIED here, never re-derived -- see the provenance note.
THETA_M_DEG = 25.2449
PLANT_FRAMES = 15               # P: planted frames per leg, of 36
LEG_OFFSET = 18                 # half a cycle, so 6 frames of float per cycle

# Mira's Tyrant asks for >= 0.02 u of swing clearance at sizeScale 2.4. Scaled
# to this body's 1.9 that is 0.0253 u for the same screen clearance; 0.020 is
# what the geometry can carry without a larger rail, and it is stated rather
# than assumed.
SWING_CLEARANCE = 0.020

# --- the frame ---------------------------------------------------------------

# THE CHEST SITS 0.32 ABOVE THE PIN, NOT THE CHASSIS'S 0.14, AND THAT IS A
# MEASURED CLEARANCE RATHER THAN A PROPORTION. An apex-DOWN plate puts its WIDE
# edge at the top, at the pivot -- so the forward vertex B sweeps UP as the
# blade rotates back, reaching 0.113 u ABOVE the pin at maximum negative swing.
# At the chassis's own 0.14 that edge cuts straight through the lower chest,
# the lower torso band and the cargo hold: 26 real penetrations, worst 0.0725 u,
# and NOT an AABB artefact -- the blade top is genuinely inside the torso solid
# at the front of the stride. Verified by raising this number until
# `check_penetration.py` came back clean rather than by declaring the pairs,
# because a blade through the glowing hold is not a socket and declaring it
# would have been rule 3's "exclusions quietly grew until the check measured
# the requirement instead of the defect".
#
# THIS IS THE COST OF THE INVERSION AND THE BRIEF DOES NOT COST IT. mira's
# Tyrant puts its hull underside at 0.4935 over pins at 0.4635 -- the hull sits
# essentially ON the pins, which an apex-UP plate allows because nothing of it
# ever rises above its own pivot. Inverted, the wide edge IS at the pivot and
# sweeps 0.113 u above it, plus up to 0.086 u of swing lift. So the same
# primitive, turned over, forces the body 0.46 u clear of the pin where the
# Tyrant needed 0.03. Reported up; if that proportion is wrong, the lever is
# B's forward reach, which is mira's.
HIP_DROP = 0.46

# The narrowed frame. THE YOKE IS THE BINDING WIDTH, not the chest: at the
# chassis default it is 0.42 across against the torso's 0.24, so it is the
# widest part of the whole body group. Narrowing "the chest" alone would
# measure no change at all (`enemy_skimmer.py` header, measured by mira).
TORSO_W = 0.205
YOKE_W = 0.240
HIP_W = 0.215
BAND_W = 0.205

# THE HOLD. The cage is SEALED: only its PLACEMENT and uniform SCALE are
# touched, which roster Law 02 sanctions in its own words. 0.55 is the smallest
# hold in the family -- against the Tender's 0.62, the Skimmer's 0.70 and the
# Courier's 1.0 -- because this unit spent its capacity on the stride. It is
# pushed FORWARD so the drum, the core and the two coarse guard bars stay proud
# of the chest's front face: the caged red core is the one part every body in
# this faction shares, and a hold sunk inside the chest would have stripped the
# faction read along with everything else.
CAGE_AT = (0.100, 0.0, 0.090)
CAGE_SCALE = 0.55

# The hip rail. Deep enough to swallow the swing lift -- see the header. Sized
# from the measured lift, not guessed: RAIL_H must exceed the worst lift the
# schedule demands, which `build_gait()` asserts at build time.
RAIL_H = 0.320
RAIL_L = 0.190
RAIL_T = 0.150

# check-gait-slip.js's own SOLE_BAND, in model units: a vertex counts as sole
# if it sits within this much of its GROUP's lowest rest vertex. Copied rather
# than derived because the gate is JavaScript; if it moves, this moves.
SOLE_BAND = 0.02


PENETRATION_CONTACTS = [
    ("blade_", "hip_rail_", "THE BLADE IS SOCKETED INTO ITS RAIL and slides up "
     "into it across the swing -- that is what the rail depth is for, and it "
     "is the only thing there is for a limb with no knee to hang from. The "
     "same declaration the Dray makes about its own rails"),
    ("hip_rail_", "hip_brace", "the two rails are welded to the underside of "
     "the hip brace; the brace is what carries them"),
    ("hip_rail_", "torso", "and through it into the chest frame"),
    ("hip_rail_", "torso_band", "the lower band passes behind the rail heads"),
    ("torso", "torso", "the torso and its two bands are one welded frame -- "
     "the bands are straps AROUND the chest, so they contain it by "
     "construction"),
    ("torso", "shoulder_yoke", "the yoke is let into the top of the chest; it "
     "is structure, not a pauldron sitting on top of one"),
    ("torso", "hip_brace", "same weld at the bottom of the frame"),
    ("shoulder_yoke", "torso_band", "the upper band passes under the yoke"),
    ("hip_brace", "torso_band", "and the lower band passes under the brace"),
    ("torso", "cargo_", "the hold is BOLTED THROUGH the chest -- the retainer "
     "plate and the side housings sit inboard of the front face on purpose, "
     "which is what leaves the drum and its guard bars proud of it"),
    ("torso_band", "cargo_", "as above; the bands run behind the hold"),
    ("hip_brace", "cargo_", "as above"),
    ("shoulder_yoke", "cargo_", "as above"),
    ("torso", "cage_", "as above -- cage_top and cage_bottom are the plates "
     "the hold is carried on"),
    ("torso_band", "cage_", "as above"),
    ("shoulder_yoke", "cage_", "as above"),
    ("cargo_", "cargo_", "the drum, its core, the panes, the struts and the "
     "retainer are ONE SEALED ASSEMBLY; every glow surface is recessed inside "
     "a larger dark housing and that recess IS the contact"),
    ("cargo_", "cage_", "as above -- the cage plates close the same assembly"),
    ("cage_", "cage_", "as above"),
    ("lens", "lens_ring", "the lens is seated in its ring, as on every body in "
     "the faction"),
    ("head", "lens", "and the ring is let into the head plate"),
    ("head", "neck", "the neck enters the head; a head balanced on a post "
     "would read as detached at play size"),
    ("neck", "torso", "and the neck enters the chest at the other end"),
    ("neck", "shoulder_yoke", "it passes through the yoke's centre span"),
]


# --- geometry ----------------------------------------------------------------


def blade_mesh(name, a, b, c, thickness, mat, parent, location=(0.0, 0.0, 0.0)):
    """One triangular plate, standing in the model's x-z plane.

    "Perpendicular to the ground" is resolved exactly as mira resolves it for
    the Tyrant: the plate's PLANE is vertical and contains the travel axis, so
    it rotates only about y, never presents as a line, and shows its whole
    triangular area at camera yaw 0 -- the bearing 25 of 42 road segments give.

    Built with `from_pydata` rather than out of boxes because a triangle is not
    a stretched cube and the apex is the contact: a box proxy would put the
    contact on a face centre 0.075 u from where the gait solve expects it.
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


def sole_reference(leg):
    """The contact point of one leg, in that leg root's own local space.

    SOLVE AGAINST THE POINT THE GATE MEASURES, OR THE SOLVE IS AGAINST NOTHING.
    `check-gait-slip.js` selects its sole vertices from the group's REST
    geometry (`pos[k+2] <= gMinZ + SOLE_BAND`, unposed) and averages their x
    AFTER posing -- a fixed material set, so the point it tracks is the
    centroid of the sole band. This reproduces that rule exactly: evaluated,
    triangulated, per-loop positions -- which is what `export_mesh.extract`
    writes and what the gate reads -- expressed in the leg root's local space,
    band-selected on z, averaged.

    A BEVELLED APEX IS NOT ITS IDEAL APEX, AND THAT IS THE WHOLE REASON THIS
    EXISTS. `td_scene.bevel` rounds the contact corner off, so the centroid of
    the band sits above and inboard of the point the brief names. Left
    uncorrected on the first build of this body -- with a box foot, where the
    effect is smaller -- it cost 0.180 board px of pure net drift, twice the
    residual that was actually irreducible. `build_legs` shifts each blade so
    that this measured point lands on the briefed apex, which keeps mira's
    theta_m exactly right instead of re-solving the angle around a bevel.
    """
    import bmesh
    from mathutils import Vector

    depsgraph = bpy.context.evaluated_depsgraph_get()
    to_local = leg.matrix_world.inverted_safe()

    meshes = []

    def descend(node):
        for child in node.children:
            if child.type == "MESH":
                meshes.append(child)
            descend(child)

    descend(leg)

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

    floor = min(p.z for p in points)
    band = [p for p in points if p.z <= floor + SOLE_BAND]
    total = Vector((0.0, 0.0, 0.0))
    for p in band:
        total += p
    return total / float(len(band))


def build_legs(m, body, lift, hip_z):
    """Two blades on their own animated roots. Returns (leg_l, leg_r).

    THE BLADE IS SHIFTED SO ITS MEASURED CONTACT IS THE BRIEFED APEX. Built
    nominally, measured through `sole_reference`, then translated by the
    difference. The visual shift is under one bevel width; what it buys is that
    mira's theta_m stays exactly correct on the built mesh instead of being
    correct only on the ideal triangle. Re-measured afterwards and asserted, so
    a change to the bevel cannot silently reopen the gap.

    THE APEX NAMES ARE `blade_l` / `blade_r` and the roots `leg_l` / `leg_r`.
    Unique per leg, because every measurement here resolves objects through
    `bpy.data.objects[...]`, a GLOBAL lookup: a duplicate name collects
    Blender's automatic `.001` suffix and the wrong leg gets measured with
    nothing raised anywhere.

    THE BLADE IS `tin_dark`, WHICH IS CLAUSE 7 THE RIGHT WAY UP ON THIS BODY.
    The two plates are 44% of the figure and its largest surface, so they take
    the darkest value or they pull the eye off the character. It is also the
    Drudge's measured arrangement -- light frame over dark limbs separated at
    CR 1.91 across a long straight horizontal boundary; the inverse merged at
    CR 1.00.
    """
    from mathutils import Vector

    out = []
    for tag, sign in (("l", 1.0), ("r", -1.0)):
        leg = td.root("leg_" + tag)
        leg.parent = body
        leg.location = (0.0, sign * BLADE_Y, hip_z)
        blade_mesh("blade_" + tag, BLADE_A, BLADE_B, BLADE_C, BLADE_T,
                   m["tin_dark"], leg)
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
                "blade_%s contact did not land on the briefed apex: measured "
                "(%.6f, %.6f) against C (%.6f, %.6f)"
                % (tag, check.x, check.z, BLADE_C[0], BLADE_C[1]))
        out.append(leg)
    return tuple(out)


def build_hip_rails(m, body, lift):
    """The two rails the blades hang from and slide up into.

    NEW PART, DECLARED, AND STRUCTURAL RATHER THAN DECORATIVE. A blade has no
    knee, so the recovering leg is lifted bodily in z (see the header) and the
    rail is what that lift disappears into. Its DEPTH is the requirement:
    `build_gait` asserts RAIL_H against the worst lift the schedule actually
    demands, so the rail cannot be quietly outgrown by a change to the
    geometry or the plant count.
    """
    parts = []
    for tag, sign in (("l", 1.0), ("r", -1.0)):
        parts.append(
            td.box("hip_rail_" + tag, (RAIL_L, RAIL_T, RAIL_H),
                   location=(0.02, sign * BLADE_Y,
                             -HIP_DROP + RAIL_H * 0.5 - 0.02 + lift),
                   mat=m["tin"], parent=body))
    return parts


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
    and behind its pivot, and bisection needs nothing more. A closed form
    exists and is not used -- it has a branch choice that is right for this
    apex and wrong for one placed forward of the pin, which is a trap for
    whoever next edits BLADE_C.
    """
    lo, hi = bracket
    for _ in range(90):
        mid = 0.5 * (lo + hi)
        if contact_x(mid, point) > target_x:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def sole_band_points(leg):
    """Every point of the contact band, in leg-local (x, z). Clause 6's input.

    THE CONTACT IS A CENTROID BUT THE GROUND IS A MINIMUM, and the two are not
    the same point on a bevelled apex. `sole_reference` gives the centroid,
    which is what the gait GATE tracks in x and therefore what the swing angle
    is solved against. The ROAD, though, is touched by the lowest vertex of the
    band -- about 0.007 u below that centroid here. Planting the centroid at
    z = 0 sinks the blade tip 0.43 board px into the road, which is clause 6's
    "feet at z = 0" missed by a small amount for a subtle reason.

    So z is solved against this set and x against the centroid. They do not
    fight: a translation in z cannot change any contact's x, so the clause 6
    correction is exactly free for the gait.
    """
    import bmesh

    depsgraph = bpy.context.evaluated_depsgraph_get()
    to_local = leg.matrix_world.inverted_safe()

    meshes = []

    def descend(node):
        for child in node.children:
            if child.type == "MESH":
                meshes.append(child)
            descend(child)

    descend(leg)

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

    floor = min(p.z for p in points)
    return [(p.x, p.z) for p in points if p.z <= floor + SOLE_BAND]


def build_gait(frames=WALK_FRAMES, sole=None):
    """The whole cycle, solved: per-leg angles, per-leg lift, and the body bob.

    Returns (theta[leg][frame], lift[leg][frame], bob[frame], report).

    THE PLANT ANGLES ARE SOLVED SO THE CONTACT IS LINEAR IN FRAME INDEX, which
    is mira's "ramp the contact, not the angle". THE SWING ANGLES are a cubic
    Hermite whose end tangents match the plant's own angular rate at toe-off
    and at heel strike, so the blade does not visibly change gear at either
    transition -- and, usefully, the resulting overshoot past theta_m is
    exactly where the extra ground clearance is needed.
    """
    step = gait_solve.travel_per_frame(frames)
    span = gait_solve.plant_span_units(frames, PLANT_FRAMES)
    theta_m = math.radians(THETA_M_DEG)

    # VERIFY mira's angle. Do not re-solve it: the blade and the angle are
    # coupled and the blade is hers.
    briefed = -2.0 * BLADE_C[1] * math.sin(theta_m)
    report = {"span_required": span, "span_from_briefed_angle": briefed,
              "angle_error_units": briefed - span, "theta_m_deg": THETA_M_DEG}

    # z comes from the LOWEST point of the contact band, x from its centroid.
    # See `sole_band_points`. Falls back to the ideal apex only when the mesh
    # has not been built yet, which is the layout pass in `build()`.
    band = sole = sole or [BLADE_C]

    def ground_z(theta):
        return min(contact_z(theta, p) for p in band)

    plant = [solve_theta(contact_x(-theta_m, BLADE_C) - k * step, BLADE_C)
             for k in range(PLANT_FRAMES)]
    hip_max = max(-ground_z(t) for t in plant)

    swing_intervals = frames - (PLANT_FRAMES - 1)
    v0 = (plant[-1] - plant[-2]) * swing_intervals
    v1 = (plant[1] - plant[0]) * swing_intervals

    def swing(s):
        u = (s - (PLANT_FRAMES - 1)) / float(swing_intervals)
        return ((2 * u ** 3 - 3 * u ** 2 + 1) * plant[-1]
                + (u ** 3 - 2 * u ** 2 + u) * v0
                + (-2 * u ** 3 + 3 * u ** 2) * (-theta_m)
                + (u ** 3 - u ** 2) * v1)

    def phase(leg, f):
        return (f - (0 if leg == 0 else LEG_OFFSET)) % frames

    theta = [[0.0] * frames, [0.0] * frames]
    for leg in (0, 1):
        for f in range(frames):
            s = phase(leg, f)
            theta[leg][f] = plant[s] if s < PLANT_FRAMES else swing(s)

    # THE BODY HEIGHT IS THE PLANTED LEG'S DEMAND, never an authored curve.
    bob = [None] * frames
    for f in range(frames):
        for leg in (0, 1):
            if phase(leg, f) < PLANT_FRAMES:
                bob[f] = -ground_z(theta[leg][f]) - hip_max
    # The float frames, where neither blade is down. Linear between the last
    # demand and the next: a body thrown off one toe and caught on the other
    # heel travels a straight line to first order, and there is no contact to
    # contradict a better guess with.
    missing = [f for f in range(frames) if bob[f] is None]
    for f in missing:
        before = f - 1
        while bob[before % frames] is None:
            before -= 1
        after = f + 1
        while bob[after % frames] is None:
            after += 1
        t = (f - before) / float(after - before)
        bob[f] = bob[before % frames] * (1.0 - t) + bob[after % frames] * t

    # The swing lift: whatever it takes to hold the apex SWING_CLEARANCE above
    # the road, and zero while the blade is planted.
    lift = [[0.0] * frames, [0.0] * frames]
    worst = 0.0
    for leg in (0, 1):
        for f in range(frames):
            if phase(leg, f) < PLANT_FRAMES:
                continue
            apex = hip_max + bob[f] + ground_z(theta[leg][f])
            need = SWING_CLEARANCE - apex
            if need > 0.0:
                lift[leg][f] = need
                worst = max(worst, need)

    report["hip_max"] = hip_max
    report["hip_min"] = hip_max + min(bob)
    report["pitch_units"] = -min(bob)
    report["worst_swing_lift"] = worst
    report["float_frames"] = missing
    if worst > RAIL_H - 0.02:
        raise AssertionError(
            "the swing lift is %.4f u and RAIL_H is only %.4f -- the blade "
            "would climb out of its own rail. Deepen the rail or change the "
            "schedule; do not clip the lift, which drives the apex through "
            "the road." % (worst, RAIL_H))
    return theta, lift, bob, report


def animate_walk(body, parts, hip_z, frames=WALK_FRAMES, sole=None):
    """Key the solved cycle. Returns the gait report.

    NOT `chassis.animate_walk_grouped`, and the reason is structural rather
    than stylistic: that function plants exactly half the cycle per leg with no
    float phase, authors its own bob and roll, and ramps the ANGLE. This body
    is 15 planted of 36 with 6 frames of float, takes its bob from the blade's
    own geometry, and ramps the CONTACT. Every one of those is a requirement
    here and none of them is reachable through that function's arguments. The
    chassis is still the frame this body is built on -- torso, hold, head,
    palette and stoop are all its shared parts, unmodified.

    NO ROLL. The geometric pitch is this body's beat; a roll laid over it reads
    as a limp, which is mira's ruling on the Tyrant for the same reason.
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
            obj.location = (0.0, obj.location[1], hip_z + lift[leg][f])
            obj.keyframe_insert("location", frame=frame)
    bpy.context.scene.frame_set(1)
    return report


def measure_plant(leg_name, frames=WALK_FRAMES):
    """Re-measure a solved plant from POSED geometry. (peak, track).

    Separate from the solver ON PURPOSE, for the reason `gait_solve` gives: the
    solver's own convergence proves only that it hit the target it was handed,
    not that the target was right. This reads `matrix_world` frame by frame --
    so the leg rotation, the swing lift and the body bob are all in it -- and
    walks the plant in CYCLE order, including the wrap the solver never sees.

    The authority is still `node tools/check-gait-slip.js enemy-boss_fast` on
    the EXPORTED file. Agreement between this number and that one is the
    evidence; this number alone is not.
    """
    from mathutils import Vector

    leg = bpy.data.objects[leg_name]
    reference = sole_reference(leg)
    step = gait_solve.travel_per_frame(frames)
    plant = [f for f in range(frames)
             if (f - (0 if leg_name.endswith("_l") else LEG_OFFSET)) % frames
             < PLANT_FRAMES]
    track = []
    for i, f in enumerate(plant):
        bpy.context.scene.frame_set(1 + f)
        bpy.context.view_layer.update()
        track.append((leg.matrix_world @ reference).x + i * step)
    return max(track) - min(track), track


# --- assembly ----------------------------------------------------------------


def build():
    """Returns (root, body, parts, hip_z, band) -- blades, no arms, no crown.

    TWO PASSES, AND THE ORDER IS THE POINT. The hip height is set by whatever
    actually touches the road, and that is the BEVELLED contact band, which
    does not exist until the blade has been built. So the blades go up first
    against the ideal apex, the band is measured off them, and the hip is
    re-solved against the measurement before anything else is placed. Building
    the torso first and correcting afterwards would leave the frame and the
    pins 0.007 u out of register -- small, but exactly the kind of small that
    nobody finds later.
    """
    m = chassis.materials()

    root = td.root("boss_fast")
    body = td.root("boss_fast_body")
    body.parent = root
    body.location = (0.0, 0.0, 0.0)

    # PASS 1 -- the blades, seated on the ideal apex.
    layout = build_gait(WALK_FRAMES)[3]
    leg_l, leg_r = build_legs(m, body, layout["hip_max"] + HIP_DROP,
                              layout["hip_max"])
    parts = {"leg_l": leg_l, "leg_r": leg_r}

    # PASS 2 -- re-solve the hip against the band that will actually touch the
    # road, and re-seat the pins on the answer. Clause 6: feet at z = 0.
    band = sole_band_points(leg_l)
    hip_z = build_gait(WALK_FRAMES, band)[3]["hip_max"]
    for key in ("leg_l", "leg_r"):
        location = parts[key].location
        parts[key].location = (location[0], location[1], hip_z)

    # Clause 3b: the animated body root is at the origin in its HIGHEST pose,
    # and `lift` puts every part back. The hip pin rides at `hip_z` above it,
    # which is what puts the whole body on the blade.
    lift = hip_z + HIP_DROP
    chassis.torso_frame(m, body, lift, torso_w=TORSO_W, yoke_w=YOKE_W,
                        hip_w=HIP_W, band_w=BAND_W)
    chassis.cargo_cage(m, body, lift, at=CAGE_AT, scale=CAGE_SCALE)
    # antenna=False is the crown removal -- the fast family's separator.
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4, antenna=False)
    build_hip_rails(m, body, lift)

    bpy.context.view_layer.update()
    return root, body, parts, hip_z, band


def export_build():
    """The exporter contract: build, animate, return the frame count."""
    _root, body, parts, hip_z, band = build()
    report = animate_walk(body, parts, hip_z, WALK_FRAMES, band)
    peak, track = measure_plant("leg_l", WALK_FRAMES)
    px = gait_solve.UNITS_TO_PX * 1.9
    print("  vanguard: F=%d  P=%d  theta_m=%.4f deg (VERIFIED, not re-solved)"
          % (WALK_FRAMES, PLANT_FRAMES, report["theta_m_deg"]))
    print("  vanguard: span required %.6f u   from briefed angle %.6f u   "
          "error %+.2e u" % (report["span_required"],
                             report["span_from_briefed_angle"],
                             report["angle_error_units"]))
    print("  vanguard: hip %.5f..%.5f  free pitch %.5f u = %.3f board px"
          % (report["hip_min"], report["hip_max"], report["pitch_units"],
             report["pitch_units"] * px))
    print("  vanguard: float frames %s   worst swing lift %.5f u (rail %.3f)"
          % (report["float_frames"], report["worst_swing_lift"], RAIL_H))
    print("  vanguard: A (pre-export, posed) %.6f u = %.4f board px at 1.9"
          % (peak, peak * px))
    print("  vanguard: B (sawtooth) %.6f u = %.4f board px at 1.9"
          % (gait_solve.travel_per_frame(WALK_FRAMES),
             gait_solve.travel_per_frame(WALK_FRAMES) * px))
    bpy.context.scene.frame_set(1)
    return WALK_FRAMES
