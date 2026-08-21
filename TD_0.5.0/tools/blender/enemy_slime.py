# ---------------------------------------------------------------------------
# The Fractal Slime -- the one enemy that MOVES BY JUMPING.
#
#     python3 tools/blender/enemy_slime.py
#
# Writes js/gl/models/enemy-fractal_slime.js. No Blender: this authors against
# td_mesh, which speaks td_scene's primitive vocabulary and emits export_mesh's
# exact file contract (see the header of td_mesh.py).
#
# WHY THIS IS NOT AN IMPORT, AND THE ONE FACT THAT SETTLES IT. `glb/
# fractal-slime.glb` exists beside the other six imports and is NOT the source
# of this body. Measured before anything was written: 253 500 vertices,
# 84 500 triangles, ONE primitive, ZERO materials, and every vertex exactly
# 1.000000 units from the origin -- min radius 0.9999999594, max 1.0000000430.
# It is a unit SPHERE. Whatever displaced it into a slime lived in the
# authoring tool's shader graph and did not survive the export, and there is no
# texture path in this pipeline to bring it back (AGENTS.md, clause 7's
# corollary: a marking is geometry or it does not exist). Importing it would
# ship a smooth ball -- which is exactly what the type already draws through
# gl-world's fallback sphere, at 84 500 triangles instead of nothing.
#
# SO NOTHING MUST EVER POINT glb_to_model.py AT THIS NAME. The generalised rule
# is already in AGENTS.md -- a .glb import and a Blender target must never name
# the same output, because whichever ran last wins, silently -- and this body is
# the second body it applies to (`enemy_skimmer.py` was the first). There is no
# `--name enemy-fractal_slime` anywhere and there must not be one.
#
# ---------------------------------------------------------------------------
# THE JUMP, WHICH IS THE WHOLE POINT OF THE BODY
# ---------------------------------------------------------------------------
#
# gl-world.js advances an enemy's frame by DISTANCE covered, not by a clock:
# `bandFrame(band, progress / stride)` with `stride = radiusPx * 2.6`. In model
# units that is
#
#     28.6 / 31.8032 = 0.899281 units of travel per cycle
#
# for every body, at every sizeScale, at every speed -- the same constant
# tools/check-gait-slip.js and tools/glb_to_model.py are written around. For a
# walker that means a planted FOOT must travel backward by exactly that much
# across its plant or it skates. For this body the foot is the WHOLE ANIMAL:
# while it is on the road it must be motionless in world space, and everything
# the cycle owes -- all 0.899281 units of it -- has to be paid back in the air.
#
# That single sentence fixes almost every number below and leaves nothing to
# taste:
#
#   * the ground phase is 13 of 32 frames, so the body slides back through
#     0.899281 * 13/32 -- reported as A = 0 by the gate, because "stationary
#     while the root advances" IS the zero-slip condition;
#   * the horizontal excursion is therefore NOT a chosen amplitude. It is
#     +/- 0.899281 * 6/32 = +/- 0.1686 u, and the only lever on it is the
#     ground duty. A longer plant is a wider body, which is why 13/32 and not
#     the walkers' 50%;
#   * both halves are straight lines in relative x, because a body at rest and
#     a body in free flight both hold a CONSTANT horizontal velocity, and the
#     root's is constant too. A curve there would be a body accelerating
#     sideways in mid-air;
#   * the arc is 4*APEX*u*(1-u) -- a parabola, because that is what gravity
#     draws.
#
# WHAT THE INSTRUMENT SAYS, and it is the acceptance for this file:
#
#     node tools/check-gait-slip.js enemy-fractal_slime
#     node tools/check-model-top.js enemy-fractal_slime
#
# ---------------------------------------------------------------------------
# SQUASH AND STRETCH WITHOUT A NON-UNIFORM SCALE
# ---------------------------------------------------------------------------
#
# A hop reads as a hop because the body flattens when it lands and draws out
# when it leaves; a rigid ball moving on a parabola reads as a thrown pebble.
# The obvious way to do that is to scale the body 1.15/0.80 on the z axis, and
# it is not available here: the vertex shader transforms normals with
# `mat3(uModel) * aNrm` and no inverse-transpose (js/gl/gl-renderer.js:46-49),
# which is exact for a rotation or a UNIFORM scale and wrong for a squash --
# a normal scaled by S instead of S^-1 tilts, and at 1.15/0.80 a 45-degree face
# swings about twenty degrees. `td_mesh.Node` now refuses a non-uniform scale
# outright rather than leaving that to a comment.
#
# So the squash is built out of two parts that move AGAINST each other, each
# under a uniform scale, both pivoting on the ground contact point:
#
#     slime_body   shrinks on impact (shorter AND narrower)
#     slime_hem    the puddle it stands in, which SPREADS at the same moment
#
# Mass leaves the body and arrives in the puddle; the silhouette flattens and
# widens exactly as a squash does, and every normal on both parts stays right.
# `slime_core` -- the nucleus -- sinks into the gel on impact and rides up on
# the push, which is the follow-through the two scales cannot express.
#
# ---------------------------------------------------------------------------
# WHERE `model.top` IS TAKEN FROM, AND WHY THE ROOTS SIT BELOW THE FLOOR
# ---------------------------------------------------------------------------
#
# Clause 3b of the model contract: `GLModels.expand` sets `model.top` from the
# largest RAW z in each group's stored geometry, before any frame matrix, and
# `crownOf` hangs the health bar, the hover readout and the occluder capsule at
# that height plus 10 board px. The clause's own recipe -- put the animated root
# at z = 0 with identity rotation at frame 1 -- is written for a body that never
# rises above its rest pose, and this body rises 0.2025 u above it TWICE A
# SECOND. Followed literally it would report the resting crown, and the health
# bar would be swallowed at the top of every jump: 6.4 board px inside a T1,
# 15.5 inside a T5, and NOTHING would report it, because the bare enemy run of
# check-model-top reads the rest frame.
#
# So each animated group is a PAIR of nodes:
#
#     hop_<g>    the animation: translate, lean, uniform scale. Identity at
#                frame 0 -- which is what makes frame 0 the neutral pose and
#                the middle of the ground phase, and is why the plant window is
#                an ODD number of frames.
#     <g>        the exported group, a fixed child at z = -RISE.
#
# `td_mesh.build` stores geometry as inverse(matrix_world at frame 0) * world,
# so with hop identity at frame 0 the stored geometry is the world geometry
# lifted by RISE, and the drawn pose at frame f is exactly hop(f) * world --
# the -RISE and the +RISE cancel, so nothing is displaced and the rotations and
# scales still pivot on the ground where they were authored. The single visible
# consequence is the one that was wanted: `model.top` equals the crown of the
# body AT THE TOP OF ITS JUMP, so the bar is clear in every frame instead of
# being clear in most of them.
#
# RISE IS MEASURED, NOT TYPED: `_solve_rise` poses every frame and takes the
# highest vertex on the model. check-model-top then reports a margin of exactly
# 10.0 px at every sizeScale, which is the tightest a compliant body can be.
#
# The cost, stated because a clean gate is not the same as no cost: at REST the
# bar floats RISE above the crown -- 6.4 px at T1, 15.5 at T5 -- and
# `bodyTopOf`, which is the Siphon's occluder capsule, is that much too tall.
# Over-occlusion photographs as success (AGENTS.md says so about this exact
# function), so it is written down here rather than left to be discovered.
#
# ---------------------------------------------------------------------------
# THE TIER IS THE SIZE, AND IN 3D IT IS THE ONLY TELL
# ---------------------------------------------------------------------------
#
# One type, six tiers, ONE mesh. js/enemy.js gives every instance
# `fractalSizeScale = 0.65 + 0.35 * tier` -- 0.65, 1.00, 1.35, 1.70, 2.05, 2.40
# -- and `radiusPx()` multiplies it in, so gl-world draws this body at six sizes
# from a single file and a T5 is 3.7x the linear size of a T0.
#
# The 2D board also prints "T3" inside the disc. That text does not exist here
# and cannot: colour is per FACE, there is no texture path, and at 20 px a
# glyph is not resolvable as geometry either (AGENTS.md, clause 7's corollary).
# It is not a regression -- the 3D board has never drawn the 2D body, so the
# number was already absent for this type -- but it does mean SIZE has to carry
# the whole tier read, which is the reason the four buds around the base are
# there: four children, on the body that divides into four.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402


# --- the cycle --------------------------------------------------------------

# One walk cycle of forward travel, in model units. DERIVED from the two
# constants the runtime already owns -- gl-world.js's stride of radiusPx * 2.6
# and the exporter's units-to-pixels -- so it cannot drift from them.
CYCLE_UNITS = (11.0 * 2.6) / td.UNITS_TO_PX          # 0.8992806...

# THE FRAME COUNT IS A SAWTOOTH BUDGET, not a smoothness preference.
# `bandFrame` floors, so the pose is HELD while the body keeps translating: a
# perfectly authored gait still creeps forward by stride/N and snaps back once
# per frame, and N is the only lever on it. 32 gives 0.89 board px at T1 and
# 2.15 at T5, against the 3.5-3.9 px every eight-frame walker on the board
# already shows. Frames are one 4x4 per group -- 32 x 3 x 16 numbers is under
# 2 kB, next to 1 192 triangles of geometry.
FRAMES = 32

# HOW LONG IT IS ON THE ROAD, in frames either side of frame 0. The plant is
# 2*CONTACT_HALF + 1 = 13 frames, 40.6% of the cycle, and it is ODD on purpose:
# frame 0 has to be the exact middle of the ground phase, because frame 0 is
# where the hop transform is the identity and the geometry is stored.
#
# This is the one number that trades the two things this body has to balance.
# Longer: more of the cycle motionless, and a WIDER swept body, because the
# excursion is CYCLE_UNITS * CONTACT_HALF / FRAMES and nothing else. Shorter:
# more time in the air, which reads as hoppier but leaves a slime that is
# hardly ever on the ground -- and a slime frozen mid-air is what a stunned
# one looks like (js/enemy.js stuns every fresh split for 0.5-1 s).
CONTACT_HALF = 6

FLIGHT_FRAMES = FRAMES - 2 * CONTACT_HALF            # 20 frame-steps of air

# Half the horizontal excursion, in model units. NOT A CHOICE: while the body
# is planted it must be motionless in world space, so it slides back through
# exactly what the root advances.
EXCURSION = CYCLE_UNITS * CONTACT_HALF / FRAMES      # 0.16862 u

# How high it gets. 0.20 u is 29% of the body's own 0.68 u -- 6.4 board px of
# air under a T1 and 15.4 under a T5. It is also, exactly, what the health bar
# has to be raised by; see `_solve_rise` and the header.
APEX = 0.20

# The lean, radians, peaking at the top of the arc and zero at both ends of it.
# Zero on every planted frame is a REQUIREMENT and not tidiness: this rotation
# pivots on the ground contact point, so a lean during the plant would drag the
# contact through x and the gate would read it as slip -- correctly.
LEAN = 0.13                                          # 7.4 degrees

# What the two scales spend the squash signal on. The body loses 11% of itself
# at the bottom of the impact and gains 11% at toe-off; the puddle does the
# opposite, at nearly three times the amplitude because it is what the eye
# reads the splat off.
BODY_SQUASH = 0.11
HEM_SPREAD = 0.28
# The nucleus sinks into the gel on impact and rides up on the push. In model
# units, on top of everything the body's own scale already does to it.
CORE_SINK = 0.05


def _curve(keys, t):
    """A keyed curve, smoothstepped between keys, clamped at both ends.

    Smoothstep and not linear because these curves are read once per frame and
    a corner in the value is a corner in the motion -- at 32 frames a linear
    ramp into a hold is visible as a tick.
    """
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    for i in range(len(keys) - 1):
        t0, v0 = keys[i]
        t1, v1 = keys[i + 1]
        if t0 <= t <= t1:
            u = (t - t0) / (t1 - t0)
            return v0 + (v1 - v0) * u * u * (3.0 - 2.0 * u)
    return keys[-1][1]


# THE SQUASH SIGNAL: +1 is fully compressed, -1 fully drawn out, 0 is round.
# Two curves, one per phase, and they must agree at both seams or the body
# jumps once per cycle forever -- CONTACT[-1] == FLIGHT[0] and FLIGHT[-1] ==
# CONTACT[0] is the whole of that check, and `main` asserts it.
#
# The key at 0.50 is not decoration either: c = 0.50 IS frame 0, the frame the
# geometry is stored at, and the hop matrix there has to be the identity. A
# non-zero value here would compose every other frame with its inverse.
CONTACT_SQUASH = [
    (0.00, +0.20),      # touchdown: the fall has already drawn it out a little
    (0.14, +1.00),      # impact
    (0.34, -0.15),      # the rebound overshoots
    (0.50,  0.00),      # NEUTRAL -- frame 0. See above.
    (0.70, +0.85),      # the crouch: it gathers
    (0.90, -0.55),      # the push
    (1.00, -1.00),      # toe-off
]
FLIGHT_SQUASH = [
    (0.00, -1.00),      # off the ground, stretched
    (0.25, -0.30),
    (0.50,  0.00),      # apex: round again
    (0.80, -0.40),      # falling, drawn out by it
    (1.00, +0.20),      # meets CONTACT_SQUASH[0]
]


def signed(frame):
    """Frame index as a signed offset from frame 0, which is mid-plant."""
    return frame if frame <= FRAMES // 2 else frame - FRAMES


def planted(frame):
    return abs(signed(frame)) <= CONTACT_HALF


def flight_u(frame):
    """Position through the airborne arc, 0 at toe-off and 1 at touchdown.

    Defined on the CLOSED window [CONTACT_HALF, FRAMES - CONTACT_HALF] so that
    the two frames the body is both planted and at zero height evaluate to the
    ends of the arc. Those two frames are shared by both phases and both
    phases must return the same pose for them.
    """
    return (frame - CONTACT_HALF) / float(FLIGHT_FRAMES)


def contact_c(frame):
    """Position through the ground phase, 0 at touchdown and 1 at toe-off."""
    return (signed(frame) + CONTACT_HALF) / float(2 * CONTACT_HALF)


def squash(frame):
    if planted(frame):
        return _curve(CONTACT_SQUASH, contact_c(frame))
    return _curve(FLIGHT_SQUASH, flight_u(frame))


def hop_x(frame):
    """Where the body is, relative to the point on the road the game moved it
    to. Two straight lines: motionless while planted (so it slides backward
    through the root's own advance), constant relative velocity in the air."""
    if planted(frame):
        return -CYCLE_UNITS * signed(frame) / float(FRAMES)
    return -EXCURSION + 2.0 * EXCURSION * flight_u(frame)


def hop_z(frame):
    if planted(frame):
        return 0.0
    u = flight_u(frame)
    return 4.0 * APEX * u * (1.0 - u)


def lean(frame):
    if planted(frame):
        return 0.0
    return LEAN * math.sin(math.pi * flight_u(frame))


# --- palette ----------------------------------------------------------------
# A VALUE LADDER. js/enemy.js paints this type rgb(83, 224, 154) and that value
# already drives the codex swatch, the hover card, the kill burst and the
# minimap dot -- so the body is green, and the question is only which green goes
# where. The largest surface (the base) takes the darkest of the three greens;
# the dome is a step up; the four buds are a step up again so they read as
# separate bodies clinging on rather than as lumps in the outline. The puddle
# is darker than any of them because it is in shadow under the animal, and the
# bubbles and the nucleus are the only bright notes on the model.
PALETTE = {
    "gel_deep":  ("#1B4A36", 0.0),      # the puddle
    "gel_dark":  ("#276E4E", 0.0),      # the base
    "gel":       ("#3FA875", 0.0),      # the dome
    "gel_lit":   ("#53E09A", 0.0),      # the buds -- the type's own swatch
    "bubble":    ("#CFF7E2", 0.0),      # gas caught in the gel
    # THE NUCLEUS IS THE ONE LIT PART, AND THE HEAT IS LOW ON PURPOSE. `uGlow`
    # is 0 for a body on the road, so a material's whole emission is
    # GLModels.expand's resting floor -- min(1, e * 0.16) added to every LINEAR
    # channel equally, and that floor is WHITE. 0.55 spends 0.088 of it, which
    # lifts the core clear of the gel around it and leaves it green; the
    # Healer's core needed 1.0 and it is a lantern the size of this whole body.
    "nucleus":   ("#8FF7C2", 0.55),
}


# --- the body ---------------------------------------------------------------
#
# Every number here is a real position on the finished model: td_mesh bakes
# `location` into the vertices, and the node a mesh names selects only which
# animated group it rides on (see the comment in td_mesh.build).
#
# THE SHAPE IS TWO LOBES AND A SKIRT, which is the cheapest silhouette that
# cannot be confused with the round bodies already on the board -- and this
# type spent its whole life so far drawn as the renderer's fallback SPHERE, so
# "not a ball" is the first thing the new mesh has to say. Height 0.68 u
# against a walker's 1.19: it is the low thing on the road.

BASE_SIZE = (0.88, 0.84, 0.44)
DOME_SIZE = (0.66, 0.62, 0.56)
DOME_Z = 0.34
CORE_R = 0.135
CORE_Z = 0.545
HEM_SIZE = (0.80, 0.76, 0.10)
BUD_R = 0.115
BUD_RING = 0.34
BUD_Z = 0.13
# Where the four buds sit in plan, in degrees off the direction of travel. Off
# the axes rather than on them so that neither the front view nor the side view
# is the one that loses them into the outline.
BUD_ANGLES = (42.0, 138.0, 222.0, 318.0)
# Bubbles: (radius, polar angle from +z, azimuth from +x), placed ON the dome's
# own surface and pushed out by half their radius so each one breaks the
# outline instead of hiding inside the gel.
BUBBLES = ((0.075, 50.0, 55.0), (0.055, 34.0, -70.0), (0.045, 66.0, 155.0))


# THE WOBBLE, and it is the difference between a slime and an ornament.
#
# `amount` is the fraction of its own radius a vertex is pushed in or out;
# the pattern is two harmonics of the surface direction, so it is smooth,
# repeatable and has no seam. Applied AFTER the primitive, on the mesh's own
# vertex list, which is the one thing td_mesh's primitives leave open.
WOBBLE = 0.075
# NOTHING BELOW THIS HEIGHT MOVES, and the number is not cosmetic: this is the
# body's contact with the road. `check-gait-slip` picks each group's sole out
# of the vertices within 0.02 u of its lowest, and the base's lowest ring sits
# at 0.0167 -- so a mask that reached them would tilt the sole and the slip
# would be authored into the mesh rather than into the cycle. Zero up to
# WOBBLE_FLOOR, full by WOBBLE_RAMP, and the sole is untouched by construction.
WOBBLE_FLOOR = 0.030
WOBBLE_RAMP = 0.120


def _wobble(mesh, centre, amount=WOBBLE):
    out = []
    cx, cy, cz = centre
    for (x, y, z) in mesh.verts:
        dx, dy, dz = x - cx, y - cy, z - cz
        r = math.sqrt(dx * dx + dy * dy + dz * dz)
        if r < 1e-9:
            out.append((x, y, z))
            continue
        t = (z - WOBBLE_FLOOR) / (WOBBLE_RAMP - WOBBLE_FLOOR)
        t = 0.0 if t <= 0.0 else (1.0 if t >= 1.0 else t)
        mask = t * t * (3.0 - 2.0 * t)
        theta = math.atan2(dy, dx)
        phi = math.acos(max(-1.0, min(1.0, dz / r)))
        k = (math.sin(3.0 * theta + 1.1) * math.cos(2.0 * phi + 0.4) +
             0.6 * math.sin(5.0 * theta - 2.2) * math.sin(3.0 * phi))
        s = 1.0 + amount * mask * k
        out.append((cx + dx * s, cy + dy * s, cz + dz * s))
    mesh.verts = out
    return mesh


def _dome_surface(phi_deg, theta_deg, out):
    """A point on the dome, `out` units proud of it along the radial."""
    phi, theta = math.radians(phi_deg), math.radians(theta_deg)
    ax, ay, az = DOME_SIZE[0] * 0.5, DOME_SIZE[1] * 0.5, DOME_SIZE[2] * 0.5
    dx = math.sin(phi) * math.cos(theta)
    dy = math.sin(phi) * math.sin(theta)
    dz = math.cos(phi)
    return (dx * (ax + out), dy * (ay + out), DOME_Z + dz * (az + out))


def build():
    scene = td.Scene(PALETTE)

    # THE RIG. Two nodes per group, and the split is the whole of clause 3b's
    # repair on a body that leaves the ground -- see the header. `hop_*` carries
    # the animation and is identity at frame 0; the child is the exported group
    # and never moves against its parent except where the nucleus lags.
    hop_body = scene.node("hop_body")
    hop_hem = scene.node("hop_hem")
    body = scene.node("slime_body", hop_body, animated=True)
    hem = scene.node("slime_hem", hop_hem, animated=True)
    core = scene.node("slime_core", hop_body, animated=True)

    td.ellipsoid(scene, "hem", HEM_SIZE, (0, 0, HEM_SIZE[2] * 0.5),
                 "gel_deep", hem, segments=16, rings=6)

    _wobble(td.ellipsoid(scene, "base", BASE_SIZE, (0, 0, BASE_SIZE[2] * 0.5),
                         "gel_dark", body, segments=16, rings=8),
            (0, 0, BASE_SIZE[2] * 0.5))
    _wobble(td.ellipsoid(scene, "dome", DOME_SIZE, (0, 0, DOME_Z),
                         "gel", body, segments=16, rings=8), (0, 0, DOME_Z))

    # THE FOUR BUDS ARE THE FOUR CHILDREN. js/enemy.js splits a dying slime
    # into `splitCount: 4` of the tier below, and with the tier number gone in
    # 3D (see the header) this is the only thing on the body that says what it
    # does when it dies. Half-sunk, so they read as budding out of the gel
    # rather than as beads stuck to it.
    for angle in BUD_ANGLES:
        a = math.radians(angle)
        td.ball(scene, "bud_%d" % int(angle), BUD_R,
                (math.cos(a) * BUD_RING, math.sin(a) * BUD_RING, BUD_Z),
                "gel_lit", body, segments=10, rings=5)

    for i, (r, phi, theta) in enumerate(BUBBLES):
        td.ball(scene, "bubble_%d" % i, r, _dome_surface(phi, theta, -r * 0.5),
                "bubble", body, segments=8, rings=4)

    td.ball(scene, "core", CORE_R, (0, 0, CORE_Z), "nucleus", core,
            segments=12, rings=6)

    return scene, hop_body, hop_hem, body, hem, core


def _pose(hop_body, hop_hem, body, hem, core, rise):
    """The pose function td_mesh calls once per frame.

    Everything pivots on (0, 0, 0) -- the point of the road the animal is
    standing on -- which is what keeps a uniform scale from lifting the body
    off the ground or pushing it through it, and what keeps the contact vertex
    exactly where the gate expects to find it.
    """
    def pose(frame):
        sq = squash(frame)
        x, z, ry = hop_x(frame), hop_z(frame), lean(frame)

        hop_body.location = [x, 0.0, z]
        hop_body.rotation = [0.0, ry, 0.0]
        hop_body.set_scale(1.0 - BODY_SQUASH * sq)

        hop_hem.location = [x, 0.0, z]
        hop_hem.rotation = [0.0, ry, 0.0]
        hop_hem.set_scale(1.0 + HEM_SPREAD * sq)

        # The exported groups are fixed children at -rise. The nucleus adds its
        # own follow-through on top; it is zero at frame 0 for the same reason
        # the squash curve is.
        body.location = [0.0, 0.0, -rise]
        hem.location = [0.0, 0.0, -rise]
        core.location = [0.0, 0.0, -rise - CORE_SINK * sq]
    return pose


def _solve_rise(scene, hop_body, hop_hem, body, hem, core):
    """How far the highest point of the model rises above its neutral pose.

    MEASURED OVER EVERY FRAME AND EVERY VERTEX, because the answer is not the
    apex of the arc: the body is also 11% larger at toe-off, the nucleus is
    riding 0.05 u high at the same moment, and the lean tips the crown forward
    where the ellipsoid is not as tall. Guessing it and checking with
    check-model-top would work; deriving it means the margin is exactly 10.0 px
    at every one of the six tier scales instead of approximately.
    """
    pose = _pose(hop_body, hop_hem, body, hem, core, 0.0)
    pose(0)
    neutral = max(v[2] for mesh in scene.meshes for v in mesh.verts)
    highest = neutral
    for frame in range(FRAMES):
        pose(frame)
        for mesh in scene.meshes:
            node = mesh.parent
            m = node.matrix_world()
            for v in mesh.verts:
                z = td.apply(m, v)[2]
                if z > highest:
                    highest = z
    pose(0)
    return highest - neutral, neutral


def plan_extent(model):
    """The widest the body gets in PLAN, per frame, as a radius in model units.

    The frost and camo rings are drawn at radiusPx + 4 board px and the hover
    ring at + 9, in ABSOLUTE pixels, so the budget SHRINKS as an instance grows
    -- and this type's instances run to sizeScale 2.40. Reported rather than
    enforced, exactly as tools/check-gait-slip.js reports it: zero slip COSTS
    plan extent on any body whose foot is its whole self, and every walker in
    the library is over its own ring too.
    """
    pos = model["positions"]
    worst, worst_frame = 0.0, -1
    for fi, frame in enumerate(model["frames"]):
        for gi, group in enumerate(model["groups"]):
            m = frame[gi]
            for v in range(group["first"], group["first"] + group["count"]):
                p = (pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
                if m:
                    x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]
                    y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]
                else:
                    x, y = p[0], p[1]
                r = math.hypot(x, y)
                if r > worst:
                    worst, worst_frame = r, fi
    return worst, worst_frame


def ring_budget(size_scale, pad=4.0):
    """The ring's own radius, in model units, at a given instance scale."""
    return (11.0 * size_scale + pad) / (td.UNITS_TO_PX * size_scale)


def main():
    # The two seams of the squash signal. A cycle that does not end where it
    # started is a visible jolt once per cycle forever, and it is one line to
    # prove rather than to believe.
    assert abs(CONTACT_SQUASH[-1][1] - FLIGHT_SQUASH[0][1]) < 1e-9
    assert abs(FLIGHT_SQUASH[-1][1] - CONTACT_SQUASH[0][1]) < 1e-9
    # Frame 0 has to be neutral: the geometry is stored through the inverse of
    # the hop matrix there, so anything but the identity composes itself into
    # every other frame.
    assert abs(squash(0)) < 1e-9 and abs(hop_x(0)) < 1e-9
    assert abs(hop_z(0)) < 1e-9 and abs(lean(0)) < 1e-9
    # The two frames that belong to both phases must agree about the ground.
    assert hop_z(CONTACT_HALF) == 0.0 and hop_z(FRAMES - CONTACT_HALF) == 0.0

    scene, hop_body, hop_hem, body, hem, core = build()
    rise, neutral = _solve_rise(scene, hop_body, hop_hem, body, hem, core)

    scene, hop_body, hop_hem, body, hem, core = build()
    pose = _pose(hop_body, hop_hem, body, hem, core, rise)
    model = td.build(scene, "enemy-fractal_slime", frames=FRAMES, pose=pose)
    path = td.write_js(model, "enemy-fractal_slime.js")

    top = max(model["positions"][i] for i in range(2, len(model["positions"]), 3))
    plan, plan_frame = plan_extent(model)
    print("enemy-fractal_slime  %d tris, %d colours, %d frames"
          % (model["triangles"], len(model["palette"]), FRAMES))
    print("  neutral crown %.4f u, rise %.4f u, model.top %.4f u"
          % (neutral, rise, top))
    print("  plant %d/%d frames (%.1f%%), excursion +/-%.4f u, apex %.2f u"
          % (2 * CONTACT_HALF + 1, FRAMES,
             100.0 * (2 * CONTACT_HALF + 1) / FRAMES, EXCURSION, APEX))
    # `tall` is the BODY, not `model.top`: the top carries the jump's rise, so
    # quoting it here would report every tier as taller than it ever draws.
    for tier in range(6):
        s = 0.65 + 0.35 * tier
        print("  T%d  scale %.2f  %5.1f px tall  %5.1f px wide  "
              "bar %4.1f px over the crown  plan %.0f%% of ring (frame %d)"
              % (tier, s, neutral * td.UNITS_TO_PX * s,
                 2 * plan * td.UNITS_TO_PX * s, rise * td.UNITS_TO_PX * s,
                 100.0 * plan / ring_budget(s), plan_frame))
    print("  wrote %s" % os.path.relpath(path, os.getcwd()))


if __name__ == "__main__":
    main()
