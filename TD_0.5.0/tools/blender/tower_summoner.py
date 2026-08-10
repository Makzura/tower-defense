# ---------------------------------------------------------------------------
# The Summoner (tower_blub), its ten blubs and the five tiers of the fused
# creature. See the owner's brief; the mechanics are already in js/blub.js and
# nothing here changes them.
#
#   python tools/blender/tower_summoner.py                 build everything
#   python tools/blender/tower_summoner.py --silhouette    build PASS 1 forms
#
# PASS 1 vs PASS 2. The brief (section 18) requires silhouettes to be judged
# before colour. Rather than author the forms twice, every solid is given its
# real material name from the start and `--silhouette` swaps the whole palette
# for one flat grey. So pass 1 reviews shape alone, pass 2 is a palette change
# and not a rebuild, and the two passes cannot drift apart.
#
# THE SCALE CONTRACT. td_mesh emits 31.8032 px per Blender unit, and the board
# runs at ~1 px per u.l., so a unit's `footprintUl` from js/blub.js IS its
# ground radius in px. Every radius below is derived from that table by R(),
# never typed in twice -- the brief's section 7 radii and the simulation's
# footprints are the same numbers and must stay that way.
#
# THE GAG THE WHOLE B PATH RESTS ON: the bigger the machine, the smaller and
# more frightened the blub inside it. FACE_SCALE encodes exactly that, and it
# only ever goes down.
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
# Voie A: mate, poreuse, vert mousse / pierre grise / craie-ocre, emission
# FAIBLE et CHAUDE. Voie B: lisse, chrome et bleu profond translucide, accent
# cyan, emission FORTE et FROIDE. A never emits cold light; B never shows a
# porous surface except on its inherited stone (brief section 3 and 4).
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


# ---------------------------------------------------------------------------
# Shared blub anatomy.
#
# A blub is a GELATINOUS DROP: wide and heavy at the base, narrowing to a
# rounded top, never a sphere. `drop` is that body and every unit on path A is
# a variation of it, which is what makes them read as one family at a glance.
# ---------------------------------------------------------------------------

def drop(s, name, cx, cy, r, height, mat, parent, squash=1.0, segs=12):
    """The body. `squash` is the live HP deflation hook -- 1.0 is full and
    taut, lower is slumped and wider, which the runtime drives per instance."""
    h = height * squash
    wide = r * (1.0 + (1.0 - squash) * 0.35)
    # Four stacked frusta rather than a ball: a NARROW foot, a heavy low belly,
    # a shoulder and a domed top. Revue 1 failed on this shape -- at 0.86r the
    # foot was as wide as the belly and every small unit read as a pebble
    # instead of a drop, which is what made mini1, mini2 and blub1
    # interchangeable. The waist is what makes it gelatinous.
    td.frustum(s, name + "_foot", wide * 0.62, wide * 0.94, h * 0.18,
               (cx, cy, h * 0.09), mat, parent, segs)
    td.frustum(s, name + "_belly", wide * 0.94, wide, h * 0.26,
               (cx, cy, h * 0.31), mat, parent, segs)
    td.frustum(s, name + "_waist", wide, wide * 0.74, h * 0.30,
               (cx, cy, h * 0.59), mat, parent, segs)
    td.frustum(s, name + "_dome", wide * 0.74, wide * 0.14, h * 0.26,
               (cx, cy, h * 0.87), mat, parent, segs)
    return h


def face(s, cx, cy, z, r, parent, kind, flat, scale=1.0):
    """Every blub has a face, and it is the unit's whole personality. `scale`
    is the B-path gag: the machine grows and the face inside it shrinks."""
    e = r * 0.20 * scale
    fy = cy + r * 0.80                      # on the front of the body
    if kind == "happy":                     # Blub I: deux points, bouche ronde
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.55, (cx + sx * r * 0.34, fy, z), "eye", parent, 8, 5)
        td.ball(s, "mouth", e * 0.85, (cx, fy * 0.99, z - r * 0.34), "dark", parent, 8, 5)
    elif kind == "brow":                    # Blub II: sourcils, il se croit costaud
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.55, (cx + sx * r * 0.34, fy, z), "eye", parent, 8, 5)
            td.box(s, "brow", (r * 0.34, e * 0.3, e * 0.34),
                   (cx + sx * r * 0.34, fy, z + e * 0.75), (0, 0, sx * 0.30),
                   "dark", parent)
        td.box(s, "mouth", (r * 0.44, e * 0.3, e * 0.30), (cx, fy, z - r * 0.36),
               (0, 0, 0), "dark", parent)
    elif kind == "serious":                 # Blub III: yeux fendus, machoire
        for sx in (-1, 1):
            td.box(s, "eye", (r * 0.30, e * 0.3, e * 0.34),
                   (cx + sx * r * 0.32, fy, z), (0, 0, sx * 0.22), "eye", parent)
        td.box(s, "jaw", (r * 0.66, e * 0.4, e * 0.44), (cx, fy * 0.98, z - r * 0.42),
               (0, 0, 0), "dark", parent)
    elif kind == "one_eye":                 # Mini I: un oeil, presque que la bouche
        td.ball(s, "eye", e * 1.5, (cx, fy, z + r * 0.30), "eye", parent, 8, 5)
        td.frustum(s, "maw", r * 0.72, r * 0.52, r * 0.50, (cx, cy + r * 0.20, z - r * 0.20),
                   "dark", parent, 10)
    elif kind == "two_eye":                 # Mini II: deux yeux, toujours frenetique
        for sx in (-1, 1):
            td.ball(s, "eye", e * 1.0, (cx + sx * r * 0.30, fy, z + r * 0.28), "eye", parent, 8, 5)
        td.frustum(s, "maw", r * 0.70, r * 0.50, r * 0.46, (cx, cy + r * 0.20, z - r * 0.20),
                   "dark", parent, 10)
    elif kind == "teeth":                   # Hungry: yeux minuscules, dents partout
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.34, (cx + sx * r * 0.26, fy, z + r * 0.44), "eye", parent, 6, 4)
    elif kind == "visor_up":                # Cyberblub: visage entier, visiere relevee
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.55, (cx + sx * r * 0.28, fy, z), "eye", parent, 8, 5)
        td.box(s, "mouth", (r * 0.40, e * 0.3, e * 0.26), (cx, fy, z - r * 0.30),
               (0, 0, 0), "dark", parent)
    elif kind == "visor_down":              # Mechablub: visiere baissee, yeux derriere
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.42, (cx + sx * r * 0.20, fy, z), "eye", parent, 6, 4)
    elif kind == "slit":                    # MK2: une simple fente lumineuse
        td.box(s, "slit", (r * 0.50, e * 0.24, e * 0.22), (cx, fy, z),
               (0, 0, 0), "cyan" if not flat else "cyan", parent)
    elif kind == "tiny_scared":             # SuperBlub: un tout petit visage inquiet
        for sx in (-1, 1):
            td.ball(s, "eye", e * 0.34, (cx + sx * r * 0.13, fy, z + e * 0.2), "eye", parent, 6, 4)
        td.ball(s, "mouth", e * 0.26, (cx, fy, z - e * 0.5), "dark", parent, 6, 4)


def teeth_ring(s, cx, cy, z, r, parent, count, size):
    for i in range(count):
        a = math.pi * (0.15 + 0.70 * i / max(1, count - 1))
        td.box(s, "tooth", (size, size, size * 2.2),
               (cx + math.cos(a) * r * 0.78, cy + math.sin(a) * r * 0.78, z),
               (0, 0, a), "tooth", parent)


# ---------------------------------------------------------------------------
# The ten units. Radii come straight from js/blub.js UNITS[].footprintUl.
# ---------------------------------------------------------------------------

FACE_SCALE = {                 # the gag, and it only goes down
    "cyber": 1.00, "mecha": 0.62, "mecha2": 0.38, "superb": 0.20
}


def unit_blub1(s, body, flat):
    # A tall, utterly smooth drop and NOTHING else. Its lack of appendages is
    # its silhouette, so it only works if the body is tall enough to be a shape.
    r = R(10); h = drop(s, "b", 0, 0, r, r * 2.30, "moss", body)
    face(s, 0, 0, h * 0.58, r, body, "happy", flat)


def unit_blub2(s, body, flat):
    r = R(13); h = drop(s, "b", 0, 0, r, r * 2.05, "moss", body)
    face(s, 0, 0, h * 0.58, r, body, "brow", flat)
    # une croute de pierre sur le dos
    td.frustum(s, "crust", r * 0.72, r * 0.44, h * 0.42, (0, -r * 0.34, h * 0.70),
               "stone", body, 8, (0.42, 0, 0))


def unit_blub3(s, body, flat):
    r = R(20); h = drop(s, "b", 0, 0, r, r * 1.85, "moss", body)
    face(s, 0, 0, h * 0.60, r, body, "serious", flat)
    # plaques de pierre aux epaules
    for sx in (-1, 1):
        td.box(s, "pauldron", (r * 0.62, r * 0.70, r * 0.36),
               (sx * r * 0.74, -r * 0.06, h * 0.74), (0, sx * -0.38, 0), "stone", body)
        td.box(s, "pauldron_lip", (r * 0.54, r * 0.60, r * 0.12),
               (sx * r * 0.80, -r * 0.06, h * 0.90), (0, sx * -0.38, 0), "stone_dark", body)


def _mini_body(s, body, r):
    """PRESQUE ENTIEREMENT BOUCHE (section 7). Revue 1 failed because these were
    drops with a mouth drawn on; the mouth has to BE the silhouette. So: a wide
    gaping maw taking most of the height, a stub of body behind it, and short
    legs -- a profile no full-size blub can be confused with."""
    h = r * 1.55
    # the stub of a body, tucked low and behind
    td.frustum(s, "stub", r * 0.46, r * 0.34, h * 0.34, (0, -r * 0.36, h * 0.20),
               "moss_dark", body, 8)
    # the maw: two flared cups facing forward, held open
    td.frustum(s, "maw_low", r * 0.52, r * 1.02, h * 0.34, (0, r * 0.12, h * 0.24),
               "moss", body, 10, (0.22, 0, 0))
    td.frustum(s, "maw_up", r * 1.00, r * 0.56, h * 0.34, (0, r * 0.20, h * 0.72),
               "moss", body, 10, (-0.26, 0, 0))
    # THE THROAT, and it is not decoration. The two jaw halves flare apart, so
    # without something closing the gap between them you look straight THROUGH
    # the unit into the board behind it -- the owner's report was that the minis
    # and the Hungry Blub "are unreadable because they're open from behind".
    # An open mouth with no throat is a hole, not a mouth. Dark, so the teeth in
    # front of it read as teeth.
    td.ellipsoid(s, "throat", (r * 1.32, r * 1.10, h * 0.62), (0, r * 0.02, h * 0.50),
                 "dark", body, (0, 0, 0), 10, 6)
    teeth_ring(s, 0, r * 0.06, h * 0.44, r, body, 6, r * 0.13)
    teeth_ring(s, 0, r * 0.10, h * 0.62, r, body, 6, r * 0.12)
    for sx in (-1, 1):
        td.tube(s, "leg", r * 0.10, (sx * r * 0.34, -r * 0.20, h * 0.22),
                (sx * r * 0.44, -r * 0.24, 0), "moss_dark", body, 6)
    return h


def unit_mini1(s, body, flat):
    r = R(10) * 0.78
    h = _mini_body(s, body, r)
    face(s, 0, 0, h * 0.86, r, body, "one_eye", flat)


def unit_mini2(s, body, flat):
    r = R(10) * 0.78
    h = _mini_body(s, body, r)
    face(s, 0, 0, h * 0.86, r, body, "two_eye", flat)
    # Un caillou posé sur la tête -- an angular block set askew, so it survives
    # as a notch in the profile rather than melting into a round head.
    td.box(s, "pebble", (r * 0.62, r * 0.52, r * 0.40), (0, -r * 0.14, h * 1.02),
           (0.22, 0, 0.5), "stone", body)


def unit_hungry(s, body, flat):
    # Une machoire sur pattes, corps reduit. The jaw IS the silhouette.
    # Revue 1 failed here: two stacked frusta of near-equal radius read as one
    # mass, not as a jaw. The gape has to be wide and the body has to be a
    # REMNANT behind it -- the brief's words are "une machoire sur pattes, corps
    # reduit", and the proportion was the wrong way round.
    r = R(25)
    # what is left of the body: a small sac slung behind the jaw
    td.frustum(s, "gut", r * 0.40, r * 0.54, r * 0.52, (0, -r * 0.52, r * 0.46),
               "moss", body, 10)
    # LOWER jaw, dropped and flared forward
    td.frustum(s, "jaw_low", r * 0.44, r * 1.06, r * 0.52, (0, r * 0.22, r * 0.30),
               "moss_dark", body, 12, (0.30, 0, 0))
    # UPPER jaw, hinged well open -- the gape is the silhouette
    td.frustum(s, "jaw_up", r * 1.04, r * 0.40, r * 0.54, (0, r * 0.30, r * 1.06),
               "moss", body, 12, (-0.46, 0, 0))
    # THE GULLET. Same reason as the minis: a gape this wide with nothing behind
    # it is a hole through the model, and at 50 px across it was the single most
    # unreadable thing on the board. Closing it also gives the two teeth rings
    # something dark to bite against, which is what makes them read as teeth
    # rather than as white specks.
    td.ellipsoid(s, "gullet", (r * 1.44, r * 1.16, r * 0.92), (0, r * 0.06, r * 0.72),
                 "dark", body, (0, 0, 0), 12, 7)
    teeth_ring(s, 0, r * 0.14, r * 0.56, r, body, 8, r * 0.13)
    teeth_ring(s, 0, r * 0.20, r * 0.94, r, body, 8, r * 0.12)
    face(s, 0, -r * 0.30, r * 1.14, r * 0.62, body, "teeth", flat)
    # pattes, longues, sous la gueule
    for sx in (-1, 1):
        for fy in (-0.42, 0.30):
            td.tube(s, "leg", r * 0.10, (sx * r * 0.52, r * fy, r * 0.40),
                    (sx * r * 0.78, r * fy, 0), "moss_dark", body, 6)


def unit_cyber(s, body, flat):
    # Blub avec des greffes: still a blub, already wired.
    r = R(25); h = drop(s, "b", 0, 0, r, r * 1.45, "blue_gel", body)
    face(s, 0, 0, h * 0.60, r, body, "visor_up", flat, FACE_SCALE["cyber"])
    td.box(s, "visor", (r * 0.86, r * 0.30, r * 0.16), (0, r * 0.60, h * 0.80),
           (0.42, 0, 0), "chrome", body)
    for sx in (-1, 1):
        td.box(s, "graft", (r * 0.30, r * 0.44, r * 0.50),
               (sx * r * 0.72, -r * 0.10, h * 0.52), (0, 0, 0), "chrome_dk", body)
        td.tube(s, "vein", r * 0.055, (sx * r * 0.60, -r * 0.10, h * 0.30),
                (sx * r * 0.24, r * 0.30, h * 0.74), "cyan", body, 5)
    # heritage obligatoire de la voie B (section 4): pierre gravee + lichen
    td.box(s, "heritage_stone", (r * 0.44, r * 0.16, r * 0.32),
           (-r * 0.52, r * 0.36, h * 0.30), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.16, (r * 0.50, r * 0.30, h * 0.22),
            "lichen", body, 6, 4)


def unit_mecha(s, body, flat):
    # Chassis + deux canons de bras. The creature becomes a weapon here.
    r = R(30)
    td.box(s, "chassis", (r * 1.10, r * 0.96, r * 0.86), (0, 0, r * 0.62),
           (0, 0, 0), "chrome_dk", body)
    td.box(s, "chest", (r * 0.80, r * 0.30, r * 0.52), (0, r * 0.54, r * 0.72),
           (0, 0, 0), "steel_bru", body)
    # the blub inside, already smaller
    td.frustum(s, "pilot", r * 0.34, r * 0.24, r * 0.34, (0, r * 0.20, r * 1.20),
               "blue_gel", body, 10)
    face(s, 0, 0, r * 1.22, r * 0.34, body, "visor_down", flat, FACE_SCALE["mecha"])
    td.box(s, "visor", (r * 0.42, r * 0.16, r * 0.12), (0, r * 0.44, r * 1.24),
           (0, 0, 0), "chrome", body)
    for sx in (-1, 1):
        td.tube(s, "cannon", r * 0.17, (sx * r * 0.62, r * 0.10, r * 0.72),
                (sx * r * 0.66, r * 1.10, r * 0.68), "chrome", body, 8)
        td.torus(s, "muzzle", r * 0.19, r * 0.05,
                 (sx * r * 0.66, r * 1.08, r * 0.68), (math.pi / 2, 0, 0),
                 "cyan_dim", body, 8, 5)
        td.tube(s, "leg", r * 0.15, (sx * r * 0.42, 0, r * 0.24),
                (sx * r * 0.66, 0, 0), "chrome_dk", body, 6)
    td.box(s, "heritage_stone", (r * 0.40, r * 0.14, r * 0.30),
           (-r * 0.60, -r * 0.30, r * 0.70), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.13, (r * 0.58, -r * 0.34, r * 0.34),
            "lichen", body, 6, 4)


def unit_mecha2(s, body, flat):
    # Blinde, reservoirs instables apparents. It reads as about to go off.
    # Revue 1: mecha and mecha2 shared one compact two-cannon profile and only
    # size told them apart, which is not a silhouette. So MK2 goes WIDE and
    # SQUAT where the Mechablub is upright, and its tanks break the outline
    # instead of sitting inside it -- they are supposed to read as unstable and
    # exposed, which means they have to be visible in pure shadow.
    r = R(40)
    td.box(s, "hull", (r * 1.52, r * 1.00, r * 0.66), (0, 0, r * 0.50),
           (0, 0, 0), "chrome_dk", body)
    td.box(s, "armour_f", (r * 1.34, r * 0.26, r * 0.54), (0, r * 0.56, r * 0.54),
           (0, 0, 0), "steel_bru", body)
    for sx in (-1, 1):
        # les reservoirs instables: portes HAUT, en dehors du profil du chassis
        td.frustum(s, "tank", r * 0.30, r * 0.30, r * 0.72,
                   (sx * r * 0.92, -r * 0.30, r * 1.10), "chrome", body, 8,
                   (0, sx * 0.26, 0))
        td.torus(s, "tank_band", r * 0.33, r * 0.06,
                 (sx * r * 0.92, -r * 0.30, r * 1.16), (0, 0, 0), "cyan", body, 10, 5)
        td.tube(s, "tank_pipe", r * 0.07, (sx * r * 0.86, -r * 0.30, r * 0.78),
                (sx * r * 0.40, -r * 0.10, r * 0.62), "chrome_dk", body, 6)
        td.tube(s, "cannon", r * 0.22, (sx * r * 0.74, r * 0.16, r * 0.56),
                (sx * r * 0.78, r * 1.16, r * 0.52), "chrome", body, 8)
        td.tube(s, "leg", r * 0.18, (sx * r * 0.56, 0, r * 0.18),
                (sx * r * 0.86, 0, 0), "chrome_dk", body, 6)
    # the pilot is now a slit in a hatch
    td.box(s, "hatch", (r * 0.44, r * 0.14, r * 0.30), (0, r * 0.66, r * 0.92),
           (0, 0, 0), "chrome", body)
    face(s, 0, 0, r * 0.92, r * 0.30, body, "slit", flat, FACE_SCALE["mecha2"])
    td.box(s, "heritage_stone", (r * 0.38, r * 0.13, r * 0.28),
           (-r * 0.64, -r * 0.10, r * 0.72), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.12, (r * 0.62, -r * 0.16, r * 0.30),
            "lichen", body, 6, 4)


def unit_superb(s, body, flat):
    # Colosse, laser d'epaule, et un bebe blub terrifie dans un hublot.
    r = R(50)
    td.box(s, "hull", (r * 1.06, r * 0.92, r * 1.10), (0, 0, r * 0.74),
           (0, 0, 0), "chrome_dk", body)
    td.frustum(s, "core", r * 0.52, r * 0.44, r * 0.50, (0, 0, r * 1.46),
               "steel_bru", body, 10)
    for sx in (-1, 1):
        td.box(s, "pauldron", (r * 0.44, r * 0.72, r * 0.50),
               (sx * r * 0.72, 0, r * 1.24), (0, sx * -0.22, 0), "chrome", body)
        td.tube(s, "arm", r * 0.20, (sx * r * 0.66, r * 0.08, r * 1.02),
                (sx * r * 0.72, r * 0.86, r * 0.66), "chrome_dk", body, 8)
        td.tube(s, "leg", r * 0.22, (sx * r * 0.40, 0, r * 0.30),
                (sx * r * 0.60, 0, 0), "chrome_dk", body, 8)
    # le laser d'epaule, sur une seule epaule pour rester lisible
    td.tube(s, "laser", r * 0.13, (r * 0.72, -r * 0.10, r * 1.52),
            (r * 0.72, r * 0.96, r * 1.46), "chrome", body, 8)
    td.ball(s, "laser_lens", r * 0.15, (r * 0.72, r * 0.98, r * 1.46),
            "white_hot", body, 8, 5)
    # LE HUBLOT: the whole joke. A tiny frightened blub behind glass.
    td.torus(s, "port_ring", r * 0.26, r * 0.06, (0, r * 0.50, r * 1.02),
             (math.pi / 2, 0, 0), "chrome", body, 12, 5)
    td.frustum(s, "port_glass", r * 0.22, r * 0.22, r * 0.06,
               (0, r * 0.50, r * 1.02), "cyan_dim", body, 10, (math.pi / 2, 0, 0))
    td.ball(s, "pilot", r * 0.15, (0, r * 0.44, r * 1.00), "blue_gel", body, 8, 5)
    face(s, 0, r * -0.06, r * 1.02, r * 0.15, body, "tiny_scared", flat,
         FACE_SCALE["superb"])
    td.box(s, "heritage_stone", (r * 0.34, r * 0.12, r * 0.26),
           (-r * 0.66, -r * 0.30, r * 0.86), (0, 0, 0), "stone", body)
    td.ball(s, "heritage_lichen", r * 0.11, (r * 0.60, -r * 0.36, r * 0.40),
            "lichen", body, 6, 4)


UNITS = [
    ("blub1", unit_blub1), ("blub2", unit_blub2), ("blub3", unit_blub3),
    ("mini1", unit_mini1), ("mini2", unit_mini2), ("hungry", unit_hungry),
    ("cyber", unit_cyber), ("mecha", unit_mecha), ("mecha2", unit_mecha2),
    ("superb", unit_superb),
]


def build_unit(unit_id, fn, flat):
    s = td.Scene(palette(flat))
    root = s.node("root")
    body = s.node("body", parent=root)
    fn(s, body, flat)
    return td.build(s, "blub-" + unit_id)


def main():
    flat = "--silhouette" in sys.argv
    tag = "SILHOUETTE" if flat else "full"
    print("building blub units (%s)" % tag)
    total = 0
    for unit_id, fn in UNITS:
        model = build_unit(unit_id, fn, flat)
        td.write_js(model, "blub-%s.js" % unit_id)
        total += model["triangles"]
        print("  blub-%-7s %5d tris   ground radius %5.1f px"
              % (unit_id, model["triangles"], R_of(unit_id) * PX_PER_UNIT))
    print("  %d units, %d triangles total" % (len(UNITS), total))


UNIT_FOOTPRINT = {
    "blub1": 10, "blub2": 13, "blub3": 20, "mini1": 10, "mini2": 10,
    "hungry": 25, "cyber": 25, "mecha": 30, "mecha2": 40, "superb": 50,
}


def R_of(unit_id):
    return R(UNIT_FOOTPRINT[unit_id])


if __name__ == "__main__":
    main()
