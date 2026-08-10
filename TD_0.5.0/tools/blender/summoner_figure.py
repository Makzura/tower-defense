# ---------------------------------------------------------------------------
# The Summoner HIMSELF -- l'invocateur. tower_summoner.py builds the ten blubs
# he spits out; this builds the man who traces the circle, his seven bodies and
# the four crosspath marks.
#
#   python tools/blender/summoner_figure.py                 build everything
#   python tools/blender/summoner_figure.py --silhouette    build PASS 1 forms
#
# PASS 1 vs PASS 2, exactly as tower_summoner.py does it: every solid carries
# its real material name from the first line, and `--silhouette` swaps the whole
# palette for one flat grey. Shape is judged first and colour is a palette
# change, not a rebuild, so the two passes cannot drift apart.
#
# THE ARC, and it is the whole reason there are seven bodies:
#
#   base   a plain man on one knee, drawing a chalk circle with his own hand.
#   a3     the GRIMOIRE does it. It hangs in front of him, a second page fanned
#          open, and he has stepped back with his hands off the work.
#   a4     the TOTEM does it. It is planted at the centre of the circle -- his
#          old place -- and he walks the rim, nearly decorative.
#   a5     the circle OVERFLOWS the footprint and he is back on his knees under
#          it, propped on one hand, shoulders uneven, head hanging. A5 is where
#          the brief insists you can already see him losing.
#   b3     an exoskeleton column up his back, cables to shoulders and hips,
#          fist driven into the ground.
#   b4     armour, vents, and his feet LEAVE THE GROUND. Body reared back.
#   b5     a mage-mecha with its arms spread wide.
#
# PATH B IS BUILT ON PATH A, NOT INSTEAD OF IT. B3 requires A2, so every path B
# body carries a BOLTED ENGRAVED STONE PLATE in its chassis and LICHEN in its
# joints -- `_inheritance()` below is called by all three and is not optional.
# It is also the one exemption to "voie B is never porous": the stone and the
# lichen growing in its seams are the only matte surfaces the machines have.
#
# HE REMAINS THE PERFORMER ON PATH B. The grimoire never floats on this side --
# see the mark note below.
#
# GEOMETRY IS AUTHORED IN WORLD SPACE (see td_mesh.build). `parent` picks the
# animated / world-fixed group, it is not a second transform, so every number
# here is a real position on the finished model. Feet at z = 0 on the bodies
# that stand; the two that levitate say so by having nothing at z = 0 but their
# own circle.
#
# WHAT RIDES WHICH GROUP. The man is on `body` and turns with the tower. The
# circle, the runes, the totem and the machine kerb are `world_fixed`, because a
# ritual drawn on the ground does not swivel when he looks somewhere else. That
# split does one more thing for free on A4: he is modelled OFF-CENTRE on the rim
# of a circle whose centre holds the totem, so when the body group turns he
# literally circles it.
#
# THE MARKS. Four small add-ons, each a separate model, each authored in the
# frame of ONE SEAT on the body -- so placing a mark is a translation onto that
# seat and nothing else. A mark may never move a joint, change a proportion or
# shift a pivot, and none of these do: they are drawn over an untouched body.
# SEATS below is the table, printed by main(), and the bodies read their own
# hand/head/hip positions out of the same POSES table the seats come from, so a
# seat cannot drift away from the limb it names.
#
#   a1  the runes of the circle -- STONE plaques with a chalk incision. Stone
#       because on path B this same mark is the engraving on his bolted plates,
#       and inherited stone is the one porous thing a machine is allowed.
#   a2  the grimoire, and it is SUBORDINATE: chrome-plated, shut, on a strap,
#       seated at the hip. It does not float and it does not glow -- a book that
#       glows is a book that is working, and on path B he does the work.
#   b1  a one-handed gauntlet, seated on the right hand.
#   b2  a raised visor with a heads-up pane, seated on the head.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402

PX_PER_UNIT = 20.0 * 1.529 * 1.04          # td_mesh.UNITS_TO_PX


def R(footprint_ul):
    """A unit's ground radius, in Blender units."""
    return footprint_ul / PX_PER_UNIT


# --- palettes ---------------------------------------------------------------
# Copied verbatim from tower_summoner.py: the man and the things he summons have
# to be the same two materials or the tower reads as two unrelated towers.
# Voie A: mate, poreuse, vert mousse / pierre grise / craie-ocre, emission
# FAIBLE et CHAUDE. Voie B: lisse, chrome et bleu profond, accent cyan, emission
# FORTE et FROIDE. A never emits cold light; B never shows a porous surface
# except on its inherited stone.
PALETTE = {
    # --- voie A, the organic ritual side ---
    "moss":       ("#5E7A4A", 0.0),
    "moss_dark":  ("#425834", 0.0),
    "lichen":     ("#8AA45E", 0.0),
    "stone":      ("#7A7A72", 0.0),
    "stone_dark": ("#55554F", 0.0),
    "chalk":      ("#D8D2BE", 0.0),
    "ochre":      ("#B0813C", 0.0),
    "warm_glow":  ("#C8A54E", 0.35),      # faible et chaude
    # --- voie B, the machine side ---
    "deep_blue":  ("#2B4A7A", 0.0),
    "blue_gel":   ("#3E6FA8", 0.0),
    "chrome":     ("#8E97A4", 0.0),
    "chrome_dk":  ("#565E6B", 0.0),
    "steel_bru":  ("#6E7683", 0.0),
    "cyan":       ("#5FE8FF", 1.0),       # forte et froide
    "cyan_dim":   ("#2A8FA8", 0.5),
    "white_hot":  ("#EAFBFF", 1.0),
    # --- shared ---
    "flesh":      ("#C9A88A", 0.0),
    "dark":       ("#1E2028", 0.0),
    "tooth":      ("#E8E4D6", 0.0),
    "eye":        ("#20242C", 0.0),
}

SILHOUETTE = dict((k, ("#9AA0A8", 0.0)) for k in PALETTE)


def palette(flat):
    return SILHOUETTE if flat else PALETTE


# --- the value ladders ------------------------------------------------------
# Separated by VALUE first and hue second, and the LARGEST surface takes the
# DARKEST value. On path A that is the trousers and the tunic; the sleeves sit a
# clear step above the tunic so an arm crossing the chest still reads, and only
# the sash, the skin and the chalk are bright. Luminances, roughly:
#   dark .12 -> moss_dark .32 -> moss .46 -> ochre .55 -> flesh .71 -> chalk .84
# On path B the bodysuit is the big surface and it is the darkest thing that is
# not a cable; plates, rims and the cyan run up from there:
#   dark .12 -> deep_blue .30 -> chrome_dk .37 -> steel_bru .47 -> chrome .60
MAT_A = {
    "leg": "dark", "knee": "moss_dark", "foot": "stone_dark",
    "torso": "moss_dark", "hem": "moss_dark", "belt": "ochre",
    "arm": "moss", "elbow": "moss_dark", "hand": "flesh",
    # The jaw and the neck are the SHADOW under a face, not a second skin. Run
    # as ochre they came out a gold chin, which at 55 px reads as a beard made
    # of brass. There is no darker flesh in the shared palette, so the shadow
    # borrows the neutral one.
    "skin": "flesh", "skin_dk": "stone_dark", "hair": "dark",
    "shoulder": "moss_dark",
}

MAT_B = {
    "leg": "deep_blue", "knee": "dark", "foot": "chrome_dk",
    "torso": "deep_blue", "hem": "chrome_dk", "belt": "chrome_dk",
    "arm": "deep_blue", "elbow": "dark", "hand": "flesh",
    "skin": "flesh", "skin_dk": "chrome_dk", "hair": "dark",
    "shoulder": "steel_bru",
}

GROUND_R = R(25)               # 0.786 -- the Summoner's own footprint radius
CIRCLE_R = GROUND_R * 0.80     # the chalk ring, comfortably inside it


# --- small geometry helpers -------------------------------------------------

def _norm(v):
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1e-6
    return (v[0] / n, v[1] / n, v[2] / n)


def _axis(a, b):
    """The (rotation, length) that puts a primitive's +Z along a -> b."""
    dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
    pitch = math.acos(max(-1.0, min(1.0, dz / length)))
    return (0.0, pitch, math.atan2(dy, dx)), length


def _mid(a, b):
    return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5)


def _lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def taper(s, name, a, b, r_a, r_b, mat, parent, verts=6, alt=None):
    """A frustum laid along the segment a -> b. This is the workhorse: limbs,
    torsos, the totem shaft and the exo column are all the same call, so a pose
    is a list of points and nothing has to be re-derived by hand."""
    rot, length = _axis(a, b)
    return td.frustum(s, name, r_a, r_b, length, _mid(a, b), mat, parent, verts,
                      rot, alt)


def plate(s, name, at, look, size, mat, parent, pitch=0.0):
    """A box whose local +X is turned to face `look`. `size` is
    (along look, across, up), which is how a plate is actually thought about."""
    lx, ly, _ = _norm(look)
    return td.box(s, name, size, at, (0.0, pitch, math.atan2(ly, lx)), mat,
                  parent)


def foot(s, name, ankle, toe, width, height, mat, parent):
    dx, dy = toe[0] - ankle[0], toe[1] - ankle[1]
    length = math.hypot(dx, dy) + 0.09
    return td.box(s, name, (length, width, height), _mid(ankle, toe),
                  (0.0, 0.0, math.atan2(dy, dx)), mat, parent)


# --- the man ----------------------------------------------------------------
# One builder, seven poses. Everything below reads its points out of POSES, so
# the marks' seats and the limbs they sit on are the same numbers.

def _legs(s, body, p, m, thick=0.095, knees=True):
    for tag in ("l", "r"):
        hip, knee = p["hip_" + tag], p["knee_" + tag]
        ankle, toe = p["ankle_" + tag], p["toe_" + tag]
        taper(s, "thigh_" + tag, hip, knee, thick, thick * 0.76, m["leg"], body, 6)
        taper(s, "shin_" + tag, knee, ankle, thick * 0.72, thick * 0.58,
              m["leg"], body, 6)
        # A bare knee needs a joint solid or the leg folds into a crease. An
        # armoured one has a plate over it and the ball is 20 triangles of
        # nothing, which is where path B's budget goes instead.
        if knees:
            td.ball(s, "knee_" + tag, thick * 0.80, knee, m["knee"], body, 5, 3)
        foot(s, "foot_" + tag, ankle, toe, thick * 1.5, 0.10, m["foot"], body)


def _arms(s, body, p, m, thick=0.078, hands=True, deltoid=True, elbows=True):
    for tag in ("l", "r"):
        sh, el, hand = p["sh_" + tag], p["el_" + tag], p["hand_" + tag]
        if deltoid:
            td.ball(s, "deltoid_" + tag, thick * 1.5, sh, m["shoulder"], body,
                    5, 3)
        taper(s, "upper_" + tag, sh, el, thick, thick * 0.86, m["arm"], body, 6)
        taper(s, "fore_" + tag, el, hand, thick * 0.82, thick * 0.68,
              m["arm"], body, 6)
        if elbows:
            td.ball(s, "elbow_" + tag, thick * 0.88, el, m["elbow"], body, 5, 3)
        if hands:
            td.ball(s, "fist_" + tag, thick * 0.95, hand, m["hand"], body, 5, 3)


def _torso(s, body, p, m, girth=1.0, hem=True):
    pelvis, chest = p["pelvis"], p["chest"]
    td.box(s, "hips", (0.26 * girth, 0.34 * girth, 0.18), pelvis, (0, 0, 0),
           m["belt"], body)
    taper(s, "trunk", pelvis, chest, 0.165 * girth, 0.195 * girth, m["torso"],
          body, 8)
    # The belt is a short collar on the trunk's own axis, so it cannot slide off
    # a leaning torso the way a horizontal band would.
    low = _lerp(pelvis, chest, 0.06)
    high = _lerp(pelvis, chest, 0.20)
    taper(s, "belt", low, high, 0.185 * girth, 0.185 * girth, m["belt"], body, 8)
    if hem:
        # A short tunic skirt: the largest single surface on path A, and the
        # reason the trousers below it are the darkest value on the model.
        # Kept NARROW and SHORT on purpose -- at 0.235 it flared into the same
        # width as his shoulders and the whole figure read as one barrel with a
        # head on it, which is the failure a value ladder cannot rescue.
        skirt = _lerp(pelvis, chest, -0.46)
        taper(s, "skirt", skirt, low, 0.212 * girth, 0.185 * girth, m["torso"],
              body, 8)


def _head(s, body, p, m, helm=None, visor=None):
    at, look = p["head"], _norm(p["look"])
    neck = _lerp(p["chest"], at, 0.42)
    taper(s, "neck", neck, _lerp(p["chest"], at, 0.88), 0.062, 0.070,
          m["skin_dk"], body, 5)
    if helm:
        td.ellipsoid(s, "helm", (0.235, 0.235, 0.255), at, helm, body,
                     (0, 0, 0), 6, 4)
        plate(s, "helm_crest", (at[0] - look[0] * 0.05, at[1] - look[1] * 0.05,
                                at[2] + 0.13), look, (0.20, 0.07, 0.09),
              m["shoulder"], body)
        plate(s, "visor", (at[0] + look[0] * 0.16, at[1] + look[1] * 0.16,
                           at[2] + 0.01), look, (0.06, 0.21, 0.055),
              visor, body)
    else:
        td.ellipsoid(s, "skull", (0.200, 0.200, 0.240), at, m["skin"], body,
                     (0, 0, 0), 8, 4)
        plate(s, "jaw", (at[0] + look[0] * 0.05, at[1] + look[1] * 0.05,
                         at[2] - 0.10), look, (0.15, 0.15, 0.085),
              m["skin_dk"], body)
        plate(s, "hair", (at[0] - look[0] * 0.035, at[1] - look[1] * 0.035,
                          at[2] + 0.105), look, (0.20, 0.21, 0.095),
              m["hair"], body)
        # A brow band rather than eyes: at ~20 px across, two dots are noise and
        # a shadowed brow is the thing that actually reads as a face.
        plate(s, "brow", (at[0] + look[0] * 0.155, at[1] + look[1] * 0.155,
                          at[2] + 0.045), look, (0.07, 0.185, 0.05),
              m["hair"], body)

def figure(s, body, p, m, girth=1.0, helm=None, visor=None, hem=True,
           armoured=False, fists=True, deltoid=True):
    """`armoured` is path B: plates cover the knees and elbows, so the joint
    solids come off and the triangles go into the plates instead."""
    _legs(s, body, p, m, knees=not armoured)
    _torso(s, body, p, m, girth, hem)
    _arms(s, body, p, m, hands=fists, deltoid=deltoid, elbows=not armoured)
    _head(s, body, p, m, helm, visor)


# --- the ground -------------------------------------------------------------
# NOTHING HERE IS PAINT. The map draws its deck zones proud of the ground plane,
# so a flat mark at z ~ 0 is buried under the tile it is supposed to be lying on
# (the lesson tower_warbringer.py's fracture ring paid for). Every ring below is
# a real solid at least 0.05 units tall.

def _chalk_circle(s, fixed, radius, ticks=6, mat="chalk"):
    td.torus(s, "circle", radius, 0.036, (0, 0, 0.042), (0, 0, 0), mat, fixed,
             12, 4)
    for i in range(ticks):
        a = math.tau * i / ticks + 0.26
        td.box(s, "tick_%d" % i, (0.17, 0.045, 0.05),
               (math.cos(a) * (radius + 0.11), math.sin(a) * (radius + 0.11),
                0.035), (0, 0, a), mat, fixed)


def _machine_kerb(s, fixed, radius):
    """Path B's circle. He did not stop doing the ritual, he had it MACHINED:
    the same ring, cut in the inherited stone and clamped down with chrome."""
    td.torus(s, "kerb", radius, 0.048, (0, 0, 0.052), (0, 0, 0), "stone",
             fixed, 8, 4)
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        td.box(s, "clamp_%d" % i, (0.15, 0.11, 0.07),
               (math.cos(a) * radius, math.sin(a) * radius, 0.075), (0, 0, a),
               "chrome_dk", fixed)
    for i in range(2):
        a = math.pi * i + math.pi / 2
        td.box(s, "kerb_lamp_%d" % i, (0.09, 0.16, 0.035),
               (math.cos(a) * radius, math.sin(a) * radius, 0.098), (0, 0, a),
               "cyan", fixed)


# --- path B's mandatory inheritance -----------------------------------------

def _inheritance(s, body, plate_at, plate_look, joints, size=0.20):
    """A BOLTED ENGRAVED STONE PLATE and LICHEN IN THE JOINTS, on every path B
    body without exception. B3 costs A2, so the machine is standing on two tiers
    of ritual it never paid off: the plate is a piece of his old circle bolted
    into the chassis, and the lichen is what has grown back into the seams.

    It is also the only matte surface path B is allowed -- see the palette note
    at the top -- which is why the plate is `stone` and never `steel_bru`.
    """
    lx, ly, _ = _norm(plate_look)
    plate(s, "heritage_stone", plate_at, plate_look, (0.055, size, size * 0.86),
          "stone", body)
    # The engraving: two cut lines, sunk proud of the face so they survive as a
    # mark rather than as a texture nobody rendered. Cut in the SAME STONE one
    # value down -- filling them with ochre put a porous pigment on a machine,
    # and the plate's exemption covers the stone, not a paint job.
    for i, dz in enumerate((-size * 0.22, size * 0.22)):
        plate(s, "heritage_cut_%d" % i,
              (plate_at[0] + lx * 0.035, plate_at[1] + ly * 0.035,
               plate_at[2] + dz), plate_look, (0.02, size * 0.72, size * 0.10),
              "stone_dark", body)
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        plate(s, "heritage_bolt_%d" % i,
              (plate_at[0] + lx * 0.028 - ly * math.cos(a) * size * 0.36,
               plate_at[1] + ly * 0.028 + lx * math.cos(a) * size * 0.36,
               plate_at[2] + math.sin(a) * size * 0.34), plate_look,
              (0.03, 0.038, 0.038), "chrome", body)
    for i, j in enumerate(joints):
        td.ball(s, "heritage_lichen_%d" % i, 0.052, j, "lichen", body, 4, 3)


# ---------------------------------------------------------------------------
# THE POSES. Facing is +Y. `look` is where the head is pointed and is what puts
# the face, the brow and the hair on the right side of the skull.
# ---------------------------------------------------------------------------

def _pose(**kw):
    return kw


POSES = {
    # A plain man on one knee, right knee down, left forearm on his raised
    # knee, right hand ON THE GROUND with the chalk. Head bowed at the work.
    "base": _pose(
        pelvis=(0.00, -0.06, 0.56), chest=(0.02, 0.20, 1.00),
        head=(0.05, 0.36, 1.21), look=(0.05, 0.62, -0.78),
        hip_l=(0.14, -0.04, 0.55), knee_l=(0.19, 0.30, 0.44),
        ankle_l=(0.21, 0.24, 0.10), toe_l=(0.21, 0.42, 0.055),
        hip_r=(-0.14, -0.07, 0.54), knee_r=(-0.17, 0.14, 0.13),
        ankle_r=(-0.17, -0.30, 0.12), toe_r=(-0.17, -0.46, 0.07),
        sh_l=(0.21, 0.17, 1.01), el_l=(0.31, 0.32, 0.72),
        hand_l=(0.25, 0.36, 0.50),
        sh_r=(-0.21, 0.17, 1.01), el_r=(-0.31, 0.40, 0.70),
        hand_r=(-0.25, 0.60, 0.19)),

    # Standing, hands OFF the work: one hanging, one up at the chin. The book
    # in front of him is doing what he used to do with the chalk.
    "a3": _pose(
        pelvis=(0.00, -0.01, 0.92), chest=(0.00, 0.02, 1.32),
        head=(0.00, 0.03, 1.56), look=(0.0, 0.96, 0.28),
        hip_l=(0.13, 0.00, 0.90), knee_l=(0.15, 0.04, 0.48),
        ankle_l=(0.16, -0.01, 0.09), toe_l=(0.16, 0.16, 0.05),
        hip_r=(-0.13, 0.00, 0.90), knee_r=(-0.15, 0.02, 0.48),
        ankle_r=(-0.16, -0.03, 0.09), toe_r=(-0.16, 0.14, 0.05),
        sh_l=(0.22, 0.01, 1.36), el_l=(0.30, 0.09, 1.09),
        hand_l=(-0.07, 0.26, 1.05),
        sh_r=(-0.22, 0.01, 1.36), el_r=(-0.30, 0.09, 1.09),
        hand_r=(0.09, 0.25, 0.99)),

    # ON THE RIM, mid-stride, head turned in at the totem that took his place.
    # The offsets are literal: he stands 0.46 off centre, which is where the
    # body group's rotation turns walking into circling.
    "a4": _pose(
        pelvis=(-0.54, 0.05, 0.90), chest=(-0.55, 0.06, 1.30),
        head=(-0.54, 0.05, 1.54), look=(0.96, -0.14, 0.06),
        hip_l=(-0.41, 0.05, 0.88), knee_l=(-0.39, 0.27, 0.48),
        ankle_l=(-0.38, 0.39, 0.10), toe_l=(-0.38, 0.55, 0.05),
        hip_r=(-0.67, 0.05, 0.88), knee_r=(-0.69, -0.09, 0.47),
        ankle_r=(-0.70, -0.23, 0.13), toe_r=(-0.70, -0.35, 0.06),
        sh_l=(-0.33, 0.05, 1.34), el_l=(-0.28, -0.11, 1.07),
        hand_l=(-0.30, -0.22, 0.83),
        sh_r=(-0.76, 0.05, 1.34), el_r=(-0.81, 0.18, 1.06),
        hand_r=(-0.76, 0.30, 0.86)),

    # BROKEN. Both knees down, hips dragged back, trunk folded almost flat,
    # propped on the right hand, left arm hanging dead. The shoulders are NOT
    # level and the two knees are NOT square -- that asymmetry is the tremble,
    # and it is the only thing that makes a kneeling man read as a failing one.
    "a5": _pose(
        pelvis=(0.00, -0.18, 0.40), chest=(0.05, 0.10, 0.79),
        head=(0.07, 0.23, 0.87), look=(0.10, 0.42, -0.90),
        hip_l=(0.15, -0.16, 0.40), knee_l=(0.19, 0.12, 0.13),
        ankle_l=(0.19, -0.34, 0.11), toe_l=(0.19, -0.50, 0.06),
        hip_r=(-0.15, -0.21, 0.39), knee_r=(-0.21, 0.05, 0.13),
        ankle_r=(-0.21, -0.41, 0.11), toe_r=(-0.21, -0.57, 0.06),
        sh_l=(0.21, 0.05, 0.83), el_l=(0.31, 0.11, 0.52),
        hand_l=(0.33, 0.19, 0.23),
        sh_r=(-0.18, 0.11, 0.77), el_r=(-0.28, 0.33, 0.47),
        hand_r=(-0.24, 0.52, 0.09)),

    # Fist to the ground. Front foot planted, back knee down, the whole frame
    # loaded forward onto the fist -- a man being braced by a machine.
    "b3": _pose(
        pelvis=(0.00, -0.10, 0.66), chest=(0.02, 0.10, 1.05),
        head=(0.04, 0.17, 1.27), look=(0.05, 0.90, 0.12),
        hip_l=(0.15, -0.08, 0.66), knee_l=(0.22, 0.34, 0.46),
        ankle_l=(0.22, 0.30, 0.10), toe_l=(0.22, 0.48, 0.06),
        hip_r=(-0.15, -0.12, 0.65), knee_r=(-0.20, 0.10, 0.16),
        ankle_r=(-0.20, -0.34, 0.13), toe_r=(-0.20, -0.50, 0.07),
        sh_l=(0.24, 0.08, 1.07), el_l=(0.34, 0.21, 0.77),
        hand_l=(0.30, 0.34, 0.51),
        sh_r=(-0.24, 0.08, 1.07), el_r=(-0.35, 0.29, 0.71),
        hand_r=(-0.30, 0.46, 0.12)),

    # AIRBORNE. Nothing on this body touches z = 0: the lowest thing is a boot
    # at 0.30. Chest behind the pelvis and the chin up -- reared back, being
    # lifted rather than jumping.
    "b4": _pose(
        pelvis=(0.00, 0.02, 1.06), chest=(0.00, -0.16, 1.44),
        head=(0.01, -0.25, 1.66), look=(0.0, 0.72, 0.69),
        hip_l=(0.15, 0.04, 1.05), knee_l=(0.19, 0.32, 0.78),
        ankle_l=(0.19, 0.16, 0.42), toe_l=(0.19, 0.32, 0.35),
        hip_r=(-0.15, 0.04, 1.05), knee_r=(-0.19, 0.30, 0.76),
        ankle_r=(-0.19, 0.12, 0.40), toe_r=(-0.19, 0.28, 0.33),
        sh_l=(0.27, -0.14, 1.46), el_l=(0.39, 0.03, 1.19),
        hand_l=(0.34, 0.25, 1.01),
        sh_r=(-0.27, -0.14, 1.46), el_r=(-0.39, 0.03, 1.19),
        hand_r=(-0.34, 0.25, 1.01)),

    # ARMS SPREAD WIDE, still off the ground, and taller than a man now: the
    # helm crown lands near 1.95 where the base body tops out at 1.30.
    "b5": _pose(
        pelvis=(0.00, 0.00, 1.14), chest=(0.00, -0.02, 1.56),
        head=(0.00, 0.00, 1.79), look=(0.0, 0.98, 0.12),
        hip_l=(0.17, 0.00, 1.12), knee_l=(0.21, 0.18, 0.80),
        ankle_l=(0.21, 0.06, 0.48), toe_l=(0.21, 0.24, 0.42),
        hip_r=(-0.17, 0.00, 1.12), knee_r=(-0.21, 0.18, 0.80),
        ankle_r=(-0.21, 0.06, 0.48), toe_r=(-0.21, 0.24, 0.42),
        sh_l=(0.30, -0.02, 1.60), el_l=(0.56, 0.05, 1.60),
        hand_l=(0.82, 0.09, 1.55),
        sh_r=(-0.30, -0.02, 1.60), el_r=(-0.56, 0.05, 1.60),
        hand_r=(-0.82, 0.09, 1.55)),
}


# THE MARK SEATS. One point per mark per body, read out of the pose above so a
# seat cannot drift off the limb it names. A mark is authored around the origin
# in its seat's frame and placed by TRANSLATION ONLY -- no scale, no re-pose, no
# new pivot, which is the whole rule for a mark.
def _seats(tier):
    p = POSES[tier]
    hip = _lerp(p["pelvis"], p["chest"], 0.16)
    lx, ly, _ = _norm(p["look"])
    return {
        "circle": (0.0, 0.0, 0.0),                       # a1: the ground ring
        "hip": (hip[0] + 0.235 * ly, hip[1] - 0.235 * lx, hip[2] - 0.02),
        "hand_r": p["hand_r"],                           # b1: the right fist
        "head": p["head"],                               # b2: the skull
    }


SEATS = dict((t, _seats(t)) for t in POSES)


# ---------------------------------------------------------------------------
# The seven bodies.
# ---------------------------------------------------------------------------

def body_base(s, body, fixed):
    """A PLAIN HUMAN. No mystery and no monstrousness -- this is the tier the
    whole tower has to be readable against, so he gets no glow, no hardware and
    nothing that is not cloth, chalk or a satchel. He does everything himself:
    the chalk is IN his hand and his hand is ON the ring."""
    p = POSES["base"]
    figure(s, body, p, MAT_A)
    _chalk_circle(s, fixed, CIRCLE_R, 6)
    # The chalk, running from his fist down to the line he is drawing.
    hand = p["hand_r"]
    taper(s, "chalk", hand, (hand[0] + 0.02, hand[1] + 0.06, 0.055), 0.030,
          0.026, "chalk", body, 5)
    # A satchel of chalk and ochre on his off hip: the whole of his equipment.
    plate(s, "satchel", (0.30, -0.13, 0.62), (0.6, -0.8, 0.0),
          (0.11, 0.22, 0.20), "stone_dark", body)
    taper(s, "satchel_strap", (0.18, -0.06, 0.96), (0.29, -0.11, 0.70), 0.022,
          0.022, "ochre", body, 5)
    # The pot of ochre he is dipping into, on the ground inside the ring.
    td.frustum(s, "pot", 0.085, 0.105, 0.13, (0.40, -0.34, 0.065), "stone_dark",
               fixed, 7)
    td.frustum(s, "pot_fill", 0.088, 0.088, 0.02, (0.40, -0.34, 0.135), "ochre",
               fixed, 7)


def body_a3(s, body, fixed):
    """THE GRIMOIRE DOES IT NOW. It hangs unsupported at chest height with a
    second page fanned open off the spine, and both his hands are away from it:
    one hanging, one at his chin. He is watching the book work, which is the
    tier's whole statement -- the first thing he delegated."""
    p = POSES["a3"]
    figure(s, body, p, MAT_A)
    _chalk_circle(s, fixed, CIRCLE_R, 6)

    # THE BOOK. Two covers held open in a shallow V, a page block between them,
    # and a second leaf fanned out to the side so the shape is not one slab.
    #
    # IT HAS TO CLEAR HIM. The first pass hung it at chest height 0.22 in front
    # of the trunk and from the front it simply became his chest -- one pale
    # slab on another. It sits a full arm's length out and above the folded
    # forearms now, with air on every side of it, because the whole tier is
    # "the book is doing this and he is not".
    bx, by, bz = 0.0, 0.56, 1.30
    for sx in (-1, 1):
        td.box(s, "cover_%d" % sx, (0.18, 0.042, 0.24),
               (bx + sx * 0.105, by + 0.014, bz), (-0.22, 0, sx * 0.38),
               "stone_dark", body)
        td.box(s, "pages_%d" % sx, (0.155, 0.030, 0.205),
               (bx + sx * 0.098, by - 0.018, bz), (-0.22, 0, sx * 0.38),
               "chalk", body)
    td.box(s, "spine", (0.055, 0.080, 0.25), (bx, by + 0.03, bz), (-0.22, 0, 0),
           "ochre", body)
    # The second page, fanned open and standing away from the block.
    td.box(s, "fanned_page", (0.19, 0.022, 0.18),
           (bx + 0.235, by - 0.06, bz + 0.11), (0.0, -0.30, 0.66), "chalk", body)
    # What holds it up: a weak WARM light under the spine, never a cold one.
    td.box(s, "book_light", (0.11, 0.11, 0.045), (bx, by - 0.02, bz - 0.15),
           (0, 0, 0), "warm_glow", body)
    for i, a in enumerate((0.5, 2.3, 4.1)):
        td.box(s, "leaf_%d" % i, (0.075, 0.02, 0.06),
               (bx + math.cos(a) * 0.31, by + 0.02 + math.sin(a) * 0.10,
                bz - 0.30 + i * 0.21), (0, 0, a), "chalk", body)


def body_a4(s, body, fixed):
    """THE TOTEM DOES IT NOW, and it is standing where he used to kneel. He is
    off on the rim of his own circle, mid-stride, looking in at it -- the tier
    where he becomes decoration on his own tower. The totem is a SEPARATE
    OBJECT planted in the ground, not something he carries: it is world-fixed,
    he is not, so the body group's rotation walks him around it."""
    p = POSES["a4"]
    figure(s, body, p, MAT_A)
    _chalk_circle(s, fixed, CIRCLE_R, 0)

    # THE TOTEM: buried foot, carved shaft, one face, a bound crown. Alternating
    # facet materials on the shaft do the carving for free. It stands 0.62 clear
    # of the man -- close enough to be his, far enough that the two never fuse
    # into one lump from any angle the tower can be turned to.
    tx = 0.08
    td.frustum(s, "totem_root", 0.215, 0.175, 0.20, (tx, 0.0, 0.10),
               "stone_dark", fixed, 8)
    taper(s, "totem_shaft", (tx, 0.0, 0.20), (tx, 0.0, 1.18), 0.165, 0.140,
          "stone", fixed, 8, "stone_dark")
    td.box(s, "totem_face", (0.26, 0.30, 0.34), (tx, 0.0, 0.90), (0, 0, 0),
           "stone", fixed)
    for sx in (-1, 1):
        td.box(s, "totem_eye_%d" % sx, (0.07, 0.05, 0.06),
               (tx + sx * 0.072, 0.155, 0.97), (0, 0, 0), "dark", fixed)
    td.box(s, "totem_mouth", (0.20, 0.05, 0.055), (tx, 0.155, 0.83),
           (0, 0, 0), "dark", fixed)
    # A binding of cord and a lichen crust: it has been standing here a while.
    taper(s, "totem_bind", (tx, 0.0, 1.18), (tx, 0.0, 1.27), 0.155, 0.155,
          "ochre", fixed, 8)
    taper(s, "totem_crown", (tx, 0.0, 1.27), (tx, 0.0, 1.50), 0.145, 0.075,
          "moss_dark", fixed, 8)
    td.ball(s, "totem_light", 0.085, (tx, 0.0, 1.55), "warm_glow", fixed, 6, 4)
    td.ball(s, "totem_lichen", 0.075, (tx - 0.12, 0.10, 0.44), "lichen", fixed,
            5, 3)


def body_a5(s, body, fixed):
    """THE CIRCLE HAS OUTGROWN THE TOWER AND IS TAKING HIM WITH IT.

    The outer ring is deliberately drawn OUTSIDE the 25 u.l. footprint -- that
    overflow is the tier's whole picture -- and it is the only lit thing here.
    He is back on his knees under it with his weight on one hand, and three
    threads of warm light run out of his chest into the ring, which is the brief
    being explicit that A5 must already show him losing."""
    p = POSES["a5"]
    figure(s, body, p, MAT_A)
    _chalk_circle(s, fixed, CIRCLE_R * 0.86, 0)

    over = GROUND_R * 1.24                   # past the footprint, on purpose
    td.torus(s, "overflow", over, 0.05, (0, 0, 0.055), (0, 0, 0), "warm_glow",
             fixed, 12, 4)
    for i in range(5):
        a = math.tau * i / 5 + 0.5
        td.box(s, "rune_stone_%d" % i, (0.11, 0.09, 0.20),
               (math.cos(a) * over * 0.86, math.sin(a) * over * 0.86, 0.10),
               (0, 0, a), "stone", fixed)
    # THE SIPHON: it is drinking out of him, not the other way round.
    chest = p["chest"]
    for i, a in enumerate((0.9, 2.6, 4.4)):
        # Thin. At 0.018 they read as tripod legs holding him UP, which is the
        # opposite of the thing they are for: they are what is running out.
        taper(s, "thread_%d" % i, (chest[0], chest[1] - 0.02, chest[2] - 0.02),
              (math.cos(a) * over, math.sin(a) * over, 0.08), 0.012, 0.022,
              "warm_glow", body, 4)
    # His chalk, snapped, where he dropped it.
    td.box(s, "chalk_stub", (0.09, 0.05, 0.05), (0.36, 0.44, 0.03), (0, 0, 0.4),
           "chalk", fixed)


def body_b3(s, body, fixed):
    """AN EXOSKELETON COLUMN UP HIS BACK. The spine is the silhouette: a
    segmented mast standing off his back and overhanging the head, with cables
    down to both shoulders and both hips, and his fist driven into the ground.

    He still owes A2 for this, so the plate and the lichen are here."""
    p = POSES["b3"]
    # B3 is the only path B body with no pauldron, so it keeps its deltoids:
    # the cables have to land on a shoulder that is actually there.
    figure(s, body, p, MAT_B, girth=1.05, hem=False, armoured=True)
    _machine_kerb(s, fixed, CIRCLE_R)

    base = (0.0, -0.28, 0.54)
    top = (0.02, -0.30, 1.44)
    taper(s, "column", base, top, 0.075, 0.055, "chrome_dk", body, 6)
    for i in range(4):
        t = 0.12 + 0.26 * i
        at = _lerp(base, top, t)
        td.box(s, "vertebra_%d" % i, (0.17, 0.13, 0.075),
               (at[0], at[1], at[2]), (0, 0, 0), "steel_bru", body)
    td.box(s, "column_head", (0.18, 0.14, 0.10), (0.02, -0.28, 1.47), (0, 0, 0),
           "chrome", body)
    td.box(s, "column_lamp", (0.05, 0.10, 0.035), (0.02, -0.20, 1.47),
           (0, 0, 0), "cyan", body)
    # Cables. They land ON the joints the pose already defines, so nothing here
    # can float away from the man it is bolted to.
    for tag in ("l", "r"):
        taper(s, "cable_sh_" + tag, _lerp(base, top, 0.78), p["sh_" + tag],
              0.028, 0.024, "dark", body, 5)
        taper(s, "cable_hip_" + tag, _lerp(base, top, 0.10), p["hip_" + tag],
              0.030, 0.026, "dark", body, 5)
    # A brace on the planted arm: this is what is holding the fist down.
    taper(s, "brace", p["el_r"], p["hand_r"], 0.062, 0.070, "steel_bru", body, 6)
    _inheritance(s, body, (0.16, 0.23, 1.02), (0.35, 0.94, 0.0),
                 (p["knee_r"], p["el_l"], _lerp(base, top, 0.02)), 0.19)


def body_b4(s, body, fixed):
    """HE LEAVES THE GROUND. Nothing on this body reaches z = 0 -- the lowest
    solid is a boot at 0.30 -- and the ring he used to kneel on is still down
    there without him. Body reared back, chin up, armour closed over the suit
    and the vents pointed down, because something has to be doing the lifting."""
    p = POSES["b4"]
    figure(s, body, p, MAT_B, girth=1.10, hem=False, helm="chrome_dk",
           visor="cyan", armoured=True, deltoid=False)
    _machine_kerb(s, fixed, CIRCLE_R)

    chest, look = p["chest"], p["look"]
    plate(s, "cuirass", (chest[0], chest[1] + 0.10, chest[2] - 0.02),
          (0.0, 1.0, 0.0), (0.11, 0.40, 0.42), "steel_bru", body, pitch=-0.30)
    plate(s, "cuirass_rim", (chest[0], chest[1] + 0.14, chest[2] + 0.19),
          (0.0, 1.0, 0.0), (0.09, 0.34, 0.06), "chrome", body, pitch=-0.30)
    for sx in (-1, 1):
        td.frustum(s, "pauldron_%d" % sx, 0.19, 0.13, 0.17,
                   (sx * 0.31, -0.15, 1.52), "steel_bru", body, 6,
                   (0, sx * -0.42, 0))
        # The vents. Angled DOWN and back, with the cold light inside them.
        td.box(s, "vent_%d" % sx, (0.13, 0.15, 0.30), (sx * 0.19, -0.30, 1.16),
               (0.42, 0, 0), "chrome_dk", body)
        td.box(s, "vent_glow_%d" % sx, (0.07, 0.09, 0.16),
               (sx * 0.19, -0.24, 1.01), (0.42, 0, 0), "cyan", body)
        # Thrust off the soles: the reason the boots are where they are.
        td.frustum(s, "sole_jet_%d" % sx, 0.075, 0.035, 0.16,
                   (sx * 0.19, 0.24, 0.24), "cyan_dim", body, 6, (0.5, 0, 0))
    # The field he is standing on instead of the ground. It rides the BODY, not
    # the kerb: it is what is holding him up, so it goes where he goes.
    td.torus(s, "lift_field", 0.44, 0.032, (0, 0.10, 0.19), (0, 0, 0),
             "cyan_dim", body, 10, 4)
    _inheritance(s, body, (chest[0] - 0.20, chest[1] + 0.16, chest[2] - 0.12),
                 (-0.45, 0.89, 0.0),
                 (p["knee_l"], p["el_r"], (0.0, -0.28, 1.30)), 0.18)


def body_b5(s, body, fixed):
    """THE MAGE-MECHA, ARMS SPREAD WIDE. The span is the silhouette: he is the
    only body here that is wider than it is tall, and the only one whose head
    clears 1.9. A ring stands behind his shoulders -- the circle he used to draw
    on the ground, now built into the machine and carried at head height."""
    p = POSES["b5"]
    # No fists: the gauntlets below ARE his hands now, which is the tier.
    figure(s, body, p, MAT_B, girth=1.16, hem=False, helm="chrome_dk",
           visor="cyan", armoured=True, deltoid=False, fists=False)
    _machine_kerb(s, fixed, CIRCLE_R)

    chest = p["chest"]
    plate(s, "cuirass", (chest[0], chest[1] + 0.12, chest[2] - 0.02),
          (0.0, 1.0, 0.0), (0.12, 0.44, 0.46), "steel_bru", body)
    plate(s, "cuirass_rim", (chest[0], chest[1] + 0.16, chest[2] + 0.22),
          (0.0, 1.0, 0.0), (0.10, 0.38, 0.07), "chrome", body)
    td.ball(s, "core", 0.095, (chest[0], chest[1] + 0.20, chest[2] - 0.02),
            "cyan", body, 5, 3)
    for sx in (-1, 1):
        td.frustum(s, "pauldron_%d" % sx, 0.235, 0.145, 0.22,
                   (sx * 0.36, -0.02, 1.66), "steel_bru", body, 5,
                   (0, sx * -0.90, 0))
        td.box(s, "gauntlet_%d" % sx, (0.17, 0.15, 0.15),
               (sx * 0.80, 0.09, 1.55), (0, 0, 0), "chrome", body)
        td.box(s, "palm_light_%d" % sx, (0.09, 0.09, 0.05),
               (sx * 0.80, 0.15, 1.50), (0, 0, 0), "white_hot", body)
        td.box(s, "vent_%d" % sx, (0.12, 0.14, 0.34), (sx * 0.20, -0.24, 1.30),
               (0, 0, 0), "chrome_dk", body)
        td.box(s, "vent_glow_%d" % sx, (0.06, 0.08, 0.20),
               (sx * 0.20, -0.31, 1.30), (0, 0, 0), "cyan", body)
        td.box(s, "thigh_plate_%d" % sx, (0.20, 0.19, 0.28),
               (sx * 0.20, 0.07, 0.98), (0, 0, sx * -0.14), "steel_bru", body)
        td.frustum(s, "sole_jet_%d" % sx, 0.085, 0.04, 0.18,
                   (sx * 0.21, 0.14, 0.32), "cyan_dim", body, 5, (0.35, 0, 0))
    # THE CARRIED CIRCLE. Same ring, off the ground at last. Eight segments and
    # a square section: it is a machined part now, and it should look stamped
    # rather than drawn.
    td.torus(s, "halo", 0.42, 0.036, (0.0, -0.24, 1.62), (1.35, 0, 0),
             "chrome", body, 8, 4)
    _inheritance(s, body, (chest[0] + 0.28, chest[1] + 0.14, chest[2] - 0.14),
                 (0.5, 0.87, 0.0),
                 (p["knee_r"], p["el_l"], (0.0, -0.20, 1.20)), 0.20)


# The path letter is carried, not derived: "base" starts with a b, and reading
# the path off the tier name quietly audited the plain human as a machine.
BODIES = [
    ("base", body_base, "A"), ("a3", body_a3, "A"), ("a4", body_a4, "A"),
    ("a5", body_a5, "A"),
    ("b3", body_b3, "B"), ("b4", body_b4, "B"), ("b5", body_b5, "B"),
]


# ---------------------------------------------------------------------------
# The four crosspath marks. Each is authored around its SEAT's origin, small
# enough to sit inside the body's existing outline, and drawn over a body that
# is not otherwise touched.
# ---------------------------------------------------------------------------

def mark_a1(s, body, fixed):
    """RUNES TRACED AROUND THE CIRCLE. Seat: `circle` -- ground level, tower
    centre, so this one needs no offset on any body.

    They are cut into STONE plaques rather than chalked on the dirt, and that is
    the crosspath doing its job: on path B the same mark is the engraving on his
    bolted plates, and inherited stone is the one porous material a machine is
    allowed to wear. Nothing here stands over 0.11, so it cannot touch a
    silhouette."""
    ring = CIRCLE_R + 0.055
    for i in range(6):
        a = math.tau * i / 6 + math.pi / 6
        cx, cy = math.cos(a) * ring, math.sin(a) * ring
        td.box(s, "rune_plaque_%d" % i, (0.150, 0.125, 0.06), (cx, cy, 0.055),
               (0, 0, a), "stone", fixed)
        # An L, not a dash: one stroke along the rim and one across it, which is
        # the difference between a rune and a tick mark at this size.
        td.box(s, "rune_cut_%d" % i, (0.105, 0.030, 0.03), (cx, cy, 0.096),
               (0, 0, a), "chalk", fixed)
        td.box(s, "rune_bar_%d" % i, (0.030, 0.078, 0.03),
               (cx + math.cos(a) * 0.035, cy + math.sin(a) * 0.035, 0.096),
               (0, 0, a), "chalk", fixed)


def mark_a2(s, body, fixed):
    """THE GRIMOIRE, AND IT IS SUBORDINATE. Seat: `hip`, on his off side.

    SHUT, STRAPPED AND CHROME-PLATED, and it does not emit -- a book that glows
    is a book that is doing the work, and on path B he is the only performer.
    Same object on path A, simply the one he carried before A3 taught it to
    float. Authored in the seat frame: +Y is the way he faces, +Z is up."""
    # It hangs FLAT AGAINST HIS FLANK -- covers facing out and in, spine
    # forward. A book carried edge-on to the body reads as a book; one carried
    # face-forward reads as a breastplate, which is the opposite claim.
    td.box(s, "book_block", (0.085, 0.21, 0.25), (0, 0, 0), (0, 0, 0), "tooth",
           body)
    for sx in (-1, 1):
        td.box(s, "book_cover_%d" % sx, (0.028, 0.225, 0.27),
               (sx * 0.058, 0, 0.005), (0, 0, 0), "chrome_dk", body)
    td.box(s, "book_plate", (0.016, 0.09, 0.20), (0.076, 0.045, 0.005),
           (0, 0, 0), "chrome", body)
    td.box(s, "book_spine", (0.115, 0.055, 0.28), (0, 0.105, 0.005), (0, 0, 0),
           "ochre", body)
    # The strap and its buckle: what makes it luggage instead of an oracle.
    taper(s, "book_strap", (0.072, -0.12, 0.21), (0.072, 0.10, -0.19), 0.020,
          0.020, "dark", body, 5)
    td.box(s, "book_clasp", (0.05, 0.075, 0.055), (0.082, 0.0, 0.0), (0, 0, 0),
           "chrome", body)


def mark_b1(s, body, fixed):
    """A ONE-HANDED GAUNTLET. Seat: `hand_r`, authored with +Y running out
    along the fingers and -Y back up the forearm, so placing it is a
    translation onto the fist the pose already put there.

    It carries a lichen bead at the cuff seam like every other path B part --
    the machine is bolted onto a ritual it never finished paying for."""
    td.frustum(s, "cuff", 0.105, 0.088, 0.17, (0, -0.13, 0), "chrome_dk", body,
               6, (math.pi / 2, 0, 0))
    td.box(s, "cuff_lip", (0.17, 0.06, 0.16), (0, -0.20, 0), (0, 0, 0),
           "chrome", body)
    td.box(s, "knuckle", (0.155, 0.13, 0.125), (0, 0.02, 0.005), (0, 0, 0),
           "steel_bru", body)
    for i, sx in enumerate((-1, 0, 1)):
        td.box(s, "finger_%d" % i, (0.036, 0.085, 0.05),
               (sx * 0.046, 0.10, -0.015), (0, 0, 0), "chrome", body)
    td.box(s, "back_light", (0.05, 0.075, 0.028), (0, 0.0, 0.075), (0, 0, 0),
           "cyan", body)
    td.ball(s, "cuff_lichen", 0.036, (0.06, -0.15, -0.045), "lichen", body, 5, 3)


def mark_b2(s, body, fixed):
    """A RAISED VISOR WITH A HEADS-UP PANE. Seat: `head`.

    RAISED, not lowered: his face stays visible, because path B is a man being
    augmented and the moment you close the visor he is a machine with nobody in
    it. The pane hangs in front of one eye only, which is what stops it reading
    as a second visor. It clears the skull by 0.08 and hugs it, so the head's
    outline does not change."""
    # The plate is WIDE ACROSS THE BROW and tipped up at the front edge. Built
    # deep-and-narrow it came out a beak.
    td.box(s, "visor_plate", (0.235, 0.105, 0.05), (0.0, 0.115, 0.185),
           (0.55, 0, 0), "chrome", body)
    td.box(s, "visor_edge", (0.235, 0.05, 0.022), (0.0, 0.168, 0.218),
           (0.55, 0, 0), "chrome_dk", body)
    for sx in (-1, 1):
        taper(s, "hinge_%d" % sx, (sx * 0.115, 0.015, 0.085),
              (sx * 0.106, 0.095, 0.170), 0.026, 0.022, "chrome_dk", body, 5)
    # The pane, over the RIGHT eye only -- over both it is a second visor, and
    # the whole point of this mark is that the visor is up.
    td.box(s, "hud_pane", (0.100, 0.014, 0.085), (-0.072, 0.180, 0.020),
           (0, 0, 0.30), "cyan_dim", body)
    td.box(s, "hud_tick", (0.050, 0.016, 0.018), (-0.072, 0.188, 0.046),
           (0, 0, 0.30), "cyan", body)
    td.ball(s, "hud_emitter", 0.030, (-0.128, 0.075, 0.100), "white_hot", body,
            5, 3)
    td.ball(s, "temple_lichen", 0.030, (0.122, 0.030, 0.075), "lichen", body,
            5, 3)


MARKS = [
    ("a1", mark_a1, "circle", "A"), ("a2", mark_a2, "hip", "A"),
    ("b1", mark_b1, "hand_r", "B"), ("b2", mark_b2, "head", "B"),
]


# ---------------------------------------------------------------------------

def build_body(tier, fn, flat):
    s = td.Scene(palette(flat))
    root = s.node("root")
    fixed = s.node("world_fixed", parent=root, world_fixed=True)
    body = s.node("body", parent=root)
    fn(s, body, fixed)
    return td.build(s, "summoner-" + tier), s


def build_mark(tag, fn, flat):
    s = td.Scene(palette(flat))
    root = s.node("root")
    # a1 lies on the ground and must not turn with him; the rest ride the man.
    fixed = s.node("world_fixed", parent=root, world_fixed=True)
    body = s.node("body", parent=root)
    fn(s, body, fixed)
    return td.build(s, "summoner-mark-" + tag), s


# --- the two hard rules, checked rather than remembered ----------------------
# Both of these were broken once while this file was being written -- an ochre
# engraving on a machine, and a warm ring that nearly became a cyan one -- so
# they are asserted at build time instead of trusted to a comment.

COLD = ("cyan", "cyan_dim", "white_hot")
POROUS = ("moss", "moss_dark", "chalk", "ochre")
INHERITED = ("stone", "lichen")


def _materials(scene):
    used = set()
    for mesh in scene.meshes:
        used.add(mesh.mat)
        if mesh.face_mats:
            used.update(mesh.face_mats)
    return used


def audit(name, path, scene, body=False):
    """A never emits cold light. B is never porous except on its inherited
    stone -- and every path B BODY must actually carry that inheritance."""
    used = _materials(scene)
    if path == "A":
        bad = sorted(used & set(COLD))
        if bad:
            raise SystemExit("%s (voie A) emits cold light: %s" % (name, bad))
    else:
        bad = sorted(used & set(POROUS))
        if bad:
            raise SystemExit("%s (voie B) shows a porous surface: %s"
                             % (name, bad))
        if body:
            missing = [m for m in INHERITED if m not in used]
            if missing:
                raise SystemExit("%s (voie B) is missing its A2 inheritance: %s"
                                 % (name, missing))


def _extent(model, group=None):
    """Bounds straight off the emitted positions -- the numbers a silhouette
    review actually asks for. `group` restricts it to one export group, which
    is how the two levitating bodies are checked: the FIGURE's floor has to be
    well clear of zero while the circle it left behind is still on the ground.
    """
    pos = model["positions"]
    first, count = 0, len(pos) // 3
    if group is not None:
        for g in model["groups"]:
            if g["name"] == group:
                first, count = g["first"], g["count"]
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for v in range(first, first + count):
        for k in range(3):
            c = pos[v * 3 + k]
            lo[k] = min(lo[k], c)
            hi[k] = max(hi[k], c)
    return lo, hi


def main():
    flat = "--silhouette" in sys.argv
    print("building the Summoner figure (%s)"
          % ("SILHOUETTE" if flat else "full"))
    total = 0
    for tier, fn, path in BODIES:
        model, scene = build_body(tier, fn, flat)
        audit("summoner-" + tier, path, scene, True)
        td.write_js(model, "summoner-%s.js" % tier)
        lo, hi = _extent(model)
        flo, fhi = _extent(model, "")             # "" is the turning figure
        total += model["triangles"]
        print("  summoner-%-5s %4d tris  height %.2f  span %.2f  "
              "figure %.2f-%.2f%s"
              % (tier, model["triangles"], hi[2], hi[0] - lo[0], flo[2],
                 fhi[2], "  AIRBORNE" if flo[2] > 0.12 else ""))
    for tag, fn, seat, path in MARKS:
        model, scene = build_mark(tag, fn, flat)
        # A mark is audited on the path that SELLS it. It is then drawn over a
        # body of either path, which is the whole idea of a crosspath: a1's
        # chalk on a B chassis is the ritual showing through the machine, not a
        # palette violation.
        audit("summoner-mark-" + tag, path, scene)
        td.write_js(model, "summoner-mark-%s.js" % tag)
        lo, hi = _extent(model)
        total += model["triangles"]
        print("  summoner-mark-%-2s %4d tris   seat %-7s  box %.2f x %.2f x %.2f"
              % (tag, model["triangles"], seat, hi[0] - lo[0], hi[1] - lo[1],
                 hi[2] - lo[2]))
    print("  %d models, %d triangles total"
          % (len(BODIES) + len(MARKS), total))
    print("  footprint radius %.1f px (%.3f u), chalk circle %.3f u"
          % (GROUND_R * PX_PER_UNIT, GROUND_R, CIRCLE_R))
    print("  MARK SEATS (model space) -- a mark is TRANSLATED onto these:")
    print("    %-6s %-22s %-22s %-22s" % ("tier", "hip (a2)", "hand_r (b1)",
                                          "head (b2)"))
    for tier, _fn, _path in BODIES:
        seat = SEATS[tier]
        print("    %-6s %-22s %-22s %-22s" % (
            tier,
            "%.3f %.3f %.3f" % seat["hip"],
            "%.3f %.3f %.3f" % seat["hand_r"],
            "%.3f %.3f %.3f" % seat["head"]))
    print("    a1 seats on the circle at 0.000 0.000 0.000 on every body.")


if __name__ == "__main__":
    main()
