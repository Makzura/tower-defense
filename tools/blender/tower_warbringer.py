# ---------------------------------------------------------------------------
# The Warbringer -- path A. See WARBRINGER_CONCEPT.md for the design.
#
#   python tools/blender/tower_warbringer.py
#
# Builds warbringer-base / a3 / a4 / a5 straight into js/gl/models/. No Blender:
# this authors against td_mesh, which speaks td_scene's primitive vocabulary and
# emits export_mesh's exact file contract (see the header of td_mesh.py).
#
# THE THING THIS MODEL HAS TO GET RIGHT, and the thing the owner asked for by
# name: HE IS HOLDING THE HAMMER. Both hands close on the haft, the haft is a
# real cylinder between them, and neither the haft nor the head intersects his
# body in any pose. Every hand position below is derived from the haft's own
# axis rather than typed in beside it -- see `_hands_on`, which is the whole
# reason nothing passes through anybody.
#
# ANIMATION. Four frames, keyed on empties, geometry stored in each empty's
# local space -- the project's rigid-group rule. Groups:
#   shoulder  the arms and everything they carry
#   haft      the haft, the head and its accents, as ONE rigid group
# Frame 0 is the held/ready pose and is what a resting tower shows. 1-3 are the
# swing. Path A's swing is the overhead forge-slam js/smasher.js already runs at
# SWING_SECONDS = 0.48 with three afterimages, so the frames match that arc.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402


# --- palette ----------------------------------------------------------------
# A VALUE LADDER, not a hue wheel. The apron is the largest surface on the model
# so it takes a mid-dark value; the hammer head is darker than the apron; the
# bare forearm and the ley are the only bright notes. A 0.5 m hammer head
# painted bright reads as chrome, not as iron -- see the palette clause of the
# model contract in AGENTS.md.
PALETTE = {
    "iron":       ("#3A3F4A", 0.0),
    "iron_dark":  ("#23272F", 0.0),
    "steel":      ("#59606E", 0.0),
    "steel_dark": ("#333944", 0.0),
    "brass":      ("#9A7B3C", 0.0),
    "brass_lit":  ("#C9A227", 0.0),
    "walnut":     ("#6B4A2F", 0.0),
    "walnut_dk":  ("#4A3220", 0.0),
    "leather":    ("#5A4632", 0.0),
    "apron":      ("#4A3C2C", 0.0),
    # Darker than it looks like it should be. At 60 px on a dark board the
    # shirt is the largest lit surface after the apron, and at #8C8577 it was
    # the brightest thing on the model -- brighter than his own hands, which
    # inverted the whole value ladder.
    "shirt":      ("#6F6A5E", 0.0),
    "skin":       ("#B08155", 0.0),
    "skin_dark":  ("#8A6340", 0.0),
    "hair":       ("#2A2018", 0.0),
    "ley":        ("#4FE3D2", 1.0),
    "ley_dim":    ("#2E8C86", 0.45),
    "ember":      ("#FF7A3C", 0.8),
    "stone":      ("#4C4F58", 0.0),
    "stone_dark": ("#31343B", 0.0),
}

# The figure, in Blender units. Feet at z = 0 -- clause 6 of the model contract,
# which the Riflemen do not obey and the snipers do. New models obey it.
HIP_Z = 0.62
SHOULDER_Z = 1.10
HEAD_Z = 1.34

# How far off his centreline a rested weapon sits. His torso is 0.50 wide, so
# half of that is 0.25 and the hammer needs to clear it -- see the note on the
# A4/A5 rest pose.
_SIDE = -0.40


def _legs(scene, parent, stance=0.17):
    """A braced smith. Weight back, front foot turned out -- he is WAITING for
    something to walk into the zone, which is what the tower actually does: it
    holds its swing rather than swinging on a rhythm."""
    for side, sx in (("l", 1.0), ("r", -1.0)):
        hip = (0.0, sx * 0.14, HIP_Z)
        knee = (0.06 * (1.0 if sx > 0 else -0.4), sx * (0.15 + stance * 0.2),
                HIP_Z * 0.52)
        ankle = (0.10 * (1.0 if sx > 0 else -0.9), sx * (0.16 + stance), 0.075)
        td.tube(scene, "thigh_" + side, 0.085, hip, knee, "iron_dark", parent, 8)
        td.tube(scene, "shin_" + side, 0.070, knee, ankle, "iron_dark", parent, 8)
        td.box(scene, "boot_" + side, (0.235, 0.145, 0.105),
               (ankle[0] + 0.045, ankle[1], 0.052), (0, 0, sx * 0.16),
               "walnut_dk", parent)
        td.box(scene, "boot_cap_" + side, (0.085, 0.150, 0.090),
               (ankle[0] + 0.140, ankle[1], 0.048), (0, 0, sx * 0.16),
               "steel_dark", parent)


def _torso(scene, parent, bulk=1.0):
    """Chest, apron and belt. `bulk` grows with the tier: path A is the man
    being given heavier and heavier tools until he has to be built for them."""
    td.box(scene, "hips", (0.30 * bulk, 0.40 * bulk, 0.22),
           (0.0, 0.0, HIP_Z + 0.02), (0, 0, 0), "leather", parent)
    td.box(scene, "chest", (0.34 * bulk, 0.50 * bulk, 0.40),
           (-0.01, 0.0, HIP_Z + 0.30), (0, -0.10, 0), "shirt", parent)
    # The apron is the biggest single surface, so it is a MID value and its
    # bindings are the only thing on it that catches light.
    td.box(scene, "apron", (0.10, 0.46 * bulk, 0.62),
           (0.155 * bulk, 0.0, HIP_Z + 0.10), (0, -0.06, 0), "apron", parent)
    td.box(scene, "apron_hem", (0.11, 0.44 * bulk, 0.07),
           (0.165 * bulk, 0.0, HIP_Z - 0.19), (0, -0.06, 0), "leather", parent)
    td.box(scene, "belt", (0.33 * bulk, 0.44 * bulk, 0.09),
           (0.0, 0.0, HIP_Z + 0.10), (0, 0, 0), "walnut_dk", parent)
    td.box(scene, "buckle", (0.06, 0.10, 0.09),
           (0.165 * bulk, 0.0, HIP_Z + 0.10), (0, 0, 0), "brass", parent)


def _head(scene, parent, hood=False):
    td.tube(scene, "neck", 0.075, (0.0, 0.0, SHOULDER_Z - 0.02),
            (0.0, 0.0, HEAD_Z - 0.12), "skin_dark", parent, 8)
    td.ellipsoid(scene, "skull", (0.215, 0.205, 0.245), (0.0, 0.0, HEAD_Z),
                 "skin", parent)
    td.box(scene, "jaw", (0.14, 0.16, 0.09), (0.07, 0.0, HEAD_Z - 0.09),
           (0, 0, 0), "skin_dark", parent)
    if hood:
        td.ellipsoid(scene, "hood", (0.27, 0.26, 0.20),
                     (-0.02, 0.0, HEAD_Z + 0.07), "leather", parent)
    else:
        td.box(scene, "hair", (0.20, 0.21, 0.09),
               (-0.03, 0.0, HEAD_Z + 0.10), (0, 0, 0), "hair", parent)
    # Goggles pushed up. A smith, not a soldier.
    td.box(scene, "goggles", (0.05, 0.23, 0.07), (0.10, 0.0, HEAD_Z + 0.09),
           (0, -0.25, 0), "brass", parent)


# --- the hammer, and the hands that are actually on it ----------------------

def _haft_axis(low, high):
    dx, dy, dz = (high[0] - low[0], high[1] - low[1], high[2] - low[2])
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
    return (dx / length, dy / length, dz / length), length


def _point_on(low, axis, t):
    return (low[0] + axis[0] * t, low[1] + axis[1] * t, low[2] + axis[2] * t)


def _hands_on(scene, parent, low, high, grips, radius):
    """Both hands, placed ON the haft rather than near it.

    This is the clause the owner asked for by name: "he is holding the hammer
    and the hammer isn't passing through him". Every hand is a point along the
    haft's own axis, so a change to the haft moves the hands with it and the
    grip cannot drift off the shaft or sink into it. The wrists are drawn from
    the shoulder to that point, so the arm length follows too.
    """
    axis, length = _haft_axis(low, high)
    out = []
    for i, t in enumerate(grips):
        p = _point_on(low, axis, t * length)
        td.ellipsoid(scene, "fist_%d" % i, (0.135, 0.125, 0.125), p,
                     "skin", parent)
        # A knuckle band so a fist is not one smooth blob at 40 px.
        td.box(scene, "knuckle_%d" % i, (0.055, 0.115, 0.115),
               (p[0] + radius * 0.55, p[1], p[2]), (0, 0, 0), "skin_dark",
               parent)
        out.append(p)
    return out


def _arms(scene, parent, hands, bare_right=True, bulk=1.0, body=None):
    """Shoulder -> elbow -> the fist that is already on the haft.

    THE LIMBS RIDE WITH THE WEAPON, not with the torso. A two-handed swing
    moves arms and hammer as one assembly from the shoulder line, so the upper
    arm, forearm and fist all hang off the `haft` group. Only the deltoid caps
    stay on the body, where they hide the joint. Parented the other way the
    fists swung away on the haft and left the forearms pointing at nothing.
    """
    body = body if body is not None else parent
    for i, (side, sy) in enumerate((("l", 1.0), ("r", -1.0))):
        hand = hands[min(i, len(hands) - 1)]
        shoulder = (0.0, sy * 0.26 * bulk, SHOULDER_Z)
        # The elbow is pushed OUT and DOWN off the line, or the arm reads as a
        # straight stick from shoulder to fist.
        elbow = ((shoulder[0] + hand[0]) * 0.5 + 0.06,
                 (shoulder[1] + hand[1]) * 0.5 + sy * 0.16,
                 (shoulder[2] + hand[2]) * 0.5 - 0.10)
        upper_mat = "skin_dark" if (bare_right and sy < 0) else "shirt"
        fore_mat = "skin" if (bare_right and sy < 0) else "shirt"
        td.box(scene, "deltoid_" + side, (0.22 * bulk, 0.20 * bulk, 0.20),
               shoulder, (0, 0, 0), "shirt", body)
        td.tube(scene, "upper_" + side, 0.088 * bulk, shoulder, elbow,
                upper_mat, parent, 8)
        td.ellipsoid(scene, "elbow_" + side, (0.15, 0.15, 0.15), elbow,
                     upper_mat, parent)
        td.tube(scene, "fore_" + side, 0.078 * bulk, elbow, hand,
                fore_mat, parent, 8)
        if bare_right and sy < 0:
            td.torus(scene, "wrist_band_" + side, 0.085, 0.020,
                     ((elbow[0] + hand[0]) * 0.5, (elbow[1] + hand[1]) * 0.5,
                      (elbow[2] + hand[2]) * 0.5), (0, 0, 0), "brass", parent)


def _hammer(scene, parent, low, high, head_size, tier):
    """Haft plus head. The head sits ON the end of the haft, centred on the
    haft's axis, so it can never float beside it or swallow it."""
    first = len(scene.meshes)
    axis, length = _haft_axis(low, high)
    radius = 0.055 + 0.012 * tier
    td.tube(scene, "haft", radius, low, high, "walnut", parent, 10)
    # Grip wrap over the lower third, and a butt cap, so the haft has a
    # near end as well as a far one.
    td.tube(scene, "haft_wrap", radius * 1.18, low,
            _point_on(low, axis, length * 0.34), "walnut_dk", parent, 10)
    td.cyl(scene, "haft_butt", radius * 1.35, 0.06, low,
           (0.0, math.acos(max(-1.0, min(1.0, axis[2]))),
            math.atan2(axis[1], axis[0])), "steel_dark", parent, 10)

    # The head, at the far end, centred on the axis.
    hx, hy, hz = head_size
    head_at = _point_on(low, axis, length - hx * 0.10)
    yaw = math.atan2(axis[1], axis[0])
    pitch = math.acos(max(-1.0, min(1.0, axis[2])))
    rot = (0.0, pitch - math.pi * 0.5, yaw)
    td.box(scene, "head", (hx, hy, hz), head_at, rot, "iron", parent)
    # A collar where the head meets the haft: the single most important detail
    # for "this is assembled" rather than "a brick is stuck to a stick".
    collar_at = _point_on(low, axis, length - hx * 0.10 - hx * 0.52)
    td.cyl(scene, "collar", radius * 1.9, 0.075, collar_at, (0.0, pitch, yaw),
           "brass", parent, 10)
    # Cheeks: the two faces that actually strike, one darkened so the head
    # reads as a solid with a front and a back.
    td.box(scene, "cheek_far", (hx * 0.16, hy * 1.02, hz * 1.02),
           _point_on(low, axis, length + hx * 0.34), rot, "iron_dark", parent)
    for m in scene.meshes[first:]:
        m.is_weapon = True
    return head_at, rot, axis, length


def _ley_veins(scene, parent, head_at, rot, head_size, strength):
    _from = len(scene.meshes)
    """A3 onward: ley in the metal. Emissive, and dim -- `uGlow` drives it off
    the swing clock at runtime, so this is the RESTING value, not the lit one.
    The ceiling is the owner's: a bit arcane, never a wizard."""
    hx, hy, hz = head_size
    for i, dz in enumerate((-hz * 0.22, hz * 0.22)):
        td.box(scene, "vein_%d" % i, (hx * 0.86, hy * 1.04, hz * 0.085),
               (head_at[0], head_at[1], head_at[2] + dz), rot,
               "ley" if strength > 1 else "ley_dim", parent)
    td.box(scene, "vein_cross", (hx * 0.10, hy * 1.05, hz * 0.62),
           head_at, rot, "ley_dim", parent)
    for m in scene.meshes[_from:]:
        m.is_weapon = True


def _anvil_stand(scene, parent, radius):
    _from = len(scene.meshes)
    """What A4/A5 stands ON. A plated pad with anchor blocks -- he has been
    working this square long enough to have built a footing for it.

    THE FRACTURE RING IS NOT MODELLED HERE. It was, and it was invisible: the
    map's `deck` zones are drawn 9 px proud of the ground plane, and a crack
    lying 0.4 px above z=0 is simply buried under the tile it is supposed to be
    splitting. Anything that must lie FLAT ON THE BOARD is drawn by
    js/gl/gl-world.js through the camera instead, where it follows the terrain
    and cannot fight it. Solid geometry with real height is fine here; paint is
    not.
    """
    td.cyl(scene, "pad", radius * 0.66, 0.10, (0, 0, 0.05), (0, 0, 0),
           "stone_dark", parent, 14)
    td.cyl(scene, "pad_lip", radius * 0.72, 0.045, (0, 0, 0.022), (0, 0, 0),
           "stone", parent, 14)
    for i in range(6):
        a = math.tau * i / 6 + 0.36
        td.box(scene, "anchor_%d" % i, (0.20, 0.15, 0.14),
               (math.cos(a) * radius * 0.60, math.sin(a) * radius * 0.60, 0.07),
               (0, 0, a), "steel_dark", parent)
        td.box(scene, "anchor_lit_%d" % i, (0.055, 0.11, 0.035),
               (math.cos(a) * radius * 0.60, math.sin(a) * radius * 0.60, 0.15),
               (0, 0, a), "ley_dim", parent)
    for m in scene.meshes[_from:]:
        m.is_prop = True


# --- the four bodies --------------------------------------------------------

# Frames are nearly free: the whole animation is one 4x4 per group per frame, so
# eight frames of this rig costs about 1 KB. The A4/A5 arc hauls a monolith from
# the ground to over his head and back down again, and four frames could not
# describe it without the hammer appearing to jump.
WORK_FRAMES = 8


def _ease(a, b, t):
    return a + (b - a) * t


def _keys(frame, stops):
    """Sample a piecewise-linear curve given as (position, value) stops.

    Frames are cheap -- the whole animation is one 4x4 per group per frame -- so
    the swing is authored as a few readable key poses and sampled at whatever
    WORK_FRAMES is. Raising the frame count now costs nothing but a re-run.
    """
    t = frame / float(WORK_FRAMES - 1) if WORK_FRAMES > 1 else 0.0
    for i in range(len(stops) - 1):
        p0, v0 = stops[i]
        p1, v1 = stops[i + 1]
        if t <= p1 or i == len(stops) - 2:
            span = (p1 - p0) or 1e-6
            return _ease(v0, v1, max(0.0, min(1.0, (t - p0) / span)))
    return stops[-1][1]


def _swing_pose(shoulder, haft, frame, overhead, pivots):
    """The forge-slam. Frame 0 is HELD -- what a waiting tower shows -- and 1-3
    are the blow. Path A's is overhead (js/smasher.js swingPose), so the arc
    starts above the head and finishes at the ground.

    PITCH IS POSITIVE, and that is not arbitrary. A rotation about +Y by theta
    sends a point d above the pivot to (d sin theta, d cos theta): positive
    swings the head FORWARD and down, negative swings it backward through the
    man. The first pass used negative and buried the hammer in his own back.

    Both nodes keep their authored origin -- the shoulder line and the grip --
    so the arm pivots at the shoulder and the haft pivots where his hands are.
    Rotating either about the model origin swung the whole weapon around his
    ankles, which is what "the hammer passes through him" looks like.
    """
    if overhead:
        # A4/A5: THE HAMMER RESTS ON THE GROUND, and he still has hold of it.
        #
        # Frame 0 is the head down on the deck beside his front foot, haft
        # angled up to his hands -- a man leaning on a tool far too heavy to
        # hold up all day, which is the read the owner asked for. The blow then
        # HAULS it up past vertical and brings it down through the front.
        #
        # Negative pitch takes it backward and up (see the sign note above), so
        # the wind-up is negative and the strike swings positive through zero.
        # The authored rest pose already points the head down and forward at
        # about -52 degrees. A rotation of theta takes a direction at phi to
        # phi - theta, so hauling it overhead (phi ~ +95) is a big NEGATIVE
        # sweep, and the slam is a hard positive one back through the front.
        pitch = _keys(frame, [
            (0.00, 0.00),       # head on the deck, he is leaning on it
            (0.16, -0.55),      # takes the weight
            (0.34, -1.75),      # hauls it up past horizontal
            (0.52, -2.57),      # over his head, wound back
            (0.62, -2.44),      # a beat of hang time at the top
            (0.88, -0.40),      # driven down through the front
            (1.00, 0.31),       # buried in the deck
        ])
        lean = _keys(frame, [
            (0.00, 0.04), (0.16, -0.04), (0.34, -0.14), (0.52, -0.20),
            (0.62, -0.17), (0.88, 0.22), (1.00, 0.32),
        ])
        rise = _keys(frame, [
            (0.00, 0.00), (0.16, 0.02), (0.34, 0.08), (0.52, 0.12),
            (0.62, 0.10), (0.88, -0.05), (1.00, -0.11),
        ])
    else:
        pitch = _keys(frame, [(0.0, 0.0), (0.35, 0.42), (0.7, 1.05),
                              (1.0, 1.48)])
        lean = _keys(frame, [(0.0, 0.0), (0.35, 0.06), (0.7, 0.15),
                             (1.0, 0.22)])
        rise = _keys(frame, [(0.0, 0.0), (0.35, 0.03), (0.7, -0.01),
                             (1.0, -0.06)])
    haft.location = [pivots["haft"][0], pivots["haft"][1],
                     pivots["haft"][2] + rise]
    haft.rotation = [0.0, pitch, 0.0]
    shoulder.location = list(pivots["shoulder"])
    shoulder.rotation = [0.0, lean, 0.0]


def _spike(scene, parent, at, height, lit, index):
    """One resonator driven into the road.

    Path B never hits harder -- it hits FASTER, then slows, then chains, then
    shakes the map. So its weapon stops being a thing he swings at bodies and
    becomes a thing he drives into the ground: a tuned stake that rings. The
    slow is the road humming; the chain is one stake setting off the next.

    Planted, therefore MAP-FIXED: it goes under the world_fixed node, so it
    never turns with him. See the model contract in AGENTS.md.
    """
    x, y = at
    _from = len(scene.meshes)
    td.cyl(scene, "spike_base_%d" % index, 0.15, 0.07, (x, y, 0.035),
           (0, 0, 0), "stone_dark", parent, 8)
    # A tapered shaft, so it reads as DRIVEN rather than stood on the floor.
    td.frustum(scene, "spike_shaft_%d" % index, 0.105, 0.052, height,
               (x, y, 0.07 + height * 0.5), "iron", parent, verts=6,
               alternate_mat="iron_dark")
    td.torus(scene, "spike_collar_%d" % index, 0.085, 0.020,
             (x, y, 0.07 + height * 0.62), (0, 0, 0), "brass", parent,
             major_segments=10, minor_segments=4)
    # The tuned length: the part that actually rings, and the only bright note.
    td.box(scene, "spike_tine_%d" % index, (0.045, 0.045, height * 0.44),
           (x, y, 0.07 + height * 0.92), (0, 0, 0),
           "ley" if lit else "ley_dim", parent)
    td.ellipsoid(scene, "spike_cap_%d" % index, (0.10, 0.10, 0.08),
                 (x, y, 0.07 + height * 1.16), "steel", parent)
    for m in scene.meshes[_from:]:
        m.is_prop = True


def _spike_ring(scene, parent, tier):
    """Where the stakes stand. B3 plants one, B4 a line of three along the
    road, B5 a full ring -- which is exactly the shape of what each tier does:
    one target, a chain, then everything at once."""
    if tier == 3:
        return [((0.62, -0.10), 0.46, False)]
    if tier == 4:
        return [((0.60, -0.34), 0.44, False),
                ((0.72, 0.02), 0.50, True),
                ((0.58, 0.38), 0.44, False)]
    out = []
    for i in range(6):
        a = math.tau * i / 6 + 0.22
        out.append(((math.cos(a) * 0.82, math.sin(a) * 0.82),
                    0.42 + 0.10 * (i % 2), i % 2 == 0))
    return out


def build_b(group):
    """One path-B body. `group` is b3 / b4 / b5.

    He keeps a hammer -- a SHORT one, choked up for speed, because the tier
    sells rate and not weight -- and swings it down onto the nearest stake
    rather than at anything walking past.
    """
    scene = td.Scene(PALETTE)
    root = scene.node("root")
    tier = {"b3": 3, "b4": 4, "b5": 5}[group]

    # The stakes belong to the map, not to the man. Under a world-fixed node
    # they are exported as their own group and drawn with the aim taken out,
    # so he can turn to face a target while they stay driven into the road.
    ground = scene.node("world_fixed_stakes", root, world_fixed=True)
    for at, height, lit in _spike_ring(scene, ground, tier):
        _spike(scene, ground, at, height, lit and tier >= 5,
               len(scene.meshes))

    figure = scene.node("figure", root)
    shoulder = scene.node("shoulder", figure, location=(0, 0, SHOULDER_Z),
                          animated=True)
    haft = scene.node("haft", shoulder, animated=True)

    bulk = 1.0 + 0.03 * (tier - 3)
    _legs(scene, figure, stance=0.15)
    _torso(scene, figure, bulk)
    _head(scene, figure, hood=False)

    # A short striking hammer, held ready over the nearest stake.
    low = (0.10, -0.20, HIP_Z + 0.30)
    high = (0.46, 0.04, SHOULDER_Z + 0.34)
    grips = (0.22, 0.58)
    head_size = (0.26, 0.22, 0.22)

    axis0, length0 = _haft_axis(low, high)
    grip_point = _point_on(low, axis0, grips[0] * length0)
    pivots = {"shoulder": (0, 0, SHOULDER_Z),
              "haft": (grip_point[0], grip_point[1], grip_point[2] - SHOULDER_Z)}

    weapon_from = len(scene.meshes)
    head_at, rot, axis, length = _hammer(scene, haft, low, high, head_size, 2)
    _ley_veins(scene, haft, head_at, rot, head_size, 1)
    weapon_to = len(scene.meshes)

    hands = _hands_on(scene, haft, low, high, grips, 0.055)
    _arms(scene, haft, hands, bare_right=True, bulk=bulk, body=figure)

    def pose(frame):
        # A short, fast tap: down onto the stake and straight back up. No
        # overhead haul -- that is path A's blow, and B is the one that sells
        # rate.
        pitch = _keys(frame, [(0.00, -0.30), (0.28, -0.62), (0.55, 0.72),
                              (0.72, 0.80), (1.00, -0.10)])
        lean = _keys(frame, [(0.00, -0.03), (0.28, -0.08), (0.55, 0.16),
                             (0.72, 0.18), (1.00, 0.00)])
        haft.location = [pivots["haft"][0], pivots["haft"][1],
                         pivots["haft"][2]]
        haft.rotation = [0.0, pitch, 0.0]
        shoulder.location = list(pivots["shoulder"])
        shoulder.rotation = [0.0, lean, 0.0]

    pen = penetration(scene, None, pose, WORK_FRAMES)
    model = td.build(scene, "warbringer-" + group, frames=WORK_FRAMES,
                     pose=pose)
    return model, pen


def build(group):
    """One body. `group` is base / a3 / a4 / a5."""
    scene = td.Scene(PALETTE)
    root = scene.node("root")

    tier = {"base": 0, "a3": 3, "a4": 4, "a5": 5}[group]
    overhead = tier >= 4
    bulk = 1.0 + 0.06 * min(tier, 3) + (0.10 if tier >= 4 else 0.0)

    # A4 AND A5 DO NOT TURN AT ALL, and that is expressed by the RUNTIME, not
    # here: js/gl/gl-world.js passes yaw 0 for a full-circle Warbringer.
    #
    # `fullCircle: true` makes the wedge 360 degrees, so `facingTarget` stops
    # meaning anything and the tower has no facing left to track. The owner read
    # that off the gameplay -- "he doesn't bother hitting the enemies, he stops
    # turning" -- and it is exactly what the code does.
    #
    # A `world_fixed` group would only cover the parts NOT under an animated
    # empty, so his arms and the hammer would still have swung round with the
    # aim. Refusing the yaw at the call site covers the whole model at once and
    # keeps one rule in one place.
    body_parent = root

    if overhead:
        _anvil_stand(scene, body_parent, 0.80 if tier == 4 else 0.92)

    figure = scene.node("figure", body_parent)
    # The two pivots the swing actually turns about. `shoulder` is the shoulder
    # line; `haft` is where his hands are on the shaft. Both are set before any
    # geometry is authored, because td_mesh stores each group's geometry in that
    # group's local space at frame 0 -- so the origin here IS the pivot.
    shoulder = scene.node("shoulder", figure, location=(0, 0, SHOULDER_Z),
                          animated=True)
    haft = scene.node("haft", shoulder, animated=True)

    _legs(scene, figure, stance=0.17 + 0.10 * (tier >= 4))
    _torso(scene, figure, bulk)
    _head(scene, figure, hood=(tier >= 5))

    # WHERE THE HAMMER IS, IN THE HELD POSE.
    #
    # Held across the body and angled up and away, so nothing crosses the
    # chest. At A4/A5 it is overhead instead -- the wound-up pose the tier is
    # about -- and both hands still close on the same shaft.
    if overhead:
        # THE HEAD IS ON THE GROUND, BESIDE HIM, and he is still holding it.
        #
        # A4/A5 is a monolith on a haft; nobody holds that at port arms all day.
        # The rest pose stands it on the deck and rakes the shaft back to his
        # hands -- he is LEANING on it.
        #
        # IT LIVES OFF HIS CENTRELINE. The first version ran the haft from
        # behind his shoulder to the ground in front at y = -0.02, which is
        # straight through his chest and hips: "the hammer is penetrating him
        # from the middle". `_SIDE` puts the whole weapon out past his ribs,
        # where a man actually rests a tool he is leaning on, and `penetration`
        # below now fails the build if any part of it is inside him.
        low = (-0.10, _SIDE, SHOULDER_Z + 0.04)
        high = (0.60, _SIDE - 0.06, 0.10 + 0.02 * (tier - 4))
        grips = (0.10, 0.34)
    else:
        low = (0.16, -0.24, HIP_Z + 0.16)
        high = (0.52, 0.26, SHOULDER_Z + 0.52)
        grips = (0.18, 0.52)

    # The grip point is the haft pivot: the hammer turns about his HANDS.
    #
    # `haft` is a CHILD of `shoulder`, so its location is relative to the
    # shoulder line, not to the model origin. Handing it the world-space grip
    # point stacked the two offsets and hung the whole weapon a metre above his
    # head -- which is what "some parts float" looks like from the side.
    axis0, length0 = _haft_axis(low, high)
    grip_point = _point_on(low, axis0, grips[0] * length0)
    grip_local = (grip_point[0], grip_point[1], grip_point[2] - SHOULDER_Z)
    pivots = {"shoulder": (0, 0, SHOULDER_Z), "haft": grip_local}

    head_size = {0: (0.34, 0.30, 0.30), 3: (0.44, 0.36, 0.36),
                 4: (0.62, 0.46, 0.46), 5: (0.78, 0.54, 0.54)}[tier]

    weapon_from = len(scene.meshes)
    head_at, rot, axis, length = _hammer(scene, haft, low, high, head_size,
                                         tier)
    if tier >= 3:
        _ley_veins(scene, haft, head_at, rot, head_size, 1 if tier == 3 else 2)
    weapon_to = len(scene.meshes)
    if tier >= 5:
        # The core, visible through a slot cut in the head.
        # Inlaid in the head, so it belongs to the WEAPON for the penetration
        # check -- it is supposed to be inside the hammer.
        td.box(scene, "core_slot", (head_size[0] * 0.30, head_size[1] * 1.06,
                                    head_size[2] * 0.34), head_at, rot, "ley",
               haft).is_weapon = True
        td.box(scene, "brace", (0.16, 0.44, 0.16),
               (-0.10, 0.0, SHOULDER_Z + 0.12), (0, 0, 0), "steel", figure)

    hands = _hands_on(scene, haft, low, high, grips,
                      0.055 + 0.012 * tier)
    _arms(scene, haft, hands, bare_right=True, bulk=bulk, body=figure)

    def pose(frame):
        _swing_pose(shoulder, haft, frame, overhead, pivots)

    pen = penetration(scene, None, pose, WORK_FRAMES)
    model = td.build(scene, "warbringer-" + group, frames=WORK_FRAMES,
                     pose=pose)
    return model, pen


def _tri_count(meshes):
    return sum(sum(len(f) - 2 for f in m.faces) for m in meshes)


# Parts of the body the weapon is ALLOWED to be inside. Hands close on the haft
# and forearms cross it -- that is a man holding something. Everything else is a
# hammer inside a person.
_TOUCHABLE = ("fist", "knuckle", "fore_", "upper_", "elbow", "deltoid",
              "wrist_band")


def penetration(scene, groups, pose, frames):
    """THE HAMMER MUST NOT BE INSIDE HIM. Per frame, per part, for real.

    The first version of this compared VERTEX to VERTEX and was worthless: two
    boxes interpenetrate happily with their corners far apart, so it reported a
    comfortable gap while the haft ran through his chest. This tests the weapon
    solids against the body solids as boxes and reports how deep the worst one
    goes -- which is the number that was wrong, and now cannot be.

    Returns (worst_depth, description) per frame.
    """
    weapon = [m for m in scene.meshes if getattr(m, "is_weapon", False)]
    body = [m for m in scene.meshes
            if not getattr(m, "is_weapon", False) and
            not getattr(m, "is_prop", False) and
            not any(k in m.name for k in _TOUCHABLE)]
    out = []
    for f in range(frames):
        pose(f)
        mats = {}
        for m in scene.meshes:
            node = m.parent
            key = id(node)
            if key not in mats:
                mats[key] = node.matrix_world() if node else td.identity()
        worst, who = 0.0, ""
        wboxes = [(m, td.world_aabb(m, mats[id(m.parent)])) for m in weapon]
        for b in body:
            bb = td.world_aabb(b, mats[id(b.parent)])
            for m, wb in wboxes:
                # A little slack: touching is fine, sinking in is not.
                d = td.overlap(wb, bb, 0.02)
                if d > worst:
                    worst, who = d, m.name + " in " + b.name
        out.append((worst, who))
    pose(0)
    return out


def check(model, weapon_tris):
    """DOES THE HAMMER EVER GO THROUGH HIM?

    The owner asked for this by name. Measured against the REAL BODY GEOMETRY,
    not a guessed capsule: every weapon vertex against every body vertex, per
    frame, in world space. A capsule was tried first and was useless -- fat
    enough to cover the chest it also swallowed the hip, so a man resting a
    haft against his own leg read as a clipping bug.

    The weapon is the HAMMER ONLY: the first `weapon_tris` triangles of the
    `haft` group, which is where `_hammer` puts them. His arms live in that
    group too and are excluded from BOTH sides -- a forearm crossing the chest
    is a man holding something, and a fist touching the haft is the entire
    point of the model.

    Reported as the smallest gap in Blender units. Negative means the hammer is
    inside him.
    """
    names = [g["name"] for g in model["groups"]]
    if "haft" not in names:
        return []
    haft = model["groups"][names.index("haft")]
    pos = model["positions"]

    def verts(first, count, M):
        out = []
        for v in range(first, first + count):
            p = (pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2])
            out.append(td.apply(M, p) if M else p)
        return out

    result = []
    for frame in model["frames"]:
        mats = []
        for gi, g in enumerate(model["groups"]):
            m = frame[gi]
            mats.append([[m[c * 4 + r] for c in range(4)] for r in range(4)]
                        if m else None)
        weapon_count = min(weapon_tris * 3, haft["count"])
        weapon = verts(haft["first"], weapon_count, mats[names.index("haft")])
        body = []
        for gi, g in enumerate(model["groups"]):
            if g["name"] == "haft":
                continue          # weapon and arms both live here
            body.extend(verts(g["first"], g["count"], mats[gi]))
        worst = 1e9
        for w in weapon:
            for b in body:
                d = ((w[0] - b[0]) ** 2 + (w[1] - b[1]) ** 2 +
                     (w[2] - b[2]) ** 2)
                if d < worst:
                    worst = d
        result.append(math.sqrt(worst))
    return result


def main():
    ok = True
    for group in ("base", "a3", "a4", "a5", "b3", "b4", "b5"):
        model, pen = (build_b(group) if group.startswith("b") and group != "base"
                      else build(group))
        td.write_js(model, "warbringer-%s.js" % group)
        worst = max(p[0] for p in pen)
        who = [p[1] for p in pen if p[0] == worst][0]
        if worst > 0:
            ok = False
        print("warbringer-%-5s %5d tris  deepest weapon-in-body %.3f%s" % (
            group, model["triangles"], worst,
            ("   <-- " + who) if worst > 0 else "   clear"))
    if not ok:
        raise SystemExit("the weapon is inside the figure; fix the pose")


if __name__ == "__main__":
    main()
