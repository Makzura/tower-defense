# ---------------------------------------------------------------------------
# THE CROSSPATH MARKS ON THE TEN BLUB UNITS.
#
# tower_summoner.py builds the ten bodies. This builds the twenty small add-ons
# that say a unit has been touched by the OTHER path, and it touches nothing
# else -- it does not import a body, does not re-emit one and cannot move one.
#
#   python tools/blender/summoner_unit_marks.py                build everything
#   python tools/blender/summoner_unit_marks.py --silhouette   build PASS 1 forms
#
# THE ABSOLUTE RULE, AND WHY IT IS TRUE BY CONSTRUCTION. A mark adds a detail ON
# TOP. It may never remodel anything, never change a proportion and never move a
# pivot: the same body with and without a mark has to be superposable pixel for
# pixel. Every mark here is therefore its OWN model -- `blub-mark-<mark>-<unit>`
# -- built in a scene that contains the mark and nothing else. There is no body
# geometry in this file to accidentally alter, and drawing a mark is drawing a
# second model over an untouched first one.
#
# THE BODIES ARE STILL THE SOURCE OF TRUTH FOR WHERE A MARK GOES. The radii come
# from tower_summoner's own R() and UNIT_FOOTPRINT, IMPORTED rather than retyped,
# so a footprint change moves the marks with the bodies instead of leaving them
# hanging in the air. What cannot be imported is the inside of `drop()`, `face()`
# and `_mini_body()` -- those bake their numbers into vertices -- so the profile
# coefficients are mirrored below in `_drop_radius`, next to the line of
# tower_summoner they were copied from, and `main()` prints the seat of every
# mark so a drift is visible the moment it happens.
#
# PASS 1 vs PASS 2, exactly as tower_summoner.py and summoner_figure.py do it:
# every solid carries its real material name from the first line and
# `--silhouette` swaps the whole palette for one flat grey, so form is judged
# before colour and the two passes cannot drift apart.
#
# THE ONE COLD LIGHT ON PATH A. b1 and b2 put cyan on a moss body, which is the
# only place in the whole tower where voie A emits cold. That is the point of the
# mark: the crosspath is supposed to be legible as a foreign thing on the
# creature, and cyan on moss is the loudest legal way to say so. It is rationed
# accordingly -- the marks carry cyan, cyan_dim and dark and NOTHING else, no
# chrome and no steel, so a marked blub still reads as a blub with a light in it
# rather than as a half-finished machine.
#
# VALUE FIRST, HUE SECOND, on both sides:
#   b1/b2  dark clasp (.12) under cyan (bright) -- the darkest value is the
#          seating, so the emissive piece has something to be bright against.
#   a1     moss_dark crust (.32) under lichen beads (.62) on chrome_dk (.37) and
#          deep_blue (.30) joints. The crust is what stops a lichen patch reading
#          as one flat blob at 12 px.
#   a2     the stone plate is the mark's LARGEST surface (.48), its engraving
#          cut one value DOWN in the same stone (.33), and chrome bolts (.60)
#          as the only bright note. The cuts were ochre until the critic pass
#          caught it: ochre is a pigment, voie B may never wear a porous
#          surface, and the plate's exemption covers the stone and not a paint
#          job on top of it. summoner_figure.py had it right all along.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402
import tower_summoner as ts                                   # noqa: E402

PX_PER_UNIT = 20.0 * 1.529 * 1.04          # td_mesh.UNITS_TO_PX

R = ts.R                                   # the unit radii, NOT retyped
UNIT_FOOTPRINT = ts.UNIT_FOOTPRINT


# --- palettes ---------------------------------------------------------------
# Copied verbatim from tower_summoner.py. It is copied and not imported on
# purpose: the palette is the contract every build script in this folder states
# for itself (summoner_figure.py does the same), while the footprint table is a
# derived number that must never be stated twice.
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


PATH_A = ["blub1", "blub2", "blub3", "mini1", "mini2", "hungry"]
PATH_B = ["cyber", "mecha", "mecha2", "superb"]


# ---------------------------------------------------------------------------
# Reading the bodies without touching them.
#
# `drop()` in tower_summoner stacks four frusta -- foot, belly, waist, dome --
# and bakes the result into vertices, so the only way to land a mark ON that
# surface is to mirror the profile. These are its coefficients, in its order:
#
#   foot   0.62 -> 0.94 over 0.00 .. 0.18 h
#   belly  0.94 -> 1.00 over 0.18 .. 0.44 h
#   waist  1.00 -> 0.74 over 0.44 .. 0.74 h
#   dome   0.74 -> 0.14 over 0.74 .. 1.00 h
#
# `squash` is the runtime HP hook and is 1.0 on every authored unit, so `wide`
# is r and the profile below is exact.
# ---------------------------------------------------------------------------

DROP_BANDS = ((0.00, 0.18, 0.62, 0.94), (0.18, 0.44, 0.94, 1.00),
              (0.44, 0.74, 1.00, 0.74), (0.74, 1.00, 0.74, 0.14))

DROP_SEGS = 12                              # drop()'s default `segs`


def _drop_radius(r, h, z):
    """The circumscribed radius of the drop at height z."""
    t = min(max(z / h, 0.0), 1.0)
    for t0, t1, k0, k1 in DROP_BANDS:
        if t <= t1:
            return r * (k0 + (k1 - k0) * (t - t0) / (t1 - t0))
    return r * DROP_BANDS[-1][3]


def _drop_front_y(r, h, z, x):
    """The FRONT (+Y) surface of the drop at height z and lateral offset x.

    A 12-gon puts a VERTEX on +Y, not a facet centre, so the nose of a blub is a
    ridge at the full radius and the surface falls away to either side of it --
    by 2.3 px across the Blub III's mouth, which is enough to bury the middle of
    a flat bar and float its ends at the same time. The two facets flanking the
    nose have normals at 75 and 105 degrees; this is that plane, and a ray probe
    against the built body agrees with it to four decimals."""
    rad = _drop_radius(r, h, z)
    half = math.pi / DROP_SEGS                       # 15 degrees
    n = math.pi / 2 - half                           # 75 degrees
    return (rad * math.cos(half) - math.cos(n) * abs(x)) / math.sin(n)


def _facet_seat(r, h, z, sx, along, thick, proud):
    """A seat lying FLAT on one of the two facets that flank the nose.

    This is what makes a mouth mark follow the body instead of hovering over it:
    the piece is laid in the facet plane, `along` from the nose ridge, and given
    `proud` of clearance. Returns (position, yaw) ready for `_chip`."""
    half = math.pi / DROP_SEGS
    yaw = math.pi / 2 - sx * half                    # the facet's outward normal
    nx, ny = math.cos(yaw), math.sin(yaw)
    tx, ty = sx * math.cos(half), -math.sin(half)    # along the facet, outward
    rad = _drop_radius(r, h, z)
    off = proud - thick * 0.5
    return ((tx * along + nx * off, rad + ty * along + ny * off, z), yaw)


# --- small builders shared by the marks --------------------------------------

def _chip(s, name, at, yaw, size, mat, body):
    """A flat piece whose local +X is the outward normal. `size` is
    (thickness out, width across, height), which is how a chip bolted to a
    surface is actually thought about."""
    return td.box(s, name, size, at, (0, 0, yaw), mat, body)


# ---------------------------------------------------------------------------
# THE FOUR MARKS.
# ---------------------------------------------------------------------------

def mark_b1(s, body, unit):
    """b1 -- THE MOUTH LIGHTS UP CYAN. Path A only.

    A blub's mouth is the one feature every unit on this path already has, and
    it is the feature the player watches, so the crosspath announces itself
    there. The piece is small, it is the only cold light on the body, and it
    sits OVER the mouth the body already models -- it never replaces it, so the
    dark mouth is still there underneath doing the drawing.

    WHAT THE MOUTH IS depends on the unit, so this has three shapes and they
    were settled by rendering, not by reading the body script:

      disc  the three drops' round or slotted mouth, on the nose.
      seam  the Hungry Blub. Its two jaws interpenetrate rather than gape, and
            the VALLEY where their outsides meet is what the eye reads as the
            mouth -- one lit chip in it, a dimmer chip at each corner.
      maw   the two minis. Their mouth is a dark bore seen from above, so the
            light goes on the bore's cap. Put on their front lip instead -- the
            place the geometry suggests -- it read as a lit chin.

    Brightest at the centre, dimmer at the edges, which is what keeps a mouth
    that is 4 to 12 px wide from reading as one flat bar."""
    b = BODIES[unit]
    kind = b["mouth_kind"]
    r, h = b["r"], b["h"]

    if kind == "maw":
        # The two minis are ALMOST ENTIRELY MOUTH (brief section 7) and what
        # reads as that mouth is the dark bore down the middle, not the lip.
        # So the light goes on the bore's own cap: a cyan disc laid over it,
        # inset far enough that the dark rim still draws the opening. Anything
        # on the front lip instead reads as a lit chin, which is what the first
        # pass did and what the render caught.
        mz, mr = b["maw_z"], b["maw_r"]
        td.frustum(s, "mouth_glow", mr, mr * 0.95, r * 0.04,
                   (0, r * 0.20, mz + r * 0.01), "cyan_dim", body, 8)
        td.frustum(s, "mouth_core", mr * 0.62, mr * 0.52, r * 0.05,
                   (0, r * 0.20, mz + r * 0.035), "cyan", body, 8)
        return

    if kind == "seam":
        # The mouth line of a two-cup gape, measured off the built body: it is
        # the VALLEY in the front surface, where the lower cup's outside runs
        # into the upper cup's. One lit chip in the valley, half swallowed by it,
        # and a dimmer chip at each corner where the line falls away.
        sy, sz = b["seam"]
        cx, cy, cz = b["side"]
        w, tall, thick = b["seam_w"], b["seam_h"], b["seam_t"]
        td.box(s, "mouth_seam", (w, thick, tall), (0, sy, sz), (0, 0, 0),
               "cyan", body)
        for sgn in (-1, 1):
            yaw = b["side_yaw"] if sgn > 0 else math.pi - b["side_yaw"]
            _chip(s, "mouth_corner", (sgn * cx, cy, cz), yaw,
                  (thick * 0.85, w * 0.52, tall * 0.85), "cyan_dim", body)
        return

    z = b["mouth_z"]

    if kind == "disc":
        # Blub I: a round mouth, so a round lens, on the nose ridge itself.
        rad = b["mouth_w"]
        depth = r * 0.11
        y = _drop_front_y(r, h, z, 0.0) - depth * 0.28
        td.frustum(s, "mouth_glow", rad, rad * 0.80, depth, (0, y, z), "cyan",
                   body, 8, (math.pi / 2, 0, 0))
        for sx in (-1, 1):
            at, yaw = _facet_seat(r, h, z, sx, rad * 1.45, r * 0.06, r * 0.02)
            _chip(s, "mouth_spill",
                  (at[0], at[1], at[2] + rad * 0.34), yaw,
                  (r * 0.06, rad * 0.44, rad * 0.34), "cyan_dim", body)

    else:                                   # "bar"
        # Blub II and III: a slot mouth, and the slot is wider than the facet
        # the nose is made of. So the light is TWO halves, each lying flat in
        # its own facet and meeting at the ridge -- a single flat bar across
        # both is the thing that buries its middle and floats its ends.
        w, tall = b["mouth_w"], b["mouth_h"]
        thick = r * 0.075
        for sx in (-1, 1):
            at, yaw = _facet_seat(r, h, z, sx, w * 0.5, thick, r * 0.025)
            _chip(s, "mouth_half", at, yaw, (thick, w, tall), "cyan", body)
            at, yaw = _facet_seat(r, h, z, sx, w + tall * 0.55, thick * 0.8,
                                  r * 0.02)
            _chip(s, "mouth_corner", (at[0], at[1], at[2] + tall * 0.10), yaw,
                  (thick * 0.8, tall * 1.15, tall * 0.80), "cyan_dim", body)


def mark_b2(s, body, unit):
    """b2 -- A THIN CYAN RING ENCIRCLING THE BODY. Path A only.

    The other half of the same statement as b1: a machined band clamped round a
    creature that has no straight lines anywhere on it. Twelve major segments
    because every blub body is built from 12-sided frusta and shares its phase,
    so the band's facets land on the body's facets and it hugs instead of
    hovering.

    It takes the body's own radius at its own height -- read out of
    `_drop_radius` on the drops, ray-probed on the three that are not bodies of
    revolution -- so it is ON the creature and not around it. A band that cuts
    into the body somewhere reads as fastened; one that floats everywhere reads
    as a hoop lying on the floor behind it.

    IT ALWAYS SITS BELOW THE FACE, and every unit's height was chosen against a
    render of the two marks TOGETHER. At the board's 34 degree pitch a
    horizontal ring is lowest on screen at its front and highest at its SIDES,
    and it is the sides that reach the mouth: the Blub III cleared it by 4 px
    at the front and still crossed the ends of its own lit mouth.

    THE CLASP is dark, not chrome: the darkest value in the mark goes under the
    emissive one, and it keeps path A's marks to cyan and shadow only."""
    b = BODIES[unit]
    z, cy, major = b["ring_z"], b["ring_y"], b["ring_r"]
    minor = 0.024                            # absolute: ~1.5 px thick on every
    td.torus(s, "ring", major, minor, (0, cy, z), (0, 0, 0), "cyan", body,
             12, 4)
    # One clasp, on the flank, so the ring has a direction and a seam.
    _chip(s, "ring_clasp", (major * 0.99, cy, z), 0.0,
          (minor * 2.2, minor * 3.4, minor * 3.4), "dark", body)


def mark_a1(s, body, unit):
    """a1 -- A PATCH OF LICHEN IN A JOINT. Path B only.

    Voie B is smooth by law and the inherited stone and the lichen in its seams
    are the single exemption (brief section 4). Every path B unit already wears
    one obligatory bead; this mark is the crosspath making it a COLONY, and it
    grows in a JOINT -- the shoulder seam of a graft, the hip where a leg leaves
    the hull -- because that is where a machine is open and where damp collects.
    It is deliberately on the side the body's own bead is not, so the two never
    fight for the same pixels.

    A moss_dark crust under the beads: at this size a cluster of same-value
    balls is one green smudge, and the crust is the value the beads read
    against."""
    at, yaw = BODIES[unit]["joint"], BODIES[unit]["joint_yaw"]
    spread = BODIES[unit]["joint_r"]
    nx, ny = math.cos(yaw), math.sin(yaw)
    _chip(s, "lichen_crust", at, yaw,
          (spread * 0.50, spread * 1.60, spread * 1.30), "moss_dark", body)
    for i, (dx, dy, dz, k) in enumerate(
            ((0.48, 0.00, 0.20, 1.00), (0.46, 0.50, -0.16, 0.66),
             (0.48, -0.42, 0.38, 0.58), (0.44, 0.16, -0.46, 0.50))):
        # dx runs out along the joint's normal, dy across it, dz up. Every bead
        # carries a big dx on purpose: a joint is a corner, not a plane, and the
        # two beads that were offset sideways on a small dx ended up inside the
        # hull on the Cyberblub and the SuperBlub.
        td.ball(s, "lichen_%d" % i, spread * k * 0.45,
                (at[0] + (dx * nx - dy * ny) * spread,
                 at[1] + (dx * ny + dy * nx) * spread,
                 at[2] + dz * spread), "lichen", body, 5, 3)


def mark_a2(s, body, unit):
    """a2 -- A BOLTED ENGRAVED STONE PLATE ON THE FLANK. Path B only.

    The same object `_inheritance()` bolts to the Summoner himself: a piece of
    the old circle, cut, and driven into the chassis with four chrome bolts. The
    crosspath version is bigger and it is on the FLANK, where the silhouette is
    flat and a rectangle of matte stone reads against chrome at any angle.

    The engraving is cut in the SAME STONE one value down, and sunk proud of the
    plate face -- a cut that is only a colour is a cut nobody renders.

    It used to be ochre here while the figure cut it in stone_dark, and the
    reason given was that it matched the figure. It did not. The figure is the
    one that follows the brief: voie B may never show a porous surface except
    its inherited stone, and ochre is a pigment, so filling the cuts with it put
    a porous paint job on a machine. The plate's exemption covers the stone
    itself, not something painted onto it. Stone and chrome and nothing else,
    and it does not get to glow."""
    b = BODIES[unit]
    yaw = b["plate_yaw"]
    w, tall, thick = b["plate_w"], b["plate_h"], b["plate_t"]
    nx, ny = math.cos(yaw), math.sin(yaw)
    tx, ty = -ny, nx                          # across the face
    # THE BITE. The seat is the flank's own surface; the plate is pulled a
    # fraction back INTO it so its back face cannot show a seam of daylight
    # against the hull. It is bolted on, not leaning on.
    bite = b["r"] * 0.02
    at = (b["plate"][0] - nx * bite, b["plate"][1] - ny * bite, b["plate"][2])

    _chip(s, "plate", at, yaw, (thick, w, tall), "stone", body)
    face = thick * 0.60
    for i, dz in enumerate((tall * 0.22, -tall * 0.22)):
        _chip(s, "engrave_%d" % i,
              (at[0] + nx * face, at[1] + ny * face, at[2] + dz), yaw,
              (thick * 0.5, w * 0.66, tall * 0.11), "stone_dark", body)
    _chip(s, "engrave_bar",
          (at[0] + nx * face, at[1] + ny * face, at[2]), yaw,
          (thick * 0.5, w * 0.13, tall * 0.52), "stone_dark", body)
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        off = math.cos(a) * w * 0.40
        _chip(s, "bolt_%d" % i,
              (at[0] + nx * face + tx * off, at[1] + ny * face + ty * off,
               at[2] + math.sin(a) * tall * 0.38), yaw,
              (thick * 0.55, w * 0.13, tall * 0.16), "chrome", body)


MARKS_A = [("b1", mark_b1), ("b2", mark_b2)]        # go on path A units
MARKS_B = [("a1", mark_a1), ("a2", mark_a2)]        # go on path B units


# ---------------------------------------------------------------------------
# THE SEATS. One row per unit, every number derived from the same radius the
# body uses. The comment on each row names the solid in tower_summoner.py the
# seat was measured against, so a body change has one place to be checked.
# ---------------------------------------------------------------------------

def _drop_seat(unit, height_k, face_k, mouth_dz, mouth_w, mouth_h, ring_k,
               kind="bar", scale=1.0):
    """A path A unit whose body is `drop()`. `face_k` and `mouth_dz` are the
    two numbers face() uses to put the mouth on it: z = h*face_k - r*mouth_dz.

    THE RING GOES UNDER THE FACE, and that is a rendered result, not a taste.
    A horizontal ring seen at the board's 34 degree pitch throws its front arc
    a long way DOWN the screen -- far enough that a ring at the waist lands
    within a pixel of the mouth and the two marks merge into one smear when a
    unit carries both. Below the belly they never touch."""
    r = R(UNIT_FOOTPRINT[unit]) * scale
    h = r * height_k
    z = h * face_k - r * mouth_dz
    return {
        "r": r, "h": h, "mouth_kind": kind, "mouth_z": z,
        "mouth_w": r * mouth_w, "mouth_h": r * mouth_h,
        "ring_z": h * ring_k, "ring_y": 0.0,
        "ring_r": _drop_radius(r, h, h * ring_k) * 0.99,
    }


def _gape_seat(unit, height_k, seam, side, side_yaw_deg, ring, w, tall, thick,
               maw=None, scale=1.0):
    """A path A unit built as two flared cups. `seam` is (y, z) on the axis and
    `side` is (x, y, z) at the mouth corner -- both MEASURED off the built body
    by ray probe, because the crossing of two tilted cones is not a number that
    can be read off the call that made them. `ring` is (y, z, radius): these
    animals are not bodies of revolution about the tower centre, so the band
    that fits them is centred on the mass it goes round, not on the origin."""
    r = R(UNIT_FOOTPRINT[unit]) * scale
    return {
        "r": r, "h": r * height_k,
        "mouth_kind": "maw" if maw else "seam",
        "maw_z": r * maw[0] if maw else 0.0,
        "maw_r": r * maw[1] if maw else 0.0,
        "seam": (r * seam[0], r * seam[1]),
        "side": (r * side[0], r * side[1], r * side[2]),
        "side_yaw": math.radians(side_yaw_deg),
        "seam_w": r * w, "seam_h": r * tall, "seam_t": r * thick,
        "ring_y": r * ring[0], "ring_z": r * ring[1], "ring_r": r * ring[2],
    }


def _machine_seat(unit, joint, joint_yaw, joint_r, plate, plate_yaw, plate_w,
                  plate_h, plate_t):
    """A path B unit. `joint` is a real seam on the machine and `plate` sits on
    a flat flank, both in r."""
    r = R(UNIT_FOOTPRINT[unit])
    return {
        "r": r,
        "joint": (joint[0] * r, joint[1] * r, joint[2] * r),
        "joint_yaw": joint_yaw, "joint_r": joint_r * r,
        "plate": (plate[0] * r, plate[1] * r, plate[2] * r),
        "plate_yaw": plate_yaw, "plate_w": plate_w * r,
        "plate_h": plate_h * r, "plate_t": plate_t * r,
    }


BODIES = {
    # --- path A ---------------------------------------------------------
    # drop(r*2.30) + face "happy": mouth ball at z = h*0.58 - r*0.34.
    "blub1": _drop_seat("blub1", 2.30, 0.58, 0.34, 0.20, 0.00, 0.28, "disc"),
    # drop(r*2.05) + face "brow": mouth box r*0.44 wide at h*0.58 - r*0.36.
    "blub2": _drop_seat("blub2", 2.05, 0.58, 0.36, 0.25, 0.09, 0.28),
    # drop(r*1.85) + face "serious": jaw box r*0.66 wide at h*0.60 - r*0.42.
    # This one is squat and its face sits low -- its mouth is at 0.37 h where
    # the Blub I's is at 0.44 h -- so its band goes lower again. At 0.24 h the
    # SIDES of the ring still crossed the ends of the lit mouth on screen, even
    # though the front of the ring cleared it by 4 px: a ring is highest on
    # screen at its sides and lowest at its front, and it is the sides that
    # have to clear.
    "blub3": _drop_seat("blub3", 1.85, 0.60, 0.42, 0.36, 0.12, 0.15),
    # _mini_body + face("one_eye"/"two_eye"): the dark bore is a frustum whose
    # top cap lands at 1.383 r (mini1) and 1.363 r (mini2). That cap IS the
    # mouth as the camera sees it, so it is what lights up. The collar sits at
    # 0.24 h, where the lower cup measures 0.74 .. 0.82 r all the way round.
    "mini1": _gape_seat("mini1", 1.55, (0.98, 0.78), (0.36, 0.92, 0.79), 60.0,
                        (0.0, 1.55 * 0.24, 0.86), 0.50, 0.20, 0.12,
                        (1.383, 0.52), 0.78),
    "mini2": _gape_seat("mini2", 1.55, (0.98, 0.78), (0.36, 0.92, 0.79), 60.0,
                        (0.0, 1.55 * 0.24, 0.86), 0.50, 0.20, 0.12,
                        (1.363, 0.50), 0.78),
    # unit_hungry: jaw_low (0.44 -> 1.06 r, tilted +0.30) against jaw_up (1.04
    # -> 0.40 r, tilted -0.46). Probed valley: y 1.00 r at z 0.62 r, falling to
    # 0.91 r by x 0.42 r -- the mouth line, and it renders as one.
    #
    # ITS BAND IS OFF-CENTRE, at y +0.10 r. The jaw overhangs everything below
    # it, so a band on the tower axis at any height that clears the legs sits
    # UNDER that overhang and the camera never sees it. Measured round y +0.10
    # instead, the surface holds 0.93 .. 0.96 r right across the front, and the
    # band sits on the animal's own girth rather than the tower's.
    "hungry": _gape_seat("hungry", 1.60, (1.00, 0.62), (0.42, 0.91, 0.62), 60.0,
                         (0.10, 0.55, 0.97), 0.50, 0.20, 0.10),

    # --- path B ---------------------------------------------------------
    # Every joint seat below is a PROBED point on the seam it names, 0.03 ..
    # 0.05 r inside the outer surface, so the crust beds in and only the beads
    # stand out. Seating them on the limb's AXIS -- which is what the body call
    # gives you -- buried the whole patch inside the leg on three of the four.
    #
    # cyber: the -X chrome graft breaks out through the gel near its top.
    # Plate on the +X flank, on the facet centred at +15 deg, where the belly
    # measures 0.97 r -- forward of the facet at -45 deg it started on, which
    # rendered as a plate nobody could see without orbiting behind the unit.
    # It is the one plate on a curved flank, so it is thicker than the rest or
    # the corners sink.
    "cyber": _machine_seat("cyber", (-0.82, -0.06, 0.96), math.pi, 0.19,
                           (0.910, 0.244, 0.377), math.radians(15.0),
                           0.42, 0.34, 0.14),
    # mecha: the hip, where the -X leg tube leaves the chassis underside.
    # Plate on the +X chassis flank, aft of the cannon root and above the
    # body's own lichen bead.
    "mecha": _machine_seat("mecha", (-0.66, 0.0, 0.16), math.pi, 0.20,
                           (0.60, -0.16, 0.68), 0.0, 0.44, 0.40, 0.09),
    # mecha2: the same hip on a hull twice as wide.  Plate on the +X flank,
    # aft of the cannon and clear under the unstable tank.
    "mecha2": _machine_seat("mecha2", (-0.90, 0.0, 0.13), math.pi, 0.23,
                            (0.81, -0.28, 0.42), 0.0, 0.44, 0.36, 0.10),
    # superb: the shoulder, where the -X arm runs out from under the pauldron.
    # Plate on the +X hull flank, under the arm and forward of the bead.
    "superb": _machine_seat("superb", (-0.83, 0.16, 0.99), math.pi, 0.25,
                            (0.58, 0.06, 0.56), 0.0, 0.48, 0.40, 0.10),
}


# ---------------------------------------------------------------------------

def build_mark(unit, tag, fn, flat):
    """Same two nodes as tower_summoner's build_unit, so a mark rides exactly
    what the body rides. Nothing here is world_fixed: a mark is ON the creature
    and turns with it."""
    s = td.Scene(palette(flat))
    root = s.node("root")
    body = s.node("body", parent=root)
    fn(s, body, unit)
    return td.build(s, "blub-mark-%s-%s" % (tag, unit))


def _extent(model):
    pos = model["positions"]
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for i in range(0, len(pos), 3):
        for k in range(3):
            lo[k] = min(lo[k], pos[i + k])
            hi[k] = max(hi[k], pos[i + k])
    return lo, hi


BUDGET = 120                                # a mark is a detail, not a body


def main():
    flat = "--silhouette" in sys.argv
    print("building the blub crosspath marks (%s)"
          % ("SILHOUETTE" if flat else "full"))
    total = 0
    worst = 0
    for units, marks in ((PATH_A, MARKS_A), (PATH_B, MARKS_B)):
        for unit in units:
            for tag, fn in marks:
                model = build_mark(unit, tag, fn, flat)
                td.write_js(model, "blub-mark-%s-%s.js" % (tag, unit))
                lo, hi = _extent(model)
                total += model["triangles"]
                worst = max(worst, model["triangles"])
                flag = "  OVER BUDGET" if model["triangles"] > BUDGET else ""
                print("  blub-mark-%-2s-%-6s %4d tris   box %5.3f x %5.3f x "
                      "%5.3f   at %6.3f %6.3f %6.3f%s"
                      % (tag, unit, model["triangles"], hi[0] - lo[0],
                         hi[1] - lo[1], hi[2] - lo[2],
                         (lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5,
                         (lo[2] + hi[2]) * 0.5, flag))
    print("  %d marks, %d triangles total, worst %d (budget %d)"
          % (len(PATH_A) * 2 + len(PATH_B) * 2, total, worst, BUDGET))
    print("  MARK SEATS -- a mark is drawn OVER an untouched body:")
    print("    %-7s %7s %7s  %s" % ("unit", "radius", "px", "seat"))
    for unit in PATH_A:
        b = BODIES[unit]
        kind = b["mouth_kind"]
        if kind == "seam":
            where = "seam y %.3f z %.3f" % (b["seam"][0], b["seam"][1])
        elif kind == "maw":
            where = "bore z %.3f r %.3f " % (b["maw_z"], b["maw_r"])
        else:
            where = "%-4s      z %.3f" % (kind, b["mouth_z"])
        seat = "mouth %-20s | ring y %.2f z %.3f r %.3f" % (
            where, b["ring_y"], b["ring_z"], b["ring_r"])
        print("    %-7s %7.3f %7.1f  %s"
              % (unit, b["r"], b["r"] * PX_PER_UNIT, seat))
    for unit in PATH_B:
        b = BODIES[unit]
        print("    %-7s %7.3f %7.1f  joint %6.3f %6.3f %6.3f  |  plate "
              "%6.3f %6.3f %6.3f"
              % (unit, b["r"], b["r"] * PX_PER_UNIT,
                 b["joint"][0], b["joint"][1], b["joint"][2],
                 b["plate"][0], b["plate"][1], b["plate"][2]))


if __name__ == "__main__":
    main()
