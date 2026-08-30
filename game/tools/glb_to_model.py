# ---------------------------------------------------------------------------
# An imported .glb -> a plain .js file the game can load from file://.
#
#     python3 tools/glb_to_model.py ../glb/flying.glb --name enemy-flying
#     python3 tools/glb_to_model.py ../glb/flying.glb --stats
#
# The .glb sources live in `glb/` beside the game folder, not in the repo's own
# tree: they are the INPUTS to this tool, and js/gl/models/*.js is the output
# the game actually loads. Nothing at runtime reads a .glb.
#
# WHY THIS EXISTS BESIDE export_mesh.py. Every model in js/gl/models/ so far was
# BUILT in tools/blender/*.py and exported from Blender, and that remains the
# right pipeline for anything this project authors: the build script is the
# source of truth and the exporter is a second output of it. This tool is for
# the other case -- geometry that arrives finished, from outside, as a file.
# It writes the SAME format, so nothing downstream can tell the difference:
# GLModels.register, flat-shaded, per-triangle normals and colours, positions
# per vertex, rigid groups posed by a 4x4 each.
#
# NO DEPENDENCIES, AND NO BLENDER. A .glb is a JSON header and a binary blob;
# reading it is a hundred lines of struct.unpack, and needing Blender installed
# to re-run an import would put this behind exactly the door export_mesh.py is
# already behind. `python3 tools/glb_to_model.py` is the whole instruction.
#
# WHAT AN IMPORTED FILE DOES NOT BRING WITH IT, and what this tool therefore
# has to supply:
#
#   * AN AXIS CONVENTION. glTF is Y-up and this game is Z-up with FORWARD = +X
#     (gl-world.js says so, and anchorWorld proves it). The remap is a proper
#     rotation -- determinant +1 -- because a mirror would invert every winding
#     and GLRenderer culls back faces, which does not draw a slightly wrong
#     picture, it shows you the inside of the far wall.
#   * A SCALE AND A GROUND CONTACT. Models are authored so one Blender unit is
#     `unitsToPx` pixels and z = 0 is where the thing meets the road.
#   * A RIG. Exported .glb hierarchies routinely bake every transform into the
#     vertices and leave the nodes at identity -- this one does -- so the named
#     hierarchy is the only rig information that survives. Groups are read off
#     it and each group's PIVOT is derived from its own geometry, so nothing
#     here is an eyeballed constant.
#   * A TRIANGLE BUDGET. Imported meshes are tessellated for a render, not for
#     forty of them on a tower-defense board. See `cluster` below.
#
# THREE RIGS, AND THE RIG IS WHAT MAKES THIS TOOL GENERAL. Everything above is
# true of any import; what is NOT shared is how a hierarchy divides into groups,
# where each group turns, and what the resulting cycle should do. Those three
# always come as a set -- a wing hinge is only meaningful to a wingbeat -- so
# they are declared as one entry in `RIGS` rather than as three flags that could
# be mixed into a body no creature has. `--rig firefly` is the Wisp import this
# tool was written for and stays the default so re-running it is byte-identical;
# `--rig humanoid` is a two-legged walker; `--rig quadruped` runs on all four.
#
#   python3 tools/glb_to_model.py ../glb/revenant.glb \
#       --rig humanoid --name enemy-revenant --height 1.19
#
#   python3 tools/glb_to_model.py ../glb/fast.glb \
#       --rig quadruped --name enemy-fast --length 1.15 --glow sum \
#       --frames 16 --cell 0.05 --floor 40
#
# THE BULWARK IS TWO FILES AND ONE MACHINE, and its pair of lines is the only
# place in this header where the SECOND command depends on the first's output:
#
#   python3 tools/glb_to_model.py ../glb/bulwark_shield.glb \
#       --rig bulwark --name enemy-shielded --glow sum --frames 16 \
#       --exclude Integrated_Kinetic_Field
#
#   python3 tools/glb_to_model.py ../glb/bulwark_no_shield.glb \
#       --rig bulwark_overdrive --name enemy-shielded-broken --glow sum \
#       --frames 16 --height 1.354 --span 3.0771
#
# `--span 3.0771` IS THE FIRST FILE'S MEASURED SPAN, printed by the first
# command, and it is what makes the two the same size rather than merely the
# same height -- see the `bulwark_overdrive` rig entry. Re-run them as a pair.
#
# THE VANGUARD IS TWO FILES AND ONE MACHINE TOO, and its pair reads the same
# way -- the second command carries the first's measured span:
#
#   python3 tools/glb_to_model.py ../glb/vanguard.glb \
#       --rig vanguard --name enemy-boss_fast --glow sum --emit-cap 1.6 \
#       --frames 16 --cell 0.09 --floor 120 \
#       --exclude bulwark_pane_0 --exclude bulwark_pane_1 \
#       --exclude bulwark_pane_2 --exclude bulwark_pane_3 \
#       --exclude bulwark_pane_4 --exclude bulwark_pane_5 \
#       --exclude bulwark_pane_6 --exclude bulwark_pane_7
#
#   python3 tools/glb_to_model.py ../glb/vanguard-shattered.glb \
#       --rig vanguard --name enemy-boss_fast-shattered --glow sum \
#       --emit-cap 1.6 --frames 16 --cell 0.09 --floor 120 \
#       --height 1.298 --span 4.3500 \
#       --exclude field_remnant \
#       --exclude reforming_pane_0 --exclude reforming_pane_3 \
#       --exclude reforming_pane_6 \
#       --exclude regen_stream_0 --exclude regen_stream_1 \
#       --exclude regen_stream_2 --exclude regen_stream_3 \
#       --exclude regen_stream_4 --exclude regen_stream_5 \
#       --exclude regen_mote_0 --exclude regen_mote_1 --exclude regen_mote_2 \
#       --exclude regen_mote_3 --exclude regen_mote_4 --exclude regen_mote_5
#
# `--span 4.3500` IS THE FIRST FILE'S MEASURED SPAN, exactly as the Bulwark's
# is: the two files are 4.3500 and 4.3700 source units tall, so fitting each to
# 1.298 would make the shattered body 0.5% larger and the Vanguard would grow at
# the instant its shield popped. Re-run them as a pair.
#
# `--cell 0.09 --floor 120` IS A REAL DECIMATION AND THE DEFAULTS ARE NOT. These
# two files arrive at 20 096 and 22 012 triangles, three times the heaviest body
# the game ships; at the default `--cell 0.018 --floor 300` NOTHING is touched,
# because every part here is a lathed primitive under 300 triangles and the
# floor exempts it. The floor at 120 lets the ring, the ankle balls and the
# pauldrons through -- which is precisely where the count is -- and the cell is
# in SOURCE units on a body 4.35 of them tall, so 0.09 is the same proportion of
# it that 0.018 is of a 1.19 zombie. Both land near 5 000, which is the Tyrant's
# 4 568 and the budget a boss is worth.
#
# `--emit-cap 1.6` ON BOTH, AND IT IS A NO-OP ON THE FIRST ONE BY DESIGN. The
# shattered file carries `regen_flow` at 2.6 and `core_overload` at 2.4, which
# is a route to white and not to bright (see `material_entry`): those are the
# chest cracks and the reactor, the two things a reader looks at on a broken
# machine. 1.6 is where the shipped imports already live -- the Wisp's lantern
# and the Healer's core are both 1.6. The intact file's hottest material is
# `core_cyan` at 1.5 and the flag changes nothing on it; it is passed anyway so
# the two commands cannot drift, and so a hotter material added to that file
# later lands inside the same ceiling rather than outside it.
#
# UNLIKE THE BULWARK'S PAIR, BOTH VANGUARD FILES USE THE SAME RIG. The Bulwark
# needed two because its two bodies MOVE differently -- a jog before the shield
# goes, a bound after. The Vanguard's two states are not before-and-after a
# swap: it dashes for the first 400 u.l. and SKATES for the rest of the road,
# and it does both whether or not its shield is up. So the pair of gaits lives
# in the MODEL, as two bands, and both files carry both. See `VANGUARD_DASH`.
#
# `--exclude Integrated_Kinetic_Field` DROPS A TRANSLUCENT PART BECAUSE THIS
# FORMAT HAS NO TRANSLUCENCY. That node is the shield's own energy plane: a
# 100-triangle slab filling the halo, authored at baseColor alpha 0.075, spanning
# the whole body in x and z and cutting straight through the torso in y. A
# palette row here is `[r, g, b, emission]` and there is no fourth channel for
# an alpha to land in (see `material_entry`), so imported it ships OPAQUE -- a
# navy disc bisecting the machine from the side and hiding it from the front.
# Nothing is lost by dropping it: gl-world.js already draws a real translucent
# shell around any body whose shield still holds, sized off this mesh's own
# extent, so the field the artist authored is drawn by the renderer that can
# actually blend it, and the mesh keeps the twenty ring segments that say
# WHICH shield it is.
#
# THE THREE v0.5.1 BODIES, IMPORTED 2026-08-28, AND TWO OF THEM RIDE ON WHEELS:
#
#   python3 tools/glb_to_model.py ../glb/speaker-herald.glb \
#       --rig cart --name enemy-herald --glow sum --emit-cap 1.6 \
#       --frames 16 --wheel-facets 6 --cell 0.07 --floor 120 \
#       --exclude wave_rings
#
#   python3 tools/glb_to_model.py ../glb/sapper.glb \
#       --rig cart --name enemy-sapper --glow sum --emit-cap 1.6 \
#       --frames 16 --wheel-facets 4 --height 0.930 --cell 0.055 --floor 120
#
#   python3 tools/glb_to_model.py ../glb/dinomech.glb \
#       --rig saurian --name enemy-dinomech --glow sum --emit-cap 1.6 \
#       --frames 16 --cell 0.24 --floor 120
#
# AND THE TWO 2026-08-28 IMPORTS -- one body and one thing that is not a body:
#
#   python3 tools/glb_to_model.py ../glb/volatile.glb \
#       --rig volatile --name enemy-volatile --glow sum --emit-cap 1.6 \
#       --frames 16 --cell 0.02 --floor 120
#
#   python3 tools/glb_to_model.py ../glb/missile.glb \
#       --rig missile --name missile --glow sum --emit-cap 1.6 \
#       --frames 8 --cell 0.03 --floor 40 --exclude sparks
#
# `--exclude sparks` IS NOT OPTIONAL ON THE MISSILE. That node is a POINT
# primitive (glTF draw mode 0) and `collect` raises on any mode but triangles
# rather than dropping it quietly -- correctly, because a mesh this tool cannot
# read is a mesh the board would be missing without anybody being told. Nothing
# is lost: a spark shower is what js/effects.js already throws at the impact.
#
# `--exclude wave_rings` DROPS THE HERALD'S SOUND HALO, and the argument is the
# Vanguard's `Integrated_Kinetic_Field` argument with different numbers. Those
# three nodes are flat concentric discs at y 0.13..0.29 -- floating, never
# touching the road -- spanning 3.54 source units against a cart 1.2 wide.
# Imported they would TREBLE the model's plan extent, which is what the frost
# ring, the camo ring and tools/check-gait-slip.js's ring budget are drawn
# against, and this format has no translucency to draw them with (see
# `material_entry`), so they would ship as an opaque grey dinner plate under
# the cart. Nothing is lost: the Herald's broadcast is already drawn, by the
# cords its own `support.tether` block puts on every body it hastens.
#
# THE TWO CARTS' SIZES ARE SET BY THEIR WHEELS AND NOT BY THEIR BODIES, which
# is a rule no other import here follows and is explained in full in
# `roll_cycle`. In short: the cycle is a LOOP, so a wheel must come back to
# itself at the wrap, and a size at which the measured roll lands on a whole
# number of spoke pitches is a size at which nothing has to be rounded away.
# 1.237 u puts the Herald's drive wheel at 4.000 sixths of a turn per stride and
# 0.930 u puts the Sapper's at 5.003 quarters. Change either number and the
# wheel starts rolling a few percent off true -- which is survivable, and is
# what `--wheel-facets` exists to bound, but it is not free.
#
# `--wheel-facets` IS THE SPOKE COUNT OF THE FILE'S WHEELS, counted off the
# hierarchy rather than guessed: the Herald ships `drive_wheel_l_spoke_0..5`
# and the Sapper `wheel_spoke_rear_l_1..4`.
#
# THE DINOMECH IS THE ONLY IMPORT WITH NO HIERARCHY AT ALL -- one node, one
# mesh, 34 348 triangles -- so `--rig saurian` is the only rig here that reads
# its grouping off the GEOMETRY. See the header above `saurian_split`.
#
# THE DINOMECH'S BODY WAS REPLACED ON 2026-08-28 AND PUT BACK ON 2026-08-29.
# For one day the type wore `biomech.glb`, a generated 502 250-triangle
# QUADRUPED under one material and a 4096x4096 atlas, authored inside a unit
# cube, facing -x, carrying a scythe of a tail curled over its own back. That
# file has been withdrawn; the body is the skeletal biped again, renamed
# `dinomech.glb` -- 34 348 triangles, six named materials, 6.22 source units
# tall, facing +x, dragging a straight tail -- and the command above is the one
# that was in use before the swap.
#
# WHAT THE ROUND TRIP IS WORTH REMEMBERING FOR is not the quadruped, which is
# gone, but the fact that the two meshes FACED OPPOSITE WAYS. A rig left
# carrying the other one's `source_forward` walks the finale down the road
# tail-first, and nothing in this toolchain measures facing -- see the note in
# `build` and the header above `saurian_split`, which names the one thing that
# does catch it.
#
# `--texture-bands` WAS ADDED FOR THAT QUADRUPED AND NOW RUNS ON NOTHING. It is
# not dead code and it is not tested by any shipped import either: every file
# in `glb/` today carries its colour in named materials, so the stage is a
# no-op on all of them. Read `texture_bands`'s own header before trusting it
# again.

# AND THE TWO 2026-08-28 IMPORTS -- one body and one thing that is not a body:
#
#   python3 tools/glb_to_model.py ../glb/volatile.glb \
#       --rig volatile --name enemy-volatile --glow sum --emit-cap 1.6 \
#       --frames 16 --cell 0.02 --floor 120
#
#   python3 tools/glb_to_model.py ../glb/missile.glb \
#       --rig missile --name missile --glow sum --emit-cap 1.6 \
#       --frames 8 --cell 0.03 --floor 40 --exclude sparks
#
# `--exclude sparks` IS NOT OPTIONAL ON THE MISSILE. That node is a POINT
# primitive (glTF draw mode 0) and `collect` raises on any mode but triangles
# rather than dropping it quietly -- correctly, because a mesh this tool cannot
# read is a mesh the board would be missing without anybody being told. Nothing
# is lost: a spark shower is what js/effects.js already throws at the impact.
#
# `--exclude wave_rings` DROPS THE HERALD'S SOUND HALO, and the argument is the
# Vanguard's `Integrated_Kinetic_Field` argument with different numbers. Those
# three nodes are flat concentric discs at y 0.13..0.29 -- floating, never
# touching the road -- spanning 3.54 source units against a cart 1.2 wide.
# Imported they would TREBLE the model's plan extent, which is what the frost
# ring, the camo ring and tools/check-gait-slip.js's ring budget are drawn
# against, and this format has no translucency to draw them with (see
# `material_entry`), so they would ship as an opaque grey dinner plate under
# the cart. Nothing is lost: the Herald's broadcast is already drawn, by the
# cords its own `support.tether` block puts on every body it hastens.
#
# THE TWO CARTS' SIZES ARE SET BY THEIR WHEELS AND NOT BY THEIR BODIES, which
# is a rule no other import here follows and is explained in full in
# `roll_cycle`. In short: the cycle is a LOOP, so a wheel must come back to
# itself at the wrap, and a size at which the measured roll lands on a whole
# number of spoke pitches is a size at which nothing has to be rounded away.
# 1.237 u puts the Herald's drive wheel at 4.000 sixths of a turn per stride and
# 0.930 u puts the Sapper's at 5.003 quarters. Change either number and the
# wheel starts rolling a few percent off true -- which is survivable, and is
# what `--wheel-facets` exists to bound, but it is not free.
#
# `--wheel-facets` IS THE SPOKE COUNT OF THE FILE'S WHEELS, counted off the
# hierarchy rather than guessed: the Herald ships `drive_wheel_l_spoke_0..5`
# and the Sapper `wheel_spoke_rear_l_1..4`.
#
# THE DINOMECH IS THE ONLY IMPORT WITH NO HIERARCHY AT ALL -- one node, one
# mesh, 34 348 triangles -- so `--rig saurian` is the only rig here that reads
# its grouping off the GEOMETRY. See the header above `saurian_split`.
#
# THE DINOMECH'S BODY WAS REPLACED ON 2026-08-28, at the owner's instruction
# ("swap out the biomech model with the biomech.glb model instead of the
# biomech_skeletal_dinosaur.glb"), and the swap moved three numbers on the
# command above and two rules inside the rig. `biomech_skeletal_dinosaur.glb`
# was a 34 348-triangle BIPED, six named materials, 4.35 source units tall,
# facing +x, dragging a straight tail. `biomech.glb` is a generated
# 502 250-triangle QUADRUPED, one material and a 4096x4096 atlas, ONE source
# unit long, facing -x, carrying a scythe of a tail curled over its own back.
# What each change is for:
#
#   `--cell 0.038` AND NOT 0.24, and the two are the same decimation. The cell
#   is in SOURCE units and this file is authored inside a unit cube where the
#   old one stood 4.35 units tall, so the old number is 26% of the new body's
#   whole height -- it would grind the legs off. 0.038 lands at 6 202
#   triangles against the old import's 6 030: the same budget, which is what a
#   boss is worth and what `cluster` exists to hold.
#
#   `--texture-bands 8` AND NOT THE DEFAULT 6. See `texture_bands` for the
#   stage; the count is 8 because this atlas paints TWO families -- warm bone
#   and neutral gunmetal -- and six bands spend five of themselves on the warm
#   one. The eighth band is what buys the grey a ladder of its own.
#
#   NO `--exclude` AND NO `--height`. There is one node, so there is nothing to
#   name in an exclude, and the rig's own 1.05 u default is still the right
#   height: it is set against the ROSTER (see the rig entry) and not against
#   either mesh.
#
# A WALKER'S CYCLE IS SOLVED, NOT TUNED. gl-world.js advances an enemy's frame
# by DISTANCE covered, so one cycle is 28.6 / 31.8032 = 0.899281 model units of
# travel for every body at every size, and a planted foot must go backward by
# exactly that much or it skates. `walk_cycle` inverts the hip rotation that
# puts the sole where it has to be, frame by frame, instead of picking an angle
# and measuring the error afterwards -- the same argument (and the same figure)
# as tools/blender/gait_solve.py, arrived at without Blender. What proves it is
# `node tools/check-gait-slip.js`, which reads the shipped .js file.
# ---------------------------------------------------------------------------

import argparse
import json
import math
import os
import struct
import sys

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "js", "gl", "models")

# Blender units -> board pixels. THE SAME CONSTANT export_mesh.py derives, and
# it must stay the same one: it is what makes a Blender unit the same number of
# pixels on every model, so an import cannot arrive at its own scale.
UNITS_TO_PX = 20.0 * 1.529 * 1.04

PRECISION = 3

# THE ONE NUMBER A WALKER'S GAIT IS ABOUT. stride = Enemy.RADIUS_PX * 2.6 board
# px (gl-world.js), and drawActor scales the mesh by unitsToPx * sizeScale, so
# both sizeScale terms cancel and one walk cycle is this many MODEL units of
# forward travel on every body at every size and every speed.
CYCLE_UNITS = (11.0 * 2.6) / UNITS_TO_PX          # 0.8992806...

# Which vertices count as the sole, measured down from the group's own lowest
# REST vertex. Identical to tools/check-gait-slip.js's SOLE_BAND, deliberately:
# the solve and the instrument that grades it must agree about what a foot is,
# or a clean solve grades as a slide.
SOLE_BAND = 0.02


# --- glTF binary ------------------------------------------------------------

COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
             5125: ("I", 4), 5126: ("f", 4)}
COMPONENTS_PER = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class Gltf(object):
    """The header and the blob, with accessors read on demand."""

    def __init__(self, path):
        raw = open(path, "rb").read()
        magic, version, total = struct.unpack_from("<III", raw, 0)
        if magic != 0x46546C67:
            raise ValueError("%s is not a .glb (bad magic)" % path)
        if version != 2:
            raise ValueError("%s is glTF %d; this reads version 2" %
                             (path, version))
        self.json = None
        self.bin = b""
        offset = 12
        while offset < total:
            length, kind = struct.unpack_from("<II", raw, offset)
            body = raw[offset + 8:offset + 8 + length]
            if kind == 0x4E4F534A:
                self.json = json.loads(body)
            elif kind == 0x004E4942:
                self.bin = body
            offset += 8 + length
        if self.json is None:
            raise ValueError("%s has no JSON chunk" % path)

    def accessor(self, index):
        """One accessor as a list of tuples, honouring byteStride.

        Interleaved buffers are normal in exporter output and reading them as
        if they were tight gives geometry that looks shredded rather than
        wrong, so the stride is respected even though this particular file is
        tight.
        """
        a = self.json["accessors"][index]
        if "sparse" in a:
            raise ValueError("sparse accessors are not supported")
        view = self.json["bufferViews"][a["bufferView"]]
        count = COMPONENTS_PER[a["type"]]
        fmt, size = COMPONENT[a["componentType"]]
        start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = view.get("byteStride") or size * count
        layout = "<" + fmt * count
        return [struct.unpack_from(layout, self.bin, start + i * stride)
                for i in range(a["count"])]


# --- small matrix helpers ---------------------------------------------------
#
# Row-major 4x4 as a list of four rows, which is how they read on the page.
# Only the WRITER flips to column-major, because that is what
# uniformMatrix4fv wants and it is the one place the distinction matters.

IDENTITY = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]]


def mat_multiply(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)]
            for r in range(4)]


def mat_apply(m, p):
    return (m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + m[0][3],
            m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + m[1][3],
            m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + m[2][3])


def mat_translate(t):
    return [[1.0, 0.0, 0.0, t[0]], [0.0, 1.0, 0.0, t[1]],
            [0.0, 0.0, 1.0, t[2]], [0.0, 0.0, 0.0, 1.0]]


def mat_scale(s):
    return [[s, 0.0, 0.0, 0.0], [0.0, s, 0.0, 0.0],
            [0.0, 0.0, s, 0.0], [0.0, 0.0, 0.0, 1.0]]


def mat_rotate(axis, angle):
    c, s = math.cos(angle), math.sin(angle)
    if axis == "x":
        return [[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1]]
    if axis == "y":
        return [[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1]]
    return [[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


def node_matrix(node):
    """A glTF node's local transform, from either form it may take."""
    if "matrix" in node:
        m = node["matrix"]                      # column-major in the file
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    out = IDENTITY
    if "scale" in node:
        s = node["scale"]
        out = mat_multiply([[s[0], 0, 0, 0], [0, s[1], 0, 0],
                            [0, 0, s[2], 0], [0, 0, 0, 1]], out)
    if "rotation" in node:
        x, y, z, w = node["rotation"]
        out = mat_multiply(
            [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w),
              2 * (x * z + y * w), 0],
             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z),
              2 * (y * z - x * w), 0],
             [2 * (x * z - y * w), 2 * (y * z + x * w),
              1 - 2 * (x * x + y * y), 0],
             [0, 0, 0, 1]], out)
    if "translation" in node:
        out = mat_multiply(mat_translate(node["translation"]), out)
    return out


# --- colour -----------------------------------------------------------------

def to_srgb(v):
    """Linear -> sRGB.

    glTF stores baseColorFactor and emissiveFactor in LINEAR light; the .js
    model format stores the art board's sRGB values and gl-models.js converts
    back on expand. Skipping this step is not a subtle error: a mid grey
    arrives about half as bright as it left.
    """
    v = max(0.0, min(1.0, v))
    return v * 12.92 if v <= 0.0031308 else 1.055 * (v ** (1 / 2.4)) - 0.055


def material_entry(material, tint, glow="emissive", cap=None):
    """One glTF material as a palette row: [r, g, b, emission] in sRGB.

    AN EMISSIVE STRENGTH IS NOT A BRIGHTNESS HERE, IT IS A ROUTE TO WHITE, and
    that is why `cap` exists. `uGlow` is 0 for every body on the board except a
    flier (gl-world.js sets it for the lantern and nothing else), so at rest the
    whole of a material's emission is `GLModels.expand`'s resting floor:
    `min(1, emit * 0.16)` added to each LINEAR channel before lighting. The
    hound arrives from its renderer with strengths of 3.2, 2.4 and 5.0 -- floors
    of 0.51, 0.38 and 0.80 -- and adding 0.8 to all three channels of a colour
    does not ship a hot version of it, it ships WHITE. Verified on the real page
    before this argument was written: the first import drew a black dog with
    white panels, on the two parts a reader looks at first.

    THE COROLLARY, WHICH IS THE HALF WORTH KNOWING: saturation falls as emission
    rises, because the floor is white. A vivid colour on a lit part is bought
    with a LOW heat -- see HOUND_TINT, where the lava crust at 0.55 is far more
    orange than the 1.55 amber it replaced. A tint entry may therefore carry its
    own emission and override this cap outright.

    `--emit-cap` is the blunt instrument for everything a tint does not name.
    Default None leaves every strength as authored, because `enemy-flying.js` is
    a shipped artefact and a re-import must reproduce it.

    THE COLOUR OF AN EMISSIVE PART IS ITS EMISSIVE COLOUR, not its base colour.
    The .js format carries one colour and one emission SCALAR per palette
    entry, because every model authored in this project lights a part in the
    same hue it is painted. An imported material can disagree -- this firefly's
    eye lens is near-black plastic that emits hot orange -- and taking the base
    colour there would ship two black dots where the eyes are.

    AND THE OPPOSITE CASE EXISTS, which is why `glow` is a choice rather than a
    rule. The steampunk zombie's `sick_eye` is the mirror image of that lens: a
    bright sick-green base (0.694, 0.776, 0.352) carrying a DIM emissive
    (0.033, 0.058, 0.006). A PBR renderer shows base + emissive and the eye
    reads sick green; taking the emissive alone ships a dark olive dot, which is
    the same defect as the black lens with the inputs swapped.

    So `glow="sum"` adds the two in LINEAR light -- the space both factors are
    stored in -- and clamps. It is right for both files and it is still not the
    default, because `enemy-flying.js` is a shipped artefact and a re-import
    must reproduce it rather than quietly improve it. Ask for `sum` on new work.
    """
    pbr = material.get("pbrMetallicRoughness", {})
    base = pbr.get("baseColorFactor", [0.8, 0.8, 0.8, 1.0])
    emissive = material.get("emissiveFactor", [0.0, 0.0, 0.0])
    strength = 0.0
    ext = material.get("extensions", {})
    if "KHR_materials_emissive_strength" in ext:
        strength = ext["KHR_materials_emissive_strength"].get(
            "emissiveStrength", 1.0)
    elif any(v > 0 for v in emissive):
        strength = 1.0
    elif "KHR_materials_unlit" in ext:
        # AN UNLIT MATERIAL IS A SELF-LIT ONE, whatever it says about emission.
        # `KHR_materials_unlit` means "draw this at its base colour and do not
        # light it", which is how a flame, a hologram or a sky dome is authored
        # for a renderer that has an unlit path -- and this renderer does not.
        # Read as an ordinary PBR material it comes out as flat plastic in
        # exactly the right colour, lit and shaded by the board's own lamp,
        # which is the opposite of what the extension asks for: the part goes
        # DARK on the side facing away from the light.
        #
        # So an unlit material is given a unit strength, which is the nearest
        # thing this format has to "does not take the lighting" -- see
        # `GLModels.expand` for how emission becomes a resting floor -- and, as
        # importantly, that is what makes it a material a TINT may then retune.
        # The rule below is that a tint cannot turn plating into a lamp; the
        # file has already said this is not plating.
        #
        # 1.0 AND NOT MORE. It is a floor of 0.16 of white, which reads as "lit"
        # without blowing the colour out, and it leaves the ladder between four
        # plume shells to the tint that knows what they are. `missile.glb` is
        # the only file in `glb/` that declares the extension at all, so this
        # branch reproduces every existing import byte-for-byte.
        strength = 1.0

    # Capped AFTER the emissive/base decision is made from it, so a capped
    # material still counts as emissive and still takes its glow colour.
    if cap is not None and strength > cap:
        strength = cap

    name = material.get("name", "")
    spec = tint.get(name)
    if strength <= 0:
        rgb = base[:3]
    elif spec is not None:
        rgb = spec[:3]
        # A TINT MAY ALSO CARRY THE HEAT, as an optional fourth number, and it
        # beats `cap` because it is a value somebody chose for this material
        # rather than a ceiling applied to everything. It is here and not
        # earlier so it can only retune a material that ALREADY glows: a
        # palette decision must not be able to turn plating into a lamp.
        #
        # Needed because a body's emissive materials are rarely all one
        # temperature -- see HOUND_TINT, where a crust, a furnace and an eye
        # want three -- and one `--emit-cap` can only flatten them together.
        if len(spec) > 3:
            strength = spec[3]
    elif glow == "sum":
        rgb = [min(1.0, base[k] + emissive[k]) for k in range(3)]
    else:
        rgb = emissive
    return [round(to_srgb(rgb[0]), PRECISION), round(to_srgb(rgb[1]), PRECISION),
            round(to_srgb(rgb[2]), PRECISION), round(strength, 2)]


# --- a painted body: the palette read off a base colour map -----------------
#
# WHY THIS EXISTS AT ALL. Every import here carries its colour in its
# MATERIALS -- six named PBR entries on the skeletal dinosaur, a
# `baseColorFactor` each, and `material_entry` turns one of those into one
# palette row. A generated body does not work that way. `biomech.glb` was a
# SINGLE mesh of 502 250 triangles under a SINGLE material whose base colour is
# a 4096x4096 atlas and whose `baseColorFactor` is absent, which glTF says
# means white. Imported through materials alone that body shipped as one flat
# white silhouette: every plate, bone, rust streak and red lens the artist
# painted was in the image, and none of it in the file the game loads.
#
# **THAT FILE WAS WITHDRAWN ON 2026-08-29 AND NO SHIPPED IMPORT USES THIS STAGE
# TODAY.** Every `.glb` in `glb/` carries named materials, so `texture_bands`
# is a no-op on all of them and nothing exercises the code below. It is kept
# because the next generated body will need it and because deleting a working
# stage to re-derive it later is worse -- but it is UNTESTED by the suites in
# its current form, and that is a fact about it rather than an oversight.
#
# SO THE COLOUR IS READ OFF THE IMAGE AND QUANTISED BACK INTO MATERIALS. Each
# triangle is sampled at its own UV centroid, the samples are clustered into a
# handful of bands, and each band is appended to the file's material list as a
# synthetic material carrying that band's colour. Everything downstream --
# `material_entry`, the tint table, the emissive rules, the palette de-dup in
# `build` -- then runs exactly as it does for a hand-authored body, because
# what it is handed IS a hand-authored body's worth of materials. Nothing in
# this file changes shape for a textured import except `collect`, which now
# carries a UV alongside each triangle, and this block, which spends it.
#
# WHY A HANDFUL OF BANDS AND NOT A COLOUR PER TRIANGLE. The .js format stores a
# palette and one INDEX per triangle (see `write_js`), and a 6 000-entry
# palette would be the largest thing in the file by an order of magnitude. Six
# bands is also what the mesh this one replaces shipped -- gunmetal, dark
# steel, beige bone, crimson, blackened mechanism, red optic -- so the ceiling
# is the one the board already reads a boss at, arrived at from the other side.
#
# AT WHAT RESOLUTION THE IMAGE IS READ, AND WHY THAT IS NOT A COMPROMISE. A
# baseline JPEG already stores each 8x8 block's average, in that block's DC
# coefficient, so `jpeg_dc` walks the entropy stream and keeps nothing else:
# no dequantisation past the DC term, no inverse DCT, no chroma upsampling.
# What comes back is the atlas at 1/8 scale -- 512x512 for this file -- in
# about a second of pure Python where a full decode is minutes. This pipeline
# then decimates 502 250 triangles to about 6 000, so a triangle that survives
# covers hundreds of source texels; the mean of an 8x8 block is a FINER
# measurement than the model that quotes it can hold.
#
# BASELINE JPEG ONLY, AND IT SAYS SO. Progressive JPEG and PNG are refused by
# name rather than mis-decoded, because a texture read wrong is a body painted
# wrong and nothing downstream can tell. The three maps this file ships are
# baseline; a source that is not can be re-saved, and the error says so.

# The zig-zag order's first entry is the DC term, which is the only one read.
JPEG_DC_SCALE = 8.0
# What a JPEG's 8-bit samples are centred on before the level shift is undone.
JPEG_LEVEL = 128.0


def jpeg_dc(data):
    """A baseline JPEG as one average colour per 8x8 block, per component.

    Returns (width, height, [(blocks across, blocks down, values), ...]) with
    one entry per component in the frame's own order -- Y, Cb, Cr for the
    3-component files this reads. A chroma plane is smaller than the luma one
    exactly as its sampling factors say, and `texture_sampler` does the only
    upsampling anyone here needs, which is nearest.

    THE ENTROPY STREAM MUST STILL BE WALKED IN FULL. There is no seeking in a
    Huffman stream: every AC coefficient of every block has to be decoded to
    find where the next block starts, even when -- as here -- the value is
    thrown away the instant it is read. What makes that cheap is the 16-bit
    lookup built for each code table: one peek and one list index per symbol,
    against a bit-at-a-time walk down a code tree.
    """
    tables, frame, scan, start = {}, None, None, None
    i = 2
    while i < len(data) - 1:
        if data[i] != 0xFF:
            raise ValueError("not a JPEG: expected a marker at byte %d" % i)
        marker = data[i + 1]
        length = (data[i + 2] << 8) | data[i + 3]
        seg = data[i + 4:i + 2 + length]
        if marker == 0xDB:                       # quantisation tables
            p = 0
            while p < len(seg):
                wide, slot = seg[p] >> 4, seg[p] & 15
                p += 1
                if wide:
                    tables[("q", slot)] = struct.unpack_from(">64H", seg, p)
                    p += 128
                else:
                    tables[("q", slot)] = tuple(seg[p:p + 64])
                    p += 64
        elif marker == 0xC4:                     # Huffman tables
            p = 0
            while p < len(seg):
                kind, slot = seg[p] >> 4, seg[p] & 15
                counts = seg[p + 1:p + 17]
                p += 17
                code = 0
                lut = [None] * 65536
                for bits in range(1, 17):
                    for _ in range(counts[bits - 1]):
                        head = code << (16 - bits)
                        for tail in range(1 << (16 - bits)):
                            lut[head + tail] = (seg[p], bits)
                        p += 1
                        code += 1
                    code <<= 1
                tables[("h", kind, slot)] = lut
        elif marker in (0xC0, 0xC1):             # baseline frame header
            height = (seg[1] << 8) | seg[2]
            width = (seg[3] << 8) | seg[4]
            frame = (width, height, [
                {"id": seg[6 + c * 3], "h": seg[7 + c * 3] >> 4,
                 "v": seg[7 + c * 3] & 15, "q": seg[8 + c * 3]}
                for c in range(seg[5])])
        elif marker == 0xC2:
            raise ValueError("this JPEG is PROGRESSIVE; re-save it as baseline")
        elif marker == 0xDD:
            raise ValueError("this JPEG carries restart intervals, which this "
                             "reader does not walk")
        elif marker == 0xDA:                     # start of scan
            scan = dict((seg[1 + c * 2], (seg[2 + c * 2] >> 4,
                                          seg[2 + c * 2] & 15))
                        for c in range(seg[0]))
            start = i + 2 + length
            break
        i += 2 + length
    if frame is None or scan is None:
        raise ValueError("this JPEG has no baseline scan")
    return _jpeg_scan(data, start, frame, scan, tables)


def _jpeg_scan(data, start, frame, scan, tables):
    """The one interleaved scan of a baseline JPEG, DC coefficients kept."""
    width, height, comps = frame
    across = max(c["h"] for c in comps)
    down = max(c["v"] for c in comps)
    mcus_x = (width + 8 * across - 1) // (8 * across)
    mcus_y = (height + 8 * down - 1) // (8 * down)

    # WHERE THE SCAN ENDS IS FOUND BEFORE THE STUFFING IS REMOVED, and the
    # order matters: a stuffed 0xFF 0x00 sitting in front of a 0xD9 becomes
    # 0xFF 0xD9 the moment the 0x00 is dropped, and a search afterwards would
    # cut the picture off at the first one of those. This file's scan ends 1.0
    # MB past the first such pair.
    end = start
    while True:
        end = data.find(b"\xff", end)
        if end < 0:
            end = len(data)
            break
        if data[end + 1] == 0x00 or 0xD0 <= data[end + 1] <= 0xD7:
            end += 2
            continue
        break
    raw = data[start:end].replace(b"\xff\x00", b"\xff")

    planes = [[0] * (mcus_x * c["h"] * mcus_y * c["v"]) for c in comps]
    plan = []
    for index, c in enumerate(comps):
        dc, ac = scan[c["id"]]
        plan.append((index, c["h"], c["v"], tables[("h", 0, dc)],
                     tables[("h", 1, ac)], mcus_x * c["h"], planes[index]))

    predicted = [0] * len(comps)
    acc = held = 0
    at = 0
    total = len(raw)
    for my in range(mcus_y):
        for mx in range(mcus_x):
            for index, ch, cv, dc_lut, ac_lut, stride, plane in plan:
                for by in range(cv):
                    row = (my * cv + by) * stride + mx * ch
                    for bx in range(ch):
                        while held < 32 and at < total:
                            acc = (acc << 8) | raw[at]
                            at += 1
                            held += 8
                        peek = (acc >> (held - 16)) & 0xFFFF if held >= 16 \
                            else (acc << (16 - held)) & 0xFFFF
                        size, bits = dc_lut[peek]
                        held -= bits
                        acc &= (1 << held) - 1
                        if size:
                            held -= size
                            value = acc >> held
                            acc &= (1 << held) - 1
                            if value < (1 << (size - 1)):
                                value -= (1 << size) - 1
                            predicted[index] += value
                        plane[row + bx] = predicted[index]
                        k = 1
                        while k < 64:
                            while held < 32 and at < total:
                                acc = (acc << 8) | raw[at]
                                at += 1
                                held += 8
                            peek = (acc >> (held - 16)) & 0xFFFF if held >= 16 \
                                else (acc << (16 - held)) & 0xFFFF
                            symbol, bits = ac_lut[peek]
                            held -= bits
                            acc &= (1 << held) - 1
                            run, size = symbol >> 4, symbol & 15
                            if size == 0:
                                if run == 15:      # sixteen zeroes, no value
                                    k += 16
                                    continue
                                break              # end of block
                            k += run + 1
                            held -= size
                            acc &= (1 << held) - 1

    out = []
    for index, c in enumerate(comps):
        step = tables[("q", c["q"])][0]
        out.append((mcus_x * c["h"], mcus_y * c["v"],
                    [max(0, min(255, int(v * step / JPEG_DC_SCALE
                                         + JPEG_LEVEL + 0.5)))
                     for v in planes[index]]))
    return width, height, out


def texture_sampler(gltf, index):
    """One glTF texture as (u, v) -> (r, g, b) in sRGB 0..1.

    UV WRAPS RATHER THAN CLAMPS, which is glTF's own default and the only
    behaviour that can be right for an atlas: a coordinate a hair outside 0..1
    belongs to the island it came from, not to the edge of the sheet.
    """
    image = gltf.json["images"][gltf.json["textures"][index]["source"]]
    if "bufferView" not in image:
        raise ValueError("texture %d is stored as a URI; this reads .glb "
                         "images from the binary chunk" % index)
    mime = image.get("mimeType", "")
    if mime not in ("image/jpeg", "image/jpg"):
        raise ValueError("texture %d is %s; only baseline JPEG is read"
                         % (index, mime or "of no declared type"))
    view = gltf.json["bufferViews"][image["bufferView"]]
    at = view.get("byteOffset", 0)
    width, height, planes = jpeg_dc(gltf.bin[at:at + view["byteLength"]])
    if len(planes) == 1:
        (bw, bh, luma) = planes[0]

        def grey(u, v):
            x = int(u * bw) % bw
            y = int(v * bh) % bh
            value = luma[y * bw + x] / 255.0
            return (value, value, value)
        return grey

    (bw, bh, luma), (cw, ch, blue), (_, _, red) = planes[:3]

    def sample(u, v):
        x = int(u * bw) % bw
        y = int(v * bh) % bh
        y_ = luma[y * bw + x]
        # Nearest-neighbour chroma. The planes differ by the sampling factors
        # and nothing finer than a block is being asked for.
        cx = x * cw // bw
        cy = y * ch // bh
        cb = blue[cy * cw + cx] - 128.0
        cr = red[cy * cw + cx] - 128.0
        return (min(1.0, max(0.0, (y_ + 1.402 * cr) / 255.0)),
                min(1.0, max(0.0, (y_ - 0.344136 * cb - 0.714136 * cr) / 255.0)),
                min(1.0, max(0.0, (y_ + 1.772 * cb) / 255.0)))
    return sample


def to_linear(v):
    """sRGB -> linear. `to_srgb` the other way round.

    A texel is sRGB-encoded and a `baseColorFactor` is linear, so a band's
    colour has to be handed back in linear light or `material_entry` -- which
    converts on the way out -- would gamma-correct it twice and ship a washed
    out body.
    """
    v = max(0.0, min(1.0, v))
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


# How many rounds the band solve runs. It is a k-means over at most a few tens
# of thousands of samples in three dimensions and it stops moving long before
# this; the fixed count is here so two runs of this tool cannot disagree.
BAND_ROUNDS = 24
# How many samples the bands are FITTED on. Every triangle is then assigned to
# the nearest one, so this bounds the solve and not the result: a stride over
# an atlas's worth of samples is a fair sample of it, and 20 000 of them fit
# six centres to well inside the rounding this format ships at.
BAND_SAMPLES = 20000


def texture_bands(gltf, parts, count):
    """Repaint textured triangles with a small palette read off the atlas.

    Triangles arrive as (points, material, uv) and leave as (points, material)
    -- the pair the rest of this file has always handled. A triangle whose
    material has no base colour texture keeps the material it came with, so a
    file that mixes an authored material with a painted one imports both.

    THE BANDS ARE FITTED IN sRGB AND STORED IN LINEAR. Clustering is a
    perceptual question -- which colours a reader would call the same colour --
    and sRGB is the space where distance means roughly that; a linear-space fit
    puts four of six bands inside the darkest quarter of this atlas and paints
    the whole animal in shades of black. What is written into the synthetic
    material is linear, because that is what glTF says a `baseColorFactor` is.

    EACH BAND IS WEIGHTED BY AREA, NOT BY TRIANGLE COUNT. This mesh's triangles
    vary by three orders of magnitude in size -- generated geometry is dense
    where the surface is busy -- so counting them would let the fine detail
    around a lens outvote the entire flank it sits on.
    """
    painted = {}
    for part in parts:
        for tri in part["triangles"]:
            if tri[2] is None or tri[1] in painted:
                continue
            texture = gltf.json["materials"][tri[1]] \
                .get("pbrMetallicRoughness", {}).get("baseColorTexture")
            if texture is not None:
                painted[tri[1]] = texture["index"]

    if not painted or count < 1:
        for part in parts:
            part["triangles"] = [(tri[0], tri[1]) for tri in part["triangles"]]
        return {}

    # SAMPLED ONCE, PER TRIANGLE, AND HELD -- the atlas is read on the way past
    # and never again, so the band fit and the band assignment below are
    # arithmetic on a list rather than half a million more texture lookups.
    samplers = dict((m, texture_sampler(gltf, t)) for m, t in painted.items())
    sampled = []
    gathered = {}
    for part in parts:
        here = []
        for tri in part["triangles"]:
            sampler = samplers.get(tri[1]) if tri[2] is not None else None
            if sampler is None:
                here.append(None)
                continue
            rgb = sampler(tri[2][0], tri[2][1])
            here.append(rgb)
            gathered.setdefault(tri[1], []).append((rgb, triangle_area(tri[0])))
        sampled.append(here)

    bands = {}
    report = {}
    for material, samples in gathered.items():
        centres = fit_bands(samples, count)
        keys = [band_key(c) for c in centres]
        name = gltf.json["materials"][material].get("name",
                                                    "material %d" % material)
        bands[material] = (len(gltf.json["materials"]), keys)
        for band, rgb in enumerate(centres):
            gltf.json["materials"].append({
                "name": "%s band %d" % (name, band),
                "pbrMetallicRoughness": {
                    "baseColorFactor": [to_linear(rgb[0]), to_linear(rgb[1]),
                                        to_linear(rgb[2]), 1.0]}})
        report[name] = [tuple(round(v, PRECISION) for v in rgb)
                        for rgb in centres]

    for part, here in zip(parts, sampled):
        out = []
        for tri, rgb in zip(part["triangles"], here):
            if rgb is None:
                out.append((tri[0], tri[1]))
                continue
            first, keys = bands[tri[1]]
            out.append((tri[0], first + nearest_band(band_key(rgb), keys)))
        part["triangles"] = out
    return report


def triangle_area(points):
    """Half the cross product's length, in whatever units the points are in."""
    a, b, c = points
    u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
         u[0] * v[1] - u[1] * v[0])
    return 0.5 * math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)


# HOW MUCH A DIFFERENCE IN COLOUR OUTWEIGHS A DIFFERENCE IN BRIGHTNESS when
# the bands are fitted. NOT 1, AND THE PICTURE IS THE ARGUMENT: at 1 -- plain
# RGB distance -- every centre this atlas produces lands on one luminance
# diagonal, because that is the axis the samples are spread along, and the
# Dinomech ships as six shades of a single brown. Its gunmetal plating and the
# bone bolted to it sit at nearly the SAME brightness and differ almost
# entirely in chroma, so the one axis that separates the two families is the
# one a plain fit spends last. At 2 the fit returns four warm bands and four
# neutral ones, which is the animal the atlas actually paints.
BAND_CHROMA = 2.0


def band_key(rgb):
    """A colour in the space the bands are fitted in: luma, then two chromas.

    An opponent encoding rather than RGB, so `BAND_CHROMA` has one place to
    apply. It is a LINEAR map, which is what lets `fit_bands` keep its centres
    in RGB and still run a true k-means in this space: a weighted mean commutes
    with a linear transform, so averaging the members in RGB and encoding the
    result is the same centre as averaging their encodings.
    """
    y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
    return (y, BAND_CHROMA * (rgb[2] - y), BAND_CHROMA * (rgb[0] - y))


def nearest_band(key, keys):
    """Which band a colour belongs to. Squared distance in `band_key` space."""
    best = 0
    far = None
    for i, c in enumerate(keys):
        d = (key[0] - c[0]) ** 2 + (key[1] - c[1]) ** 2 + (key[2] - c[2]) ** 2
        if far is None or d < far:
            far = d
            best = i
    return best


def fit_bands(samples, count):
    """`count` colours that stand for this list of (colour, weight) samples.

    THE START IS THE LUMINANCE LADDER AND NOT A RANDOM DRAW, which is what
    makes two runs of this tool agree: the samples are ordered by brightness
    and the initial centres are read off that order at even weight intervals,
    so a body's darkest quarter opens on a dark centre and its highlights on a
    bright one. Nothing here consults a random number generator, and a k-means
    that did could not be committed to a repository -- the .js file would
    change under a re-run that changed nothing else.

    AN EMPTY BAND KEEPS ITS PREVIOUS COLOUR rather than being re-seeded. A band
    nothing lands in contributes no triangle, so `build`'s palette de-dup drops
    it and the cost of leaving it is a row that never appears; the cost of
    re-seeding it is a solve that can oscillate and a file that does not
    reproduce.
    """
    ordered = sorted(samples, key=lambda s: band_key(s[0])[0])
    stride = max(1, len(ordered) // BAND_SAMPLES)
    fitting = [(list(rgb), band_key(rgb), weight)
               for rgb, weight in ordered[::stride]]
    total = sum(s[2] for s in fitting)
    centres = []
    carried = 0.0
    for rgb, _key, weight in fitting:
        carried += weight
        if len(centres) < count and \
                carried >= total * (len(centres) + 1.0) / (count + 1.0):
            centres.append(list(rgb))
    while len(centres) < count:
        centres.append(list(fitting[len(centres) * len(fitting) // count][0]))

    for _ in range(BAND_ROUNDS):
        keys = [band_key(c) for c in centres]
        sums = [[0.0, 0.0, 0.0, 0.0] for _ in centres]
        for rgb, key, weight in fitting:
            acc = sums[nearest_band(key, keys)]
            acc[0] += rgb[0] * weight
            acc[1] += rgb[1] * weight
            acc[2] += rgb[2] * weight
            acc[3] += weight
        moved = 0.0
        for i, acc in enumerate(sums):
            if acc[3] <= 0.0:
                continue
            for k in range(3):
                fresh = acc[k] / acc[3]
                moved = max(moved, abs(fresh - centres[i][k]))
                centres[i][k] = fresh
        if moved < 1e-4:
            break
    return [tuple(c) for c in sorted(centres, key=lambda c: band_key(c)[0])]


# --- triangle budget --------------------------------------------------------

def cluster(triangles, cell, floor_tris):
    """Vertex-clustering decimation, one source part at a time.

    WHY ANY DECIMATION AT ALL. This firefly arrives at 24 708 triangles, which
    is 1.8x the heaviest model the game ships (the Rifleman's B5 at 13 872) for
    the SMALLEST body on the board: an Aether Wisp is 9.4 px of radius and wave
    24 is nothing but Wisps. The cost is not the frame -- a modern GPU does not
    notice -- it is that the .js file would be the largest asset in the game by
    a factor of two, and it loads through a <script> tag on the main thread
    before the first frame.

    WHY CLUSTERING RATHER THAN EDGE COLLAPSE. Quadric simplification is the
    better algorithm and the wrong trade here: it is several hundred lines to
    get right, and the thing being simplified is 23 px across on screen. A grid
    snap costs fifty lines and the difference is not resolvable at that size.

    WHY PER PART, AND WHY A FLOOR. The grid is applied WITHIN one source mesh,
    never across two, so a leg cannot weld itself to the abdomen behind it.
    `floor_tris` then exempts everything already small -- the wing membranes,
    the tarsi, the mandibles, the antenna tips. Those are the thin parts that
    make the silhouette read as an insect, and they are also the parts a grid
    snap destroys, because a membrane 0.02 units thick collapses to a plane in
    any cell coarse enough to be worth applying. The parts left to simplify are
    the lathed and spherical ones -- the lantern bulb, the eyes, the ball
    joints -- where a coarse grid is exactly right.
    """
    if len(triangles) <= floor_tris:
        return triangles

    cells = {}
    for tri in triangles:
        for p in tri[0]:
            key = (int(math.floor(p[0] / cell)), int(math.floor(p[1] / cell)),
                   int(math.floor(p[2] / cell)))
            acc = cells.get(key)
            if acc is None:
                acc = cells[key] = [0.0, 0.0, 0.0, 0]
            acc[0] += p[0]
            acc[1] += p[1]
            acc[2] += p[2]
            acc[3] += 1

    def snap(p):
        key = (int(math.floor(p[0] / cell)), int(math.floor(p[1] / cell)),
               int(math.floor(p[2] / cell)))
        acc = cells[key]
        return (acc[0] / acc[3], acc[1] / acc[3], acc[2] / acc[3]), key

    out = []
    for tri in triangles:
        corners = [snap(p) for p in tri[0]]
        keys = [c[1] for c in corners]
        # Two corners in one cell means the triangle collapsed to an edge. It
        # has no area, so it draws nothing and is dropped rather than shipped.
        if keys[0] == keys[1] or keys[1] == keys[2] or keys[0] == keys[2]:
            continue
        out.append(([corners[0][0], corners[1][0], corners[2][0]], tri[1]))
    return out


def triangle_normal(tri):
    """The geometric normal, which for flat shading is the only honest one.

    Recomputed rather than carried over from the file because clustering moves
    vertices: an inherited normal would light a face the shape it used to be.
    A degenerate triangle keeps a unit +Z rather than a NaN -- clustering has
    already dropped the collapsed ones, and this is the belt to that braces.
    """
    a, b, c = tri
    u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
    v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
    n = (u[1] * v[2] - u[2] * v[1],
         u[2] * v[0] - u[0] * v[2],
         u[0] * v[1] - u[1] * v[0])
    length = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)
    if length < 1e-12:
        return (0.0, 0.0, 1.0)
    return (n[0] / length, n[1] / length, n[2] / length)


# --- reading the scene ------------------------------------------------------

def collect(gltf, exclude=()):
    """Every mesh node as (node name, ancestors, [(3 points, material, uv)]).

    Points come out in the file's own space and units; the caller decides what
    that means. Positions are indexed here so the rest of the tool never has to
    think about a draw mode or an index buffer again.

    `exclude` DROPS A WHOLE SUBTREE BY NODE NAME, and it is dropped HERE rather
    than filtered later because the parts that go are not meant to influence the
    fit either. The undead zombie ships a `grave_ground` diorama base -- a mound
    that floats at y 0.33 while the feet stand at 0, because it was authored for
    a turntable render and not for a road. Left in, it sets the model's plan
    extent (2.3x the body's own) and paints a disc of earth into the air under
    every step. Dropping it is a decision about the SOURCE, so it is named on
    the command line and reported in the run, never buried in a rig.
    """
    nodes = gltf.json["nodes"]
    scene = gltf.json["scenes"][gltf.json.get("scene", 0)]

    parts = []
    dropped = []

    def walk(index, world, chain):
        node = nodes[index]
        here = mat_multiply(world, node_matrix(node))
        name = node.get("name") or ""
        if name in exclude:
            dropped.append(name)
            return
        if "mesh" in node:
            tris = []
            for prim in gltf.json["meshes"][node["mesh"]]["primitives"]:
                if prim.get("mode", 4) != 4:
                    raise ValueError("%s uses draw mode %d; only triangles "
                                     "(4) are supported" %
                                     (name, prim.get("mode")))
                pos = [mat_apply(here, p)
                       for p in gltf.accessor(prim["attributes"]["POSITION"])]
                if "indices" in prim:
                    idx = [i[0] for i in gltf.accessor(prim["indices"])]
                else:
                    idx = list(range(len(pos)))
                material = prim.get("material", 0)
                # THE UV IS CARRIED BUT NOT SPENT HERE. A triangle leaves this
                # function as (points, material, uv) and `texture_bands` is the
                # only thing that reads the third: it turns an atlas into
                # materials and hands back the (points, material) pairs the
                # rest of this file has always taken. A file with no texture
                # coordinates carries None, and nothing downstream can tell.
                slot = prim["attributes"].get("TEXCOORD_0")
                uv = gltf.accessor(slot) if slot is not None else None
                for i in range(0, len(idx) - 2, 3):
                    at = None
                    if uv is not None:
                        a, b, c = uv[idx[i]], uv[idx[i + 1]], uv[idx[i + 2]]
                        at = ((a[0] + b[0] + c[0]) / 3.0,
                              (a[1] + b[1] + c[1]) / 3.0)
                    tris.append(([pos[idx[i]], pos[idx[i + 1]],
                                  pos[idx[i + 2]]], material, at))
            parts.append({"name": name, "chain": chain, "triangles": tris})
        for child in node.get("children", []):
            walk(child, here, chain + [name])

    for root in scene["nodes"]:
        walk(root, IDENTITY, [])
    for name in exclude:
        if name not in dropped:
            raise ValueError("--exclude %s matched no node in this file" % name)
    return parts


# --- the firefly's rig ------------------------------------------------------
#
# WHAT SURVIVED THE EXPORT, AND WHAT DID NOT. Every node in this file is at
# identity with its transform baked into the vertices, so there is no rest pose
# to read and no pivot to inherit -- the NAMES are the entire rig. They are a
# good rig: `wings_left > wing_left_1 > wing_membrane_left_1` is exactly the
# three-level structure a flap needs, and `leg_left_2 > knee_left_2` is a leg.
#
# So groups are read off the hierarchy the way export_mesh._group_root reads
# off Blender's -- walk up until something recognised is found -- and each
# group's pivot is then MEASURED from the geometry that ended up in it. Nothing
# below is a coordinate somebody typed while looking at a viewport.


def firefly_group_of(part, options):
    """Which animated group a mesh belongs to, from its ancestry.

    The unnamed group "" is the thorax: it is what the other five hang off, and
    the format already means "drawn with the instance matrix alone" by it.
    Six legs share ONE group deliberately. They are 3 % of the silhouette on a
    23 px body and six independent ones would be six more draw calls per Wisp
    on a wave that is nothing but Wisps.
    """
    chain = part["chain"]
    limb = chain[1] if len(chain) > 1 else part["name"]
    if limb.startswith("leg_"):
        return "legs"
    if limb.startswith("wings_"):
        # The individual wing, not the pair: fore and hind beat out of phase.
        return chain[2] if len(chain) > 2 else part["name"]
    if limb in ("abdomen", "head"):
        return limb
    return ""


def firefly_pivot_of(name, points, refs):
    """Where a group turns, measured from what is in it.

    A wing hinges on its own hinge -- the model ships one per wing, named, so
    that is read directly. The head and the abdomen hinge where they meet the
    thorax, which is the innermost end of each along the body axis. The legs
    swing from their tops. All four are derived, so re-importing a different
    creature through this tool cannot inherit this one's proportions.
    """
    hinges = refs.get("hinges", {})
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    if name.startswith("wing_") and name in hinges:
        h = hinges[name]
        return [sum(c) / len(c) for c in zip(*h)]
    if name == "head":
        return [min(xs), 0.0, sum(zs) / len(zs)]
    if name == "abdomen":
        return [max(xs), 0.0, sum(zs) / len(zs)]
    if name == "legs":
        return [sum(xs) / len(xs), 0.0, max(zs)]
    return [0.0, 0.0, 0.0]


def hover_cycle(groups, frames, geometry, joints, options=None):
    """The pose of every group on every frame of one hover cycle.

    A WINGBEAT IS NOT A WALK, and this is the one place that matters. Every
    other animated model in the game advances its frame by DISTANCE COVERED,
    because a planted foot has to stay on one patch of road -- gl-world.js says
    so and the sprite pack said so before it. A Wisp plants nothing. Its wings
    have to beat while it is slowed, while it is stopped, and while it is
    hovering in the sandbox with no path at all, so the caller drives this from
    a clock and the comment in gl-world.js explains why that is not a relapse.

    TWO RATES IN ONE LOOP. The wings beat TWICE per cycle and everything else
    moves once, so the body is not twitching at wing speed. That is why this is
    a single frame list rather than two animations that would have to be kept
    in step at runtime -- the frame count is the common multiple, chosen once
    here.
    """
    poses = []
    for f in range(frames):
        t = f / float(frames)
        beat = t * 2 * math.pi * 2          # wings: two beats per cycle
        slow = t * 2 * math.pi              # body: one
        pose = []
        for name, pivot in groups:
            if not name:
                pose.append(None)           # the thorax IS the instance
                continue
            local = IDENTITY
            if name.startswith("wing_"):
                side = 1.0 if "_left_" in name else -1.0
                # The hind pair trails the fore pair by a third of a beat, the
                # reason a real four-winged insect does not look like a single
                # flat plane opening and closing.
                phase = beat - (0.0 if name.endswith("_1") else 2.1)
                flap = 0.85 * math.sin(phase)
                # Rolling about the body axis IS the flap: +X is forward, so a
                # roll swings a wing up and down about the spine.
                local = mat_rotate("x", side * flap)
                # A wing also sweeps forward as it rises. Without it the beat
                # reads as two rigid paddles.
                local = mat_multiply(mat_rotate("z", side * 0.16 *
                                                math.cos(phase)), local)
            elif name == "abdomen":
                # The lantern pumps: a slow nod plus a breath of scale. Emission
                # is a palette constant and cannot pulse, so the size does it.
                local = mat_rotate("y", 0.10 * math.sin(slow))
                local = mat_multiply(local,
                                     mat_scale(1.0 + 0.035 * math.sin(slow)))
            elif name == "head":
                local = mat_multiply(mat_rotate("z", 0.13 * math.sin(slow)),
                                     mat_rotate("y", -0.06 *
                                                math.cos(slow * 2)))
            elif name == "legs":
                # Trailing, the way anything that flies rather than walks
                # carries its legs.
                local = mat_rotate("y", 0.11 * math.sin(slow) - 0.05)
            pose.append(mat_multiply(mat_translate(pivot), local))
        poses.append(pose)
    return poses


# --- a two-legged walker's rig ----------------------------------------------
#
# THE SAME THREE THINGS THE FIREFLY NEEDED, for a body that walks instead. The
# steampunk zombies carry the hierarchy this wants already -- `torso`,
# `boiler_pack`, `head`, `neck`, `arm_L`, `arm_R`, `leg_L`, `leg_R` under one
# root, every node's transform baked into its vertices -- so the names are again
# the whole rig and every pivot below is measured, never typed.
#
# FIVE GROUPS: two legs, two arms, the head, and the body that carries the rest.
# The body is a NAMED group rather than the format's unnamed "", because the
# unnamed one is drawn with the instance matrix alone and therefore cannot be
# posed -- and this body has to lean. That is also what the shipped walkers do:
# `enemy-normal` carries `normal_body`, not "".
#
# GEOMETRY IS STORED IN WORLD SPACE HERE, NOT OFFSET TO EACH GROUP'S JOINT, and
# that is a fix rather than a shortcut. `GLModels.expand` derives `model.top` --
# the height the HEALTH BAR is drawn at -- from the raw stored positions with no
# group matrix applied, so a body whose tallest geometry is stored relative to a
# joint halfway up itself reports a top halfway up itself. Run
# `node tools/check-model-top.js`: enemy-normal reports 0.570 for a body that
# stands 1.190 and its bar is drawn 9.7 px INSIDE its own chest, and brute and
# hive are worse. Nothing forces the offset -- a rotation about a joint J is
# T(J).R.T(-J) on world-space points just as well as T(J).R on offset ones -- so
# this rig writes the joint into the matrix and leaves the points where they
# are. Same picture, and `top` comes out equal to the real crown.


def humanoid_group_of(part, options):
    """Which animated group a mesh belongs to, from its ancestry.

    Matched on the LIMB -- the child of the model root -- so everything bolted
    to a limb travels with it: the pauldron rivets ride the shoulder, the shin
    chains ride the shin, and the boiler pack rides the back. Case-folded
    because these files spell the sides `arm_L` while the game's own models
    spell them `arm_l`, and a rig should not fail on a capital letter.
    """
    chain = part["chain"]
    limb = (chain[1] if len(chain) > 1 else part["name"]).lower()
    if limb.startswith("leg_l"):
        return "leg_l"
    if limb.startswith("leg_r"):
        return "leg_r"
    if limb.startswith("arm_l"):
        return "arm_l"
    if limb.startswith("arm_r"):
        return "arm_r"
    if limb == "head":
        return "head"
    return options.body_group


# --- the same walker, with its limbs named instead of nested ----------------
#
# THE RIG IS THE GROUPING, AND ONLY THE GROUPING. `plodder` borrows the
# humanoid's pivots and the humanoid's cycle verbatim -- a boot plants exactly
# the way a zombie's does, and `walk_cycle` is the solved answer to that, not a
# per-file tuning. What it cannot borrow is `humanoid_group_of`, and the reason
# is a property of the FILE rather than of the body:
#
#   `slow.glb` is FLAT. All thirty meshes are direct children of one
#   `Plodder_Root`, so `chain[1]` -- the limb the humanoid rig matches on --
#   does not exist. The limb identity is carried in the MESH NAME instead
#   (`Thigh.L`, `Forearm.R`, `FacePlate`), which is the other convention an
#   exporter reaches for and is no less complete: `Boot.L` says as much as
#   `leg_L/boot` does. Pointing the humanoid rig at it puts all 636 triangles
#   into the body group, and a body group is drawn with one matrix -- so the
#   result is not a bad walk, it is a statue sliding down the road.
#
# MATCHED ON THE BASE NAME, WITH THE SIDE TAKEN OFF FIRST, because the suffix
# alone is not the limb: `Eye.L` and `Eye.R` end the same way `Fist.L` and
# `Fist.R` do, and a rule that read only the suffix would weld the face onto
# the arms and swing it. The base name is what says which limb, and the side
# then says which of the pair -- so a part is claimed only when BOTH answers
# are available, and anything unrecognised falls to the body exactly as it does
# in the other rigs.
#
# THE TABLE IS THE WHOLE RIG, and it is deliberately a table rather than a set
# of prefix tests: this file's parts are named for what they ARE (a knee, a
# belt, a chest bar) rather than for the group they belong to, so the mapping
# is a fact about the model that has to be written down once, where it can be
# read, instead of inferred five times.
PLODDER_LIMBS = {
    # the leg, hip to sole
    "thigh": "leg", "knee": "leg", "shin": "leg", "ankleband": "leg",
    "boot": "leg", "toeplate": "leg",
    # the arm, shoulder to fist. The shoulder pad rides the arm rather than the
    # torso, which is what the humanoid rig does with a pauldron too.
    "shoulder": "arm", "upperarm": "arm", "forearm": "arm", "fist": "arm",
    # the head, which here includes the neck: it is a two-band collar between
    # the torso and the skull, and giving it a sixth matrix to bend 3% of a
    # 31 px silhouette is the cost the quadruped rig declined for the same part.
    "neck": "head", "head": "head", "faceplate": "head", "eye": "head",
    # everything else -- Pelvis, Belt, Torso, ChestPlate, ChestBar -- is the
    # body, and is left to `options.body_group` rather than listed here, so a
    # part this file gains later joins the torso instead of vanishing.
}


def plodder_group_of(part, options):
    """Which animated group a mesh belongs to, from its own NAME.

    Case-folded for the same reason the humanoid rig folds its chain: these
    files spell the sides `.L` where the game's own models spell them `_l`, and
    a rig should not fail on a capital letter.
    """
    name = part["name"].lower()

    # Blender appends `.001` to a duplicated name; that is a uniquifier, not a
    # side, so it comes off before anything else looks at the string. Doing it
    # here rather than in the caller keeps `Boot.L.001` a boot.
    while True:
        base, dot, tail = name.rpartition(".")
        if dot and tail.isdigit():
            name = base
            continue
        break

    base, dot, side = name.rpartition(".")
    if not dot or side not in ("l", "r"):
        base, side = name, ""

    role = PLODDER_LIMBS.get(base)
    if role is None:
        return options.body_group
    if role == "head":
        return "head"                   # the eyes are face, not fist
    if not side:
        return options.body_group       # a paired limb with no side is not one
    return role + "_" + side


# --- the Tyrant: a flat-named biped again, and Z-UP, and facing -Y ----------
#
# THE THIRD RIG TO BORROW THE HUMANOID'S PIVOTS AND CYCLE and the second to
# supply only a `group_of`. What is new here is not the gait, it is that
# `boss.glb` breaks BOTH conventions at once: it is authored Z-up, like the
# beacon, and it faces -Y, which nothing before it did. The beacon never
# exposed the second half because a radially symmetric spire has no front to
# get wrong; a Tyrant marched sideways down the road until `source_forward`
# existed. See the note in `build`.
#
# WHY THE NAMES CANNOT BE MATCHED THE PLODDER'S WAY. `slow.glb` names a part
# for the limb it is on and puts the side in a `.L`/`.R` suffix, so a base-name
# table answers everything. This file names parts for the MACHINE -- the arms
# are the `Hunter_` one and the `Windup_`/`Executioner_` one, not "left" and
# "right" -- so half the right arm carries no side token at all
# (`Windup_Charge_Ring_01`, `Executioner_Fist`). The side is read where it
# exists and the ARM is identified by which assembly it belongs to where it
# does not.
#
# THE ORDER OF THE TESTS IS LOAD BEARING, and two of them are traps:
#
#   * `Foot_Claw_Left_+0.00` carries "claw" AND "foot". The claws on the end of
#     a leg are not the claws on the end of the left arm. Feet are tested first.
#   * `Chest_Armor_Left` and `Phase2_Rib_Vent_Left_01` carry "left" and are
#     TORSO. A rule that read the side first and asked what the part was second
#     would tear the chest plating off and swing it from the shoulder.
#
# THE SHOULDERS ARE BODY, NOT PAULDRONS, which is where this rig departs from
# the humanoid's stated rule that a shoulder rides its arm. `Shoulder_Mass_Left`
# spans x -1.79..-0.41 against a torso half-width of 1.12 -- it is armour lying
# ACROSS the torso and the arm both, and swinging it with the arm opens a gap at
# its inboard edge on the widest body in the game. The arm swing is 0.55 of the
# leg angle, so the cost of leaving them still is nothing anyone can see.
TYRANT_LEG_PARTS = ("foot", "shin", "thigh", "knee")
TYRANT_ARM_PARTS = ("upper_arm", "forearm", "claw", "fist", "knuckle", "gauntlet")
TYRANT_HEAD_PARTS = ("neck", "helmet", "brow", "jaw", "sensor", "bezel",
                     "antenna", "mast")


def tyrant_group_of(part, options):
    """Which animated group a mesh belongs to, from its own NAME.

    Six groups: two legs, two arms, the head and the body that carries them.
    """
    name = part["name"].lower()
    side = "l" if "left" in name else ("r" if "right" in name else "")

    # Feet before claws; see the header.
    if any(key in name for key in TYRANT_LEG_PARTS):
        return ("leg_" + side) if side else options.body_group

    # Before the arm test, because a shoulder is torso armour on this body.
    if "shoulder" in name:
        return options.body_group

    # The right arm IS the windup/executioner assembly, and most of it never
    # says "right". Named as one thing, grouped as one thing.
    if name.startswith("windup_") or name.startswith("executioner_"):
        return "arm_r"

    if any(key in name for key in TYRANT_ARM_PARTS):
        return ("arm_" + side) if side else options.body_group

    # The head takes no side: the antennas and the three threat sensors are
    # face, and `Tracking_Antenna_Left` must not become an arm.
    if any(key in name for key in TYRANT_HEAD_PARTS):
        return "head"

    return options.body_group


def humanoid_pivot_of(name, points, refs):
    """Where a group turns, measured from what is in it.

    A limb hinges at its TOP -- the hip for a leg, the shoulder for an arm --
    and the head at its BASE, where the neck holds it. The body's joint is the
    one that is not read off its own points: it is the hip line, taken from the
    two legs, and it has to be, because the body's lean must not move the joints
    the legs are solved about. See `walk_cycle`.

    This is a JOINT, not the offset the geometry is stored at -- see the note
    above about `model.top`. The rig declares `origin_pivot`, so `build` keeps
    the points in world space and hands these to the cycle to turn about.
    """
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    if name in ("leg_l", "leg_r", "arm_l", "arm_r"):
        return [sum(xs) / len(xs), sum(ys) / len(ys), max(zs)]
    if name == "head":
        return [sum(xs) / len(xs), sum(ys) / len(ys), min(zs)]
    return refs.get("hip", [0.0, 0.0, 0.0])


# How far a foot lifts at the top of its swing, in model units. Enough to clear
# tools/check-gait-slip.js's 0.015 PLANT_BAND at every swing frame -- a foot
# that does not clear it reads to the instrument as a second plant, and to the
# eye as a body dragging its toes.
SWING_LIFT = 0.055
# The arms swing against the legs at this fraction of the leg's own angle. Taken
# off the SOLVED leg angle rather than from a sine of its own, so the two can
# never drift out of phase when the leg length changes and the solve answers
# differently.
ARM_SWING = 0.55
# A zombie does not stand up straight. A constant pitch of the whole body about
# the hip line, plus a small sway at footfall frequency.
BODY_LEAN = 0.10
BODY_SWAY = 0.035


def solve_hip_angles(points, joint, frames, window, cycle_units=CYCLE_UNITS,
                     about_rest=False):
    """The hip angle on each frame of a plant, so the sole does not slide.

    SOLVED, NOT TUNED, and it is a closed form rather than a search. The sole's
    centroid sits at (cx, cz) in the leg's own space, the hip at the origin; a
    pitch of theta about the side axis puts it at

        x(theta) = cx cos(theta) + cz sin(theta) = R cos(theta - phi)

    with R = hypot(cx, cz) -- the leg's reach -- and phi = atan2(cz, cx). The
    contact is fixed in the WORLD, so in the model's own space it must travel
    backward by one frame's share of CYCLE_UNITS per frame held; inverting the
    line above gives the angle that puts it exactly there. The sole centroid is
    what `tools/check-gait-slip.js` measures, so this solves the quantity that
    is graded rather than a proxy for it.

    The plant is centred on the rest pose (`anchor` is half the plant's travel)
    so the leg swings symmetrically about hanging straight down, which is what
    keeps the swing's reach and the plant's reach the same.

    `about_rest` CHANGES WHAT "THE REST POSE" MEANS, AND ONLY A SPLAYED BODY
    NEEDS IT. By default mid-plant puts the sole at x = 0 -- directly under the
    hip -- which is right for anything whose leg hangs straight down, and every
    shipped body does: the difference is 0.012 u on the zombie. A SPLAYED leg
    does not. The Harvester's front claws are authored 0.19 u ahead of their own
    shoulders and its rear claws 0.19 u behind, so solving for "sole under hip"
    silently rotates the front legs 27 degrees back and the rear legs 27 degrees
    forward on EVERY frame of every plant -- collapsing the stance the artist
    drew into a body standing on four legs tucked underneath it, and lifting the
    claws far enough that the re-plant has to jack the whole machine up to reach
    the road again. With it set, mid-plant is the pose in the FILE and the sweep
    is symmetric about that.

    It is not the default because it is not free: it spends the leg's forward
    reach on the splay it is preserving, so it needs `|cx| + anchor <= R` rather
    than `anchor <= R`, and a body already near its own extension limit cannot
    afford it. Both guards are checked below.
    """
    minz = min(p[2] for p in points)
    sole = [p for p in points if p[2] <= minz + SOLE_BAND]
    # Relative to the hip, because that is what the leg turns about. The
    # absolute placing of the sole is not part of the answer: what has to be
    # exact is the DIFFERENCE between one frame and the next.
    cx = sum(p[0] for p in sole) / len(sole) - joint[0]
    cz = sum(p[2] for p in sole) / len(sole) - joint[2]
    reach = math.hypot(cx, cz)
    phi = math.atan2(cz, cx)
    # HOW FAR THE BODY TRAVELS OVER THE FRAMES HANDED IN, which is the whole
    # cycle for a body that takes one step per leg per stride and a FRACTION of
    # it for one that takes several. A short-legged body cannot carry a plant
    # that is a large share of 0.899 u (see `MARCH_STEPS`), and taking two steps
    # in the distance another body takes one is a real answer to that rather
    # than a fudge -- the foot still goes back exactly as far as the road moves
    # under it, which is the only thing this solve is about.
    step = cycle_units / frames
    anchor = step * (len(window) - 1) / 2.0
    centre = cx if about_rest else 0.0
    if anchor > reach:
        raise ValueError("a leg of reach %.3f cannot carry a %.3f u plant; "
                         "shorten the plant window or grow the body"
                         % (reach, 2 * anchor))
    if abs(centre) + anchor > reach:
        raise ValueError("a leg of reach %.3f, splayed %.3f u from its own "
                         "hip, cannot carry a %.3f u plant about its rest pose"
                         % (reach, centre, 2 * anchor))
    out = {}
    for i, frame in enumerate(window):
        target = centre + anchor - i * step
        out[frame] = phi + math.acos(max(-1.0, min(1.0, target / reach)))
    return out, reach


def turn_about(joint, local):
    """A rotation (or any local transform) applied about a point in world space.

    T(J) . local . T(-J), which is what lets this rig store its geometry where
    it really is instead of offset to a joint. See the note above `model.top`.
    """
    return mat_multiply(
        mat_multiply(mat_translate(joint), local),
        mat_translate([-joint[0], -joint[1], -joint[2]]))


def leg_series(points, joint, frames, window, swing_lift=SWING_LIFT,
               swing_reach=0.0, cycle_units=CYCLE_UNITS, about_rest=False):
    """One leg's hip angle and swing lift on every frame of a cycle.

    THE PLANT IS SOLVED AND THE SWING IS INTERPOLATED, which is the whole of a
    leg: `solve_hip_angles` answers the half of the cycle that has a right
    answer, and the rest is the shortest path back to the start of the next
    plant.

    Swing frames run in CYCLE order from just after the plant ends, so the
    interpolation walks the leg forward the short way rather than unwinding it
    back through the plant it just finished. Built from the window rather than
    by filtering `range(frames)`, which would put them in index order and swing
    the leg backwards across the wrap.

    SHARED BY EVERY LEGGED RIG, and it has to be: a walk and a gallop differ in
    which frames a paw is down and in nothing else about the leg. Two copies of
    this would let one of them drift into a gait that skates while
    `check-gait-slip.js` still reads zero on the other.

    `swing_reach` IS WHAT A SHORT CONTACT COSTS AND HOW IT IS PAID BACK. The
    plant sweep is not a style choice -- it is exactly the ground the body
    covers while that paw is down, so shortening the contact to a quarter of the
    cycle shortens the leg's arc to a quarter as well, and a gallop animated
    without anything else would swing its legs LESS than the walk it replaced.
    A real gallop buys its reach in the AIR: the leg protracts well ahead of
    where it will land, then settles back onto the touchdown angle. So this adds
    a forward overshoot of `swing_reach` times the plant's own sweep, peaking at
    mid-swing and zero at both ends -- it cannot move a touchdown or a liftoff
    angle, and it is spent entirely on frames no instrument grades, because a
    foot in the air has nothing to slip against. Default 0 keeps the walker's
    output byte-identical.
    """
    plant, _reach = solve_hip_angles(points, joint, frames, window, cycle_units,
                                     about_rest)
    swing = [(window[-1] + 1 + i) % frames for i in range(frames - len(plant))]
    theta_out = plant[window[-1]]
    theta_in = plant[window[0]]
    # Increasing theta carries the foot BACKWARD (the sole hangs below the hip,
    # so a positive pitch about the side axis sweeps it to -x), which is why the
    # overshoot is subtracted rather than added.
    reach = swing_reach * (theta_out - theta_in)
    series = dict(plant)
    lift = {}
    for i, frame in enumerate(swing):
        u = (i + 1) / float(len(swing) + 1)
        ease = 0.5 - 0.5 * math.cos(math.pi * u)
        series[frame] = (theta_out + (theta_in - theta_out) * ease
                         - reach * math.sin(math.pi * u))
        lift[frame] = swing_lift * math.sin(math.pi * u)
    return series, lift


def plant_leg(points, joint, series, lift, frame, follow=0.0):
    """Turn a leg to its solved angle and put the sole back on the road.

    Whatever the rotation lifted the group's lowest point to, take it straight
    back down, and add the swing lift on the frames that are not carrying
    weight. A translation along z cannot undo a rotation's travel in x, which
    is why the re-plant and the solve do not fight -- see `walk_cycle`.

    `follow` IS HOW A LEG STAYS ATTACHED TO A BODY THAT MOVES. A planted foot
    belongs to the ROAD and an airborne one belongs to the ANIMAL, so a body
    that rises through a suspension phase must carry its swinging legs with it
    and must not carry its planted ones. The caller passes the vertical
    displacement of this leg's own joint, measured through the body's own
    transform, and passes it only on swing frames. Zero by default: a walker's
    body neither leaves the ground nor pitches far enough for its hips to move.
    """
    return set_down(points, joint, mat_rotate("y", series[frame]),
                    lift.get(frame, 0.0) + follow)


def set_down(points, joint, local, raise_by=0.0):
    """Pose a limb about its joint and put its LOWEST POINT back on the road.

    The half of `plant_leg` that is not about a solved angle, pulled out
    because a skate needs it and has no solved angle at all -- see
    `vanguard_skate_cycle`. `plant_leg` is written in terms of it and its
    arithmetic is unchanged, which the byte-identity check on the seven
    single-cycle imports is what proves.

    A translation along z cannot undo a rotation's travel in x, so this cannot
    fight whatever put the limb where it is: it only ever answers "and now sit
    it on the ground".
    """
    placed = turn_about(joint, local)
    low = min(mat_apply(placed, p)[2] for p in points)
    return mat_multiply(mat_translate([0.0, 0.0, -low + raise_by]), placed)


def walk_cycle(groups, frames, geometry, joints, options=None):
    """The pose of every group on every frame of one walk cycle.

    THE LEGS ARE SOLVED AND THE REST IS AUTHORED, which is the whole shape of
    this function. A wrong arm swing is a taste; a wrong leg swing is a body
    skating down the road, and it is the one thing here that has a right answer.

    THE PLANT WINDOWS ARE HALF THE CYCLE EACH, offset by half, which is a walk
    rather than a run: there is no frame with both feet in the air. `leg_l`
    starts its plant three quarters of the way round so that frame 0 -- the pose
    a stopped body holds, and the one every still capture shows -- falls in the
    middle of a stride rather than at its extreme.

    RE-PLANTING IN Z IS A SEPARATE SOLVE FROM THE ANGLE IN X, and they do not
    fight: the angle is a rotation about the hip and the re-plant is a
    translation along z, so setting the sole back down cannot move it forward.
    Without it a pendulum leg lifts its own foot by reach*(1-cos theta) at the
    ends of the plant -- 0.027 u here, nearly twice the instrument's plant band
    -- and a foot that is off the ground is not a foot that is planted.

    THE BODY'S LEAN IS APPLIED TO THE HEAD AND ARMS TOO, as a world transform
    composed on top of their own poses, so the shoulders and the neck ride the
    torso instead of hanging in the air behind it. It is NOT applied to the
    legs: their pivots sit on the body's own rotation axis (see
    `humanoid_pivot_of`), so the lean does not move the hips, and leaving the
    legs out of it keeps the solve above exactly true rather than nearly true.
    """
    half = frames // 2
    start_l = frames - frames // 4
    window_l = [(start_l + i) % frames for i in range(half)]
    window_r = [(start_l + half + i) % frames for i in range(half)]
    windows = {"leg_l": window_l, "leg_r": window_r}

    # Solve each leg once, then read the answer per frame below.
    angles = {}
    for name in ("leg_l", "leg_r"):
        if name not in geometry:
            continue
        angles[name] = leg_series(geometry[name], joints[name], frames,
                                  windows[name])

    hip = joints.get("hip")

    poses = []
    for f in range(frames):
        t = f / float(frames)
        slow = t * 2 * math.pi              # once per cycle
        fast = slow * 2                     # once per footfall
        pitch = BODY_LEAN + BODY_SWAY * math.sin(fast)
        # The body's transform in WORLD space, about the hip line, so it can be
        # composed onto anything that has to ride it.
        carry = turn_about(hip, mat_rotate("y", pitch)) if hip else IDENTITY
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)
                continue
            joint = joints[name]
            ride = False
            if name in angles:
                series, lift = angles[name]
                placed = plant_leg(geometry[name], joint, series, lift, f)
            elif name in ("arm_l", "arm_r"):
                # Against the leg on the same side, which is what an arm does.
                leg = "leg_l" if name == "arm_l" else "leg_r"
                swing = -ARM_SWING * angles[leg][0][f] if leg in angles else 0.0
                placed = turn_about(joint, mat_rotate("y", swing))
                ride = True
            elif name == "head":
                placed = turn_about(joint, mat_multiply(
                    mat_rotate("y", 0.05 * math.sin(fast)),
                    mat_rotate("x", 0.07 * math.sin(slow))))
                ride = True
            else:
                placed = carry
            pose.append(mat_multiply(carry, placed) if ride else placed)
        poses.append(pose)
    return poses


# --- a four-legged runner's rig ---------------------------------------------
#
# THE SAME THREE THINGS AGAIN, for a body that runs on all four. `fast.glb`
# ships the hierarchy this wants -- `torso`, `neck`, `head`, `leg_fl`, `leg_fr`,
# `leg_bl`, `leg_br`, `tail` under one root, every transform baked into the
# vertices -- so the names are once more the whole rig and every pivot is
# measured.
#
# SEVEN GROUPS: four legs, the head, the tail, and the body that carries the
# rest. The neck goes in the BODY rather than getting a group of its own: it is
# four segments of collar between two things that do move, its own bend would be
# 3 % of a 38 px silhouette, and a seventh matrix per hound is not free on a
# wave that is nothing but hounds. The tail DOES get one, because it is a third
# of the body's length and a quadruped that runs with a dead tail reads as a
# prop being slid along the road.
#
# WHAT A QUADRUPED CHANGES ABOUT THE SOLVE: nothing. `leg_series` puts a paw
# where distance-driven frames require it exactly as it does a boot, and this
# rig differs from the biped only in WHICH frames each foot is down. That is the
# whole content of a gait, and it is why the two cycles share the solver rather
# than each owning one.

def quadruped_group_of(part, options):
    """Which animated group a mesh belongs to, from its ancestry.

    Matched on the LIMB -- the child of the model root -- so everything bolted
    to a limb travels with it: the knee glow rides the shin, the claws ride the
    paw, the teeth ride the skull and the back plates ride the spine. Case
    folded for the same reason the humanoid folds: a rig should not fail on a
    capital letter.
    """
    chain = part["chain"]
    limb = (chain[1] if len(chain) > 1 else part["name"]).lower()
    if limb.startswith("leg_"):
        # The individual leg, never the pair: four legs on one matrix is a
        # table, not an animal.
        return limb
    if limb in ("head", "tail"):
        return limb
    return options.body_group


def quadruped_pivot_of(name, points, refs):
    """Where a group turns, measured from what is in it.

    A leg hinges at its TOP, which is the shoulder in front and the hip behind
    -- the same measurement either way, so the rig does not need to know which
    end of the animal a leg is at. The HEAD hinges at the back of the skull,
    where the neck holds it, and the TAIL at its root, where it leaves the
    haunch: on a body whose forward axis is +x those are the head's minimum x
    and the tail's maximum x, each at its own mid height.

    THE HEAD AND TAIL PIVOTS ARE THE MIRROR OF EACH OTHER AND THAT IS THE
    POINT. Both are cantilevers off the spine, hinged at the end that touches
    it; hinging either at its centroid would swing its root through the body it
    is attached to.

    The body's joint is the one not read off its own points: the SPINE LINE,
    the mean of all four leg joints, and it has to be, or the body's pitch would
    move the very joints the legs are solved about. See `run_cycle`.
    """
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    if name.startswith("leg_"):
        return [sum(xs) / len(xs), sum(ys) / len(ys), max(zs)]
    if name == "head":
        return [min(xs), sum(ys) / len(ys), sum(zs) / len(zs)]
    if name == "tail":
        return [max(xs), sum(ys) / len(ys), sum(zs) / len(zs)]
    return refs.get("hip", [0.0, 0.0, 0.0])


# THE FOOTFALL ORDER IS THE GAIT, and this one is a transverse gallop: both
# hind paws, then both fore, each pair split by a beat, as a fraction of one
# cycle. A trot -- diagonals in lockstep, two phases -- is the easier animation
# and the wrong one here: it is a symmetrical gait with no suspension to animate
# and it is exactly what a viewer calls "a fast walk".
GALLOP_PHASE = {"leg_bl": 0.0, "leg_br": 0.125,
                "leg_fl": 0.4375, "leg_fr": 0.5625}
# The share of the cycle each paw spends on the road, and THE ONE NUMBER THAT
# DECIDES WHETHER THIS IS A RUN. The walker holds each boot down for half the
# cycle precisely so that no frame has both feet in the air; a gallop is the
# gait that gives that up. At a quarter, the four windows above (16 frames:
# 0-3, 2-5, 7-10, 9-12) leave frame 6 and frames 13-15 with NOTHING on the
# road -- the gathered suspension after the hinds push off and the extended one
# after the fores do. A quarter of the cycle airborne is what separates the two
# gaits to the eye; at the 0.44 this rig shipped with first, the windows
# overlapped end to end and there was never a moment of flight to see.
RUN_DUTY = 0.25
# How far a paw lifts at the top of its swing. Well clear of
# check-gait-slip.js's 0.015 PLANT_BAND on the first and last swing frame, which
# is what keeps a swinging paw from being read as a second plant.
RUN_LIFT = 0.10
# How far the leg protracts PAST its own touchdown angle at mid-swing, as a
# fraction of the plant's sweep. See `leg_series`: a short contact buys a short
# plant arc, and the reach a gallop reads by is bought back in the air.
RUN_REACH = 0.85
# THE BODY RIDES THE GAIT, and both of these are derived from the windows above
# rather than run off a sine of their own -- see `airborne_lift` and `pitch_at`.
# The rise happens only while nothing is on the road, and the pitch turns once
# per cycle (not twice, which is a trot's rhythm), nose down under the fore
# pair and nose up as the hinds drive.
BODY_RISE = 0.055
BODY_PITCH = 0.14
# The tail streams out behind, counters the body's pitch and sweeps once per
# cycle, so it reads as a counterweight rather than as something buzzing at
# footfall rate.
TAIL_LIFT = 0.12
TAIL_SWEEP = 0.20
TAIL_COUNTER = 1.35
# The head is held LEVEL against the body's own pitch, which is what a running
# animal actually does with its eyes, plus a nod of its own once per cycle.
HEAD_NOD = 0.045


def plant_windows(frames, names, phase, duty):
    """Which frames each foot is on the road, from a phase table and a duty.

    THE GAIT IS THIS TABLE AND NOTHING ELSE -- `leg_series` asks the same
    question of every leg whatever it is attached to, so a gallop and a walking
    machine's creep differ only in what comes out of here. Shared for the same
    reason the solver is: two copies would let one gait drift into a stride that
    skates while the instrument still reads zero on the other.

    Returned for the legs that actually exist, so a three-legged source cannot
    silently acquire a fourth window with no geometry under it.
    """
    hold = max(2, int(round(duty * frames)))
    out = {}
    for name in names:
        start = int(round(phase[name] * frames)) % frames
        out[name] = [(start + i) % frames for i in range(hold)]
    return out


def airborne_lift(frames, windows, height):
    """How high the whole animal rides on each frame, TAKEN FROM THE GAIT.

    A quadruped does not bob on a sine; it rises when nothing is holding it
    down. So this reads the plant windows, finds the runs of frames with no paw
    on the road, and eases a rise over each one -- zero at both ends, so the
    body is back at its resting height on the exact frame a paw lands. The two
    suspensions of a gallop are different lengths and this gives each the rise
    its own length earns, which no hand-phased sine would do.

    THE REAL POINT IS THAT IT CANNOT DISAGREE WITH THE FOOTFALLS. Retune
    `RUN_DUTY` or a phase and the body follows; a sine would keep its old timing
    and put the animal at the top of its arc with a paw planted on the road.

    The scan starts on a SUPPORTED frame so that a suspension spanning the wrap
    is one run rather than two -- the same argument check-gait-slip.js makes
    about plant spans, and the same place an eye-authored curve gets it wrong.
    """
    down = [False] * frames
    for window in windows.values():
        for f in window:
            down[f] = True
    lift = [0.0] * frames
    if not any(down) or all(down):
        return lift
    start = 0
    while not down[start]:
        start += 1
    run = []
    for f in [(start + i) % frames for i in range(frames)] + [None]:
        if f is not None and not down[f]:
            run.append(f)
            continue
        for i, held in enumerate(run):
            lift[held] = height * math.sin(math.pi * (i + 1) / (len(run) + 1))
        run = []
    return lift


def fore_centre(frames, windows):
    """The point in the cycle the FORE pair is carrying, as a fraction.

    The body's pitch is phased off this rather than off frame 0, because frame 0
    is an index and the forehand landing is an event. Mean of the fore windows'
    own midpoints; falls back to half a cycle if a rig has no fore legs, which
    keeps this honest for a two-legged caller rather than dividing by zero.
    """
    mids = [w[0] + (len(w) - 1) / 2.0
            for name, w in windows.items() if name.startswith("leg_f")]
    if not mids:
        return 0.5
    return (sum(mids) / len(mids)) / float(frames)


def run_cycle(groups, frames, geometry, joints, options=None):
    """The pose of every group on every frame of one gallop.

    FOUR LEGS, FOUR PHASES, ONE SOLVER. Each paw's plant window is `RUN_DUTY` of
    the cycle starting at its own `GALLOP_PHASE`, and `leg_series` then answers
    the same question for each of them that it answers for a biped's boot: what
    hip angle puts this sole where distance-driven frames require it. Nothing
    about the gait reaches into the solve; the gait IS the four windows.

    THE BODY IS DRIVEN BY THE SAME WINDOWS AS THE LEGS. Its rise comes from the
    frames with nothing on the road (`airborne_lift`) and its pitch is phased
    off the forehand's own landing (`fore_centre`), so the three cannot drift
    apart when the gait is retuned. That is the difference between a body that
    is galloping and a body that is rocking while its legs gallop underneath it.

    A LEG FOLLOWS THE BODY'S RISE AND ONLY WHILE IT IS IN THE AIR. A planted paw
    belongs to the road: it must not climb with the chest, or the solve above is
    exactly undone. An airborne one belongs to the animal, and since the rise is
    non-zero only on frames where NOTHING is planted, every leg is swinging on
    every frame it applies to -- the whole body leaves the ground together, which
    is the one moment the attachment is worth 1.8 px of chest travel.

    THE PITCH IS DELIBERATELY NOT FOLLOWED, and that is a trade with a measured
    price on both sides. It moves each joint by up to 0.04 u (1.25 px at scale 1
    on a body this long), which is hidden: a thigh joint sits inside the
    shoulder or haunch cowl, so the two overlap slightly instead of parting.
    Following it costs far more than it buys, because half the time the joint
    moves DOWN -- the haunch drops as the nose comes up -- and it drags the paw
    that has just left the road back into it. Measured, with the pitch followed:
    a swinging paw sank to 0.004 u and `check-gait-slip.js` read **2.946 px** of
    gait error on two of the four legs, against 0.000 with it left out. An
    invisible overlap is a better defect than a visible skim, and it is a far
    better one than an instrument that reports this body as sliding.
    """
    names = [n for n in GALLOP_PHASE if n in geometry]
    windows = plant_windows(frames, names, GALLOP_PHASE, RUN_DUTY)
    angles = {}
    for name in names:
        angles[name] = leg_series(geometry[name], joints[name], frames,
                                  windows[name], RUN_LIFT, RUN_REACH)

    rise = airborne_lift(frames, windows, BODY_RISE)
    centre = fore_centre(frames, windows)
    spine = joints.get("hip")

    poses = []
    for f in range(frames):
        t = f / float(frames)
        slow = t * 2 * math.pi              # once per cycle
        # Nose DOWN while the forehand carries, nose up half a cycle later as
        # the hinds drive. A rotation about +y tips whatever is ahead of the
        # spine downward, so the sign is the cosine's own.
        pitch = BODY_PITCH * math.cos(2 * math.pi * (t - centre))
        carry = IDENTITY
        if spine:
            carry = mat_multiply(
                mat_translate([0.0, 0.0, rise[f]]),
                turn_about(spine, mat_rotate("y", pitch)))
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)
                continue
            joint = joints[name]
            ride = False
            if name in angles:
                series, lift = angles[name]
                # In the air this frame? Then climb with the body. `lift` is
                # keyed by swing frame, so it is also the record of which frames
                # this paw is off the road -- and `rise` is non-zero only where
                # no paw is on it, so this can never lift a planted one.
                follow = rise[f] if f in lift else 0.0
                placed = plant_leg(geometry[name], joint, series, lift, f,
                                   follow)
            elif name == "head":
                placed = turn_about(joint, mat_multiply(
                    mat_rotate("y", -pitch + HEAD_NOD * math.sin(slow)),
                    mat_rotate("z", 0.05 * math.sin(slow))))
                ride = True
            elif name == "tail":
                placed = turn_about(joint, mat_multiply(
                    mat_rotate("y", TAIL_LIFT - TAIL_COUNTER * pitch),
                    mat_rotate("z", TAIL_SWEEP * math.sin(slow))))
                ride = True
            else:
                placed = carry
            pose.append(mat_multiply(carry, placed) if ride else placed)
        poses.append(pose)
    return poses


# --- a walking machine's rig -------------------------------------------------
#
# A GROUPING, A SET OF PIVOTS AND A CYCLE, for a body that is neither an animal
# nor a person. `midboss.glb` is a four-legged salvage walker: a riveted chassis
# on four splayed clawed legs, two manipulator arms slung off the front, and a
# turret head with a single lens. It walks, so the solver above is the right one
# -- what is different is everything around the legs.
#
# EIGHT GROUPS: four legs, two arms, the turret, and the chassis that carries
# the rest. That is one more matrix per body than the hound and it is affordable
# for exactly one reason: ONE Harvester walks in, alone, on wave 11. A group per
# arm would be indefensible on a swarm type and is the whole point here, because
# the arms are what the owner asked to move independently of the walk.
#
# WHAT THIS RIG HAS THAT NO OTHER ONE DOES, and why each is derived rather than
# dialled:
#
#   * THE GROUPING CANNOT BE READ OFF THE NAMES. This source gives all four legs
#     the node name `leg` and both arms `manipulator_arm`. See
#     `walker_group_of`.
#   * TWO STEPS PER STRIDE (`MARCH_STEPS`), because these legs are far too short
#     to carry a whole stride in one plant. Read that constant before anything
#     else here: it is the decision the rest of the gait is shaped around.
#   * THE PLANT IS CENTRED ON THE POSE IN THE FILE, not under the hip
#     (`solve_hip_angles(about_rest=)`), because this body is SPLAYED and the
#     default would rotate the splay out of it on every frame.
#   * THE CHASSIS RIDES DOWN ON ITS OWN LEGS (`stance_drop`). A rigid leg does
#     not hold its shoulder at one height above its own claw through a sweep, so
#     a body that ignores that slides its legs through their sockets. This is a
#     partial fix for a defect the biped and the quadruped both carry and hide.
#   * THE ROLL COMES FROM WHICH FEET ARE DOWN (`support_roll`), so the "weight
#     shifting between leg pairs" the owner asked for cannot disagree with the
#     footfalls that are supposed to be causing it.
#   * THE LURCH IS PHASED OFF A FRONT CLAW'S OWN LANDING (`lurch_series`).
#   * THE ARMS AND THE TURRET RUN ON THE STRIDE WHILE THE LEGS RUN ON THE STEP,
#     which is what keeps a twitch reading as sensing rather than as walking.


def walker_group_of(part, options):
    """Which animated group a mesh belongs to -- from its ancestry AND from
    WHERE IT IS.

    THE ONE RIG THAT CANNOT READ ITS LIMBS OFF THE NAMES ALONE, because this
    source does not give them different ones: the scene holds four sibling nodes
    all called `leg` and two all called `manipulator_arm`, each with its
    transform baked into its vertices. The hierarchy still says WHICH KIND of
    limb a mesh is on -- that is what the chain gives -- and the geometry says
    which one, which is the only place that survives.

    So a limb is placed by the SIGN of its own centroid in the two board axes:
    +x is forward (`build` remaps glTF Z to it) and +y is left. `build` centres
    the body in plan BEFORE calling this, so both signs are taken against the
    machine's own centre line rather than against whatever origin the file was
    authored around.

    A mesh cannot straddle a sign here: every part under one `leg` node belongs
    to that leg, and the parts that DO straddle the centre line -- the chassis
    deck, the skid plate, the exhaust stacks -- are the ones that fall through
    to the body group anyway.
    """
    chain = part["chain"]
    limb = (chain[1] if len(chain) > 1 else part["name"]).lower()
    points = [p for tri in part["triangles"] for p in tri[0]]
    if not points:
        return options.body_group
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    if limb.startswith("leg"):
        # The individual leg, never a pair: four legs on one matrix is a table.
        return "leg_%s%s" % ("f" if cx >= 0 else "b", "l" if cy >= 0 else "r")
    if limb.startswith("manipulator_arm") or limb.startswith("arm"):
        return "arm_l" if cy >= 0 else "arm_r"
    if limb.startswith("turret"):
        return "turret"
    return options.body_group


# How thick a slice counts as the end of a limb, in model units. Same order as
# SOLE_BAND and for the same kind of reason: a joint is a measurement off the
# geometry that meets it, and the ball that meets it is about this deep.
JOINT_BAND = 0.02


def _cap_centre(points, band, top):
    """The plan centre of a group's topmost (or lowest) slice.

    WHY NOT THE CENTROID, WHICH IS WHAT THE OTHER RIGS USE. A hound's thigh is a
    column and its centroid is under its own hip; this machine's legs are
    SPLAYED, so a leg's centroid sits 0.138 u outboard and forward of the ball
    it actually hangs from. Turning a splayed leg about its centroid swings the
    shoulder ball itself through an arc -- 0.099 u over this body's own 41
    degree plant sweep, 5.7 px at its size, of the ball travelling out of the
    socket it is supposed to be turning inside.

    The ball is the topmost thing in a leg group and the bearing is the lowest
    thing in a turret, so the end slice is where the joint is, and its plan
    centre is the axis. Measured, like every other pivot in this file.
    """
    edge = (max(p[2] for p in points) - band) if top \
        else (min(p[2] for p in points) + band)
    cap = [p for p in points if (p[2] >= edge if top else p[2] <= edge)]
    return [sum(p[0] for p in cap) / len(cap),
            sum(p[1] for p in cap) / len(cap)]


def walker_pivot_of(name, points, refs):
    """Where a group turns, measured from what is in it.

    A LEG hangs from its shoulder ball and an ARM from its shoulder housing --
    the top of each, found by `_cap_centre` rather than by a centroid. The
    TURRET turns on the ring it sits on, so its axis is the plan centre of its
    own base.

    THE TURRET'S AXIS IS THE ONE APPROXIMATION IN THIS RIG AND IT IS BOUNDED.
    Its lowest slice is not the ring but the JAW's teeth, which hang 0.02 u
    below it and sit forward of the axis, so the plan centre of that slice is
    0.15 u out. The plan centre of the whole head's EXTENT is 0.031 u from the
    ring's true centre instead, and at the scan angle below that is 0.003 u of
    lateral wobble -- a tenth of a pixel on the board. Taken rather than reading
    a node name, because a rig that hardcodes `turret_ring` only works on files
    that spell it that way.

    The chassis's joint is the one not read off its own points: the SHOULDER
    LINE, the mean of the four leg joints, and it has to be, or the chassis's
    roll and pitch would move the very joints the legs are solved about.
    """
    if name.startswith("leg_") or name.startswith("arm_"):
        centre = _cap_centre(points, JOINT_BAND, True)
        return [centre[0], centre[1], max(p[2] for p in points)]
    if name == "turret":
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return [(min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0,
                min(p[2] for p in points)]
    return refs.get("hip", [0.0, 0.0, 0.0])


# TWO STEPS PER STRIDE, AND THIS IS THE NUMBER THE WHOLE GAIT TURNS ON.
#
# Every other body in this file takes ONE step per leg per stride: 0.899 u of
# road passes under it and each foot plants once. That is a choice about the
# ANIMATION and not a rule of the format -- gl-world.js only requires the frame
# list to repeat over one stride -- and it is the wrong choice for this body,
# because the Harvester's legs are far too short for it. Measured: the claw
# hangs 0.408 u from its shoulder ball, and a single plant at this duty would
# ask that leg to sweep an arc of 83 degrees, digging the front claw 0.156 u
# through the road at one end of it and jacking the chassis 0.136 u into the air
# at the other. That is not a stride, it is a machine tearing itself apart.
#
# At two steps the same road passes under it in two identical half-cycles, each
# foot plants twice, and every quantity above falls by more than half. The
# frame list still covers exactly one stride, so a planted claw still goes back
# EXACTLY as far as the road moves under it -- `solve_hip_angles` is handed
# `CYCLE_UNITS / MARCH_STEPS` and answers the same question it always answers.
#
# It is also the right picture. A thing with short legs and a long body takes
# short steps; the alternative was a 40-tonne salvage rig doing the splits.
MARCH_STEPS = 2
# THE FOOTFALL ORDER IS THE GAIT, AND THIS ONE IS AN AMBLE -- the lateral
# sequence, which is what the heaviest things that walk actually use, and the
# opposite end of the ladder from the hound's gallop. Phases are given within
# ONE step (see MARCH_STEPS), as the point the plant begins.
#
# Front left, then back left a beat later, then front right, then back right:
# on each side the front leg reaches out and plants, and the rear leg drags up
# after it. That is the owner's description of this body written as four
# numbers, and the 0.12 is the drag -- the rear claw follows its own front one
# rather than moving with it.
#
# WHY THE SIDES ARE HALF A CYCLE APART AND NOT PAIRED FRONT-TO-BACK. A pairing
# that lifts both front legs together and then both rear ones is the reading the
# words alone suggest, and it CANNOT produce the next sentence of them: with
# four legs at any duty, front-and-rear pairing keeps one foot down on each side
# at every instant, the support is balanced left to right on every frame, and
# `support_roll` correctly derives no roll at all. The body cannot rock side to
# side because nothing is ever shifting side to side. The lateral sequence puts
# both left feet down together for part of the cycle and both right feet for
# another -- which IS the weight shifting between leg pairs, and is why an
# ambling elephant rolls the way it does.
MARCH_PHASE = {"leg_fl": 0.0, "leg_bl": 0.12, "leg_fr": 0.5, "leg_br": 0.62}
# The share of one step each claw spends on the road. The hound gives up ground
# contact entirely (0.25, with two suspensions); the biped holds exactly half so
# that something is always down. This holds MORE than half, which no shipped
# body does: 4 x 0.6 = 2.4 feet down on average, alternating three and two, so
# there is never a frame with fewer than two claws on the road and most frames
# have three. A body that could not be knocked over is the whole of
# "inexorable", and it is bought here rather than asserted.
MARCH_DUTY = 0.6
# How far a claw lifts at the top of its swing, front and rear. TWO NUMBERS
# BECAUSE THE OWNER ASKED FOR TWO MOTIONS: the front pair "extends forward and
# plants firmly" and the rear pair "drags and resets". A dragged foot is a foot
# that barely clears, and the difference is the whole of that reading.
#
# The floor under both is `tools/check-gait-slip.js`'s 0.015 PLANT_BAND, which a
# swinging claw must clear on its FIRST and LAST swing frame or the instrument
# grades it as a second plant. At 32 frames, two steps and this duty the swing
# is six frames, so the first sits at sin(pi/7) = 0.434 of the peak: 0.020 u for
# the dragging rear pair, a third clear of the band. The instrument is what
# confirms that, not this paragraph.
MARCH_LIFT = {"f": 0.075, "b": 0.046}
# An amble does not protract past its own touchdown: it plants where it reached.
MARCH_REACH = 0.0
# HOW FAR THE CHASSIS LEANS ONTO THE FEET THAT ARE CARRYING IT, in radians at
# full imbalance -- and on this gait it reaches full imbalance, twice a step,
# because the amble puts both left claws down together and then both right ones.
# Measured on the shipped frames: +-5.0 degrees, which lifts the outer edge of a
# 0.72 u half-width chassis by 0.063 u -- 3.6 px at this body's size, 7.2 px
# between the extremes. Enough to see on a body 82 px wide, and short of the
# angle at which a rocking machine starts to look like a falling one.
BODY_ROCK = 0.09
# THE LURCH. How far the chassis rides ahead of and behind its own average
# position, in model units, and how much of the cycle it spends shoving rather
# than gathering. The planted legs do NOT follow it -- a foot belongs to the
# road -- so this is the body moving over its feet, which is what a lurch is.
#
# 0.035 u is 2.0 px at this body's size, 4.0 px peak to peak, against a stride
# of 51.5 px. The price is paid at the shoulder balls, which the chassis slides
# over by that much: the ball is 0.065 u across and sits under the chassis skirt,
# so at 0.035 it stays covered. Twice this and the joint opens up.
BODY_SURGE = 0.035
SURGE_PUSH = 0.35
# The nose dips as it shoves and comes up as it gathers, in radians at the
# lurch's peak rate. Taken from the SURGE's own rate of change rather than from
# a sine of its own, so a retuned lurch cannot leave the pitch behind.
BODY_DIP = 0.045
# The head sweeps once per cycle, looking for the way ahead. Small: a turret
# that swings hard reads as a body searching, and this one is supposed to have
# already decided.
TURRET_SCAN = 0.09
# THE ARMS DO NOT SWING. The owner was explicit -- they are rigid and angular,
# and they REPOSITION rather than swaying, "as if the unit is constantly sensing
# its path". So an arm holds its authored pose, and once per cycle it snaps to
# an offset, holds it, and snaps back: a servo, not a pendulum. See
# `twitch_series` for why that is ramps and holds rather than an ease.
#
# The two arms twitch at different points in the cycle and never together --
# two arms moving at once is a gesture, and one moving alone is a machine
# checking something.
ARM_TWITCH_AT = {"arm_l": 0.30, "arm_r": 0.72}
ARM_TWITCH_SNAP = 0.05                  # cycle spent travelling, each way
ARM_TWITCH_HOLD = 0.12                  # cycle spent at the offset
ARM_TWITCH_YAW = 0.15                   # rad, swept across the road
ARM_TWITCH_LIFT = 0.10                  # rad, raised as it goes


def support_roll(frames, windows, joints, amount):
    """How far the chassis leans on each frame, TAKEN FROM THE FEET.

    A body does not rock on a sine; it rocks because its weight is over the feet
    that are down. So this counts the planted legs on each side of the centre
    line and leans that way -- +-1 when a side carries alone, +-0.5 at this
    gait's three-foot stances, 0 whenever the supports are balanced.

    THE REAL POINT IS THAT IT CANNOT DISAGREE WITH THE FOOTFALLS. Retune
    `MARCH_DUTY` or a phase and the roll follows, including all the way to
    nothing at a duty of exactly 0.5, where the supports really are balanced on
    every frame and a rocking body would be rocking for no reason. A sine would
    keep its old timing and lean the machine onto a foot that is in the air.

    SMOOTHED TWICE, CIRCULARLY, because a support count is a step function and a
    forty-tonne chassis is not. The filter is symmetric, so it moves no phase --
    the lean still peaks where the imbalance does, it just takes a frame to get
    there and cannot snap between two frames.
    """
    lean = []
    for f in range(frames):
        left = right = 0
        for name, window in windows.items():
            if f not in window:
                continue
            if joints[name][1] >= 0:
                left += 1
            else:
                right += 1
        lean.append(max(-1.0, min(1.0, (left - right) / 2.0)))
    for _pass in range(2):
        lean = [(lean[(f - 1) % frames] + 2 * lean[f] +
                 lean[(f + 1) % frames]) / 4.0 for f in range(frames)]
    # Positive x is forward and positive y is left, so a positive roll about the
    # forward axis lifts the LEFT side -- and leaning onto the left feet means
    # dropping that side. Hence the sign.
    return [-amount * v for v in lean]


def lurch_series(frames, phase, names, amount, push):
    """How far ahead of itself the chassis is on each frame.

    PHASED OFF A FRONT CLAW'S OWN LANDING, not off frame 0: the owner's
    description is a sequence -- "the front pair of legs extends forward and
    plants firmly, THEN the body lurches ahead while the rear legs drag" -- and
    the event it hangs off is the moment a front claw takes weight. Frame 0 is
    an index; that is an event, and it moves if the phase table does.

    ONE SHOVE PER FRONT FOOTFALL, which on this gait is two per step: the two
    front legs land half a step apart (see MARCH_PHASE) and the body is driven
    forward by each side in turn, so a single shove per step would be a body
    lurching off one side and drifting through the other. Built by finding the
    most recent front landing and measuring the interval to the next, so the
    shove keeps its shape whatever the phase table says and however many front
    legs a body has.

    ASYMMETRIC ON PURPOSE, which is the difference between a lurch and a sway.
    The shove takes `push` of that interval and the gather takes the rest, so
    the chassis is thrown forward and then creeps back under itself. Both halves
    are raised cosines, which meet at value +1 and slope 0 at the join and at
    -1 and slope 0 at the wrap, so the curve is smooth all the way round despite
    being built from two pieces of different lengths.
    """
    fore = sorted(phase[n] % 1.0 for n in names if n.startswith("leg_f"))
    if not fore:
        fore = [0.0]
    out = []
    for f in range(frames):
        t = f / float(frames)
        # The landing at or before t, and the one after it, both cyclically.
        prev = max([p for p in fore if p <= t] or [fore[-1] - 1.0])
        nxt = min([p for p in fore if p > t] or [fore[0] + 1.0])
        u = (t - prev) / (nxt - prev)
        if u < push:
            out.append(amount * -math.cos(math.pi * u / push))
        else:
            out.append(amount * math.cos(math.pi * (u - push) / (1.0 - push)))
    return out


def rate_of(series, amount):
    """A series' own rate of change, normalised to peak `amount`.

    What the chassis's pitch is made of. A machine dips its nose when it shoves
    and lifts it when it gathers, and both are accelerations of the lurch rather
    than events of their own -- so this reads the lurch instead of running a
    second curve beside it that could fall out of step with it.
    """
    n = len(series)
    d = [(series[(f + 1) % n] - series[(f - 1) % n]) / 2.0 for f in range(n)]
    peak = max(abs(v) for v in d) or 1.0
    return [amount * v / peak for v in d]


def stance_drop(geometry, joints, angles, frames, windows):
    """How far the chassis rides DOWN on each frame, taken from its own legs.

    THIS IS THE FIX FOR A DEFECT EVERY OTHER RIG IN THIS FILE CARRIES. A rigid
    leg does not keep its shoulder the same height above its own claw through a
    sweep, and `plant_leg` spends the difference by translating the LEG so that
    the sole stays on the road. That keeps the foot honest and tears the hip
    open: the leg slides through a socket that has not moved. Here that
    translation runs from -0.086 u to +0.085 u -- 9.8 px on a shoulder ball only
    6.9 px across -- because a foot 0.255 u long rolling through a 41 degree
    plant lifts one end of itself nearly as far as the leg above it is tall.

    The physical answer is that the CHASSIS is what moves: with the claw pinned
    to the road, a leg that has effectively shortened pulls the hip down with it
    and one that has lengthened pushes it up. So the body takes the mean of what
    its planted legs are asking for, and each leg keeps its own exact
    translation -- the graded quantity, the sole's own position, is untouched.
    What is left at each socket is only that leg's DEVIATION from the mean,
    which is what a machine with real suspension would absorb.

    THE MEAN IS ALL THIS CAN RECOVER, AND ON THIS GAIT THE MEAN IS NEARLY ZERO.
    Front and rear legs roll in OPPOSITE directions -- the fronts asking to come
    up while the rears ask to go down -- so the body's own height barely moves
    (-0.013 u to +0.023 u, a 2.1 px bob) and what is left at each socket is the
    whole of that leg's own roll: 0.091 u, 5.2 px, against a ball 6.9 px across.
    It is spent UPWARD as often as downward and the ball sits under the chassis
    skirt, so half of it hides itself; it is still the largest approximation in
    this rig and it is written down here rather than discovered later.

    THE REAL FIX IS A KNEE, and it is deliberately not here. A two-link leg
    solved to keep the foot flat would make this term vanish, and it is the
    right next change to this rig if the Harvester's legs ever have to bear
    scrutiny at a larger size -- 12 groups, and an IK solve none of the four
    shipped rigs needs. What is here instead is the disagreement, measured.
    """
    drop = []
    for f in range(frames):
        lows = []
        for name, window in windows.items():
            if f not in window:
                continue
            placed = turn_about(joints[name],
                                mat_rotate("y", angles[name][0][f]))
            lows.append(min(mat_apply(placed, p)[2] for p in geometry[name]))
        drop.append(-sum(lows) / len(lows) if lows else 0.0)
    return drop


def twitch_series(frames, at, snap, hold):
    """0 while an arm is holding its pose, 1 while it is holding the other one.

    A SERVO RAMP, NOT AN EASE, and that is the entire point of the arms. Every
    other motion in this file is a cosine because bodies accelerate; a
    repositioning actuator does not. It travels at one speed, stops dead, waits,
    and travels back -- so this is two linear ramps with a flat between them,
    and at 32 frames each ramp is two frames of the board's time.
    """
    out = [0.0] * frames
    travel = max(1, int(round(snap * frames)))
    held = max(1, int(round(hold * frames)))
    start = int(round(at * frames)) % frames
    for i in range(travel):
        out[(start + i) % frames] = (i + 1) / float(travel)
    for i in range(held):
        out[(start + travel + i) % frames] = 1.0
    for i in range(travel):
        out[(start + travel + held + i) % frames] = 1.0 - (i + 1) / float(travel)
    return out


def march_cycle(groups, frames, geometry, joints, options=None):
    """The pose of every group on every frame of one march.

    THE LEGS ARE SOLVED AND EVERYTHING ELSE IS DERIVED FROM THEM, which is a
    step past the two rigs above: there the body was authored against the legs
    by eye, here its roll comes from which feet are down, its height from how
    far those feet have shortened their legs, and its pitch from its own lurch.
    The only things in this cycle that answer to nobody are the arms and the
    turret, and they are the two parts that are supposed to move independently
    of the walk.

    THE CHASSIS CARRIES THE ARMS AND THE TURRET AND NOT THE LEGS. They are
    bolted to it and must ride every bit of it; the legs' pivots sit on the
    chassis's own rotation axis (see `walker_pivot_of`), so the roll and pitch
    do not move the hips, and leaving the legs out of the carry keeps the solve
    above exactly true rather than nearly true.

    TWO CLOCKS, AND WHICH PART ANSWERS TO WHICH IS THE POINT OF THE RIG. The
    WALK runs on the step: legs, roll, lurch and heave are all built for one
    step and read back with `f % step`, so they repeat `MARCH_STEPS` times
    across the frame list (see that constant). The ARMS AND THE TURRET run on
    the whole stride, once each, because they are not walking -- the owner asked
    for a unit that twitches "as if constantly sensing its path", and a twitch
    that recurs every half stride on the beat of the legs is not sensing, it is
    just more walking.

    A SWINGING LEG DOES NOT FOLLOW THE HEAVE, which is the one place this rig
    differs from the hound's. What a swinging leg would have to follow is not the
    heave itself but its VARIATION across the step, and that is 0.037 u peak to
    peak -- 1 px of socket either side of the mean, inside a ball 6.9 px
    across. Following it would move a swinging claw by that much toward the road,
    against an instrument whose whole plant band is 0.015 u: the rear pair drags
    at 0.020 u of clearance on its first swing frame and would be graded as
    planted. A pixel of joint is the cheaper of the two.
    """
    step = max(1, frames // max(1, MARCH_STEPS))
    names = [n for n in MARCH_PHASE if n in geometry]
    windows = plant_windows(step, names, MARCH_PHASE, MARCH_DUTY)
    angles = {}
    for name in names:
        angles[name] = leg_series(geometry[name], joints[name], step,
                                  windows[name], MARCH_LIFT[name[4]],
                                  MARCH_REACH, CYCLE_UNITS / float(MARCH_STEPS),
                                  about_rest=True)

    roll = support_roll(step, windows, joints, BODY_ROCK)
    surge = lurch_series(step, MARCH_PHASE, names, BODY_SURGE, SURGE_PUSH)
    pitch = rate_of(surge, BODY_DIP)
    heave = stance_drop(geometry, joints, angles, step, windows)
    twitch = dict((n, twitch_series(frames, ARM_TWITCH_AT[n], ARM_TWITCH_SNAP,
                                    ARM_TWITCH_HOLD)) for n in ARM_TWITCH_AT)
    shoulders = joints.get("hip")

    poses = []
    for f in range(frames):
        slow = f / float(frames) * 2 * math.pi
        s = f % step
        carry = mat_translate([surge[s], 0.0, heave[s]])
        if shoulders:
            carry = mat_multiply(carry, turn_about(shoulders, mat_multiply(
                mat_rotate("y", pitch[s]), mat_rotate("x", roll[s]))))
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)
                continue
            joint = joints[name]
            ride = False
            if name in angles:
                series, lift = angles[name]
                placed = plant_leg(geometry[name], joint, series, lift, s)
            elif name in twitch:
                side = 1.0 if name.endswith("_l") else -1.0
                t = twitch[name][f]
                placed = turn_about(joint, mat_multiply(
                    mat_rotate("z", side * ARM_TWITCH_YAW * t),
                    mat_rotate("y", -ARM_TWITCH_LIFT * t)))
                ride = True
            elif name == "turret":
                placed = turn_about(joint,
                                    mat_rotate("z", TURRET_SCAN *
                                               math.sin(slow)))
                ride = True
            else:
                placed = carry
            pose.append(mat_multiply(carry, placed) if ride else placed)
        poses.append(pose)
    return poses


# --- a spectre's rig --------------------------------------------------------
#
# THE FIRST BODY IN THIS TOOL THAT TOUCHES NOTHING. The three rigs above are all
# gaits -- two legs, four legs, four legs on a machine -- and every one of them
# is built around the one hard constraint a walker has: a planted foot must go
# backward by exactly the distance the body goes forward, or it skates. This
# body has no feet. `healer.glb` is a crystal core inside two rings,
# with six shards in orbit, a skirt of ectoplasm and a crown of plumes, and the
# lowest thing on it is the tip of a tail. Nothing about it is a step.
#
# SO THE CYCLE IS DRIVEN BY A CLOCK, AND THAT IS THE SAME EXEMPTION THE WISP
# ALREADY HAS rather than a new one. gl-world.js advances a walker's frame by
# DISTANCE COVERED and says so four times; a body that plants nothing has to
# keep drifting while it is slowed, while a Warbringer stun holds it still and
# while it hovers in the sandbox with no path under it at all. See `hover_cycle`
# for the argument in full -- this rig is the second case of it, not a relapse.
#
# WHAT THE HIERARCHY GIVES, and it gives a rig without a single typed constant:
#
#   core / core_crystal, core_inner_glow, core_facet_*   the lantern
#   halo_ring, halo_ring_inner                           two rings, one big
#                                                        and high, one tight
#                                                        around the core
#   orbit_shard_0..5                                     six shards, evenly
#                                                        spaced on a ring
#   wisp_0..5                                            the skirt: tails that
#                                                        hang to the road
#   wisp_upper_0..3                                      the crown: plumes that
#                                                        rise off the core
#   tendril_0..4                                         short trailers under
#                                                        the core
#   aura_shroud                                          a shell, and see below
#
# SIX SHARDS IN ONE GROUP, FIVE TENDRILS IN ANOTHER, for the reason the firefly
# puts six legs in one: a group is a draw call per body, and six shards that
# orbit the same axis at the same rate are one rigid thing that happens to have
# been authored as six meshes. What must NOT be merged is anything that moves
# against something else -- the two rings counter-rotate, the skirt and the
# crown sway out of phase -- and each of those is its own group.
#
# THE AURA SHROUD IS EXCLUDED ON THE COMMAND LINE, and it is worth saying why
# here because the reason is a property of this FORMAT and will apply to the
# next import too. A palette entry is [r, g, b, emission]: there is no alpha in
# it at all. The shroud is authored at alpha 0.35 as a translucent envelope --
# 0.9 units of radius around a core of 0.5 -- so imported it is not a haze, it
# is an opaque shell with the entire lantern sealed inside it. Same class of
# decision as the undead zombie's `grave_ground`, and named the same way: on the
# command line, in the run's own output, not buried in this rig.


def spectre_group_of(part, options):
    """Which animated group a mesh belongs to, from its own name.

    Matched on the MESH rather than on the child-of-root the walkers match on,
    because this hierarchy is flat: only `core` is a real branch, and the shards,
    the tails and the plumes are all siblings directly under the model root. The
    name is what carries the rig, so the name is what is read.
    """
    chain = part["chain"]
    name = part["name"]
    top = chain[1] if len(chain) > 1 else name
    if top == "core" or name.startswith("core"):
        return "core"
    if name == "halo_ring":
        return "halo"
    if name == "halo_ring_inner":
        return "halo_inner"
    if name.startswith("orbit_shard"):
        return "shards"
    # Before the plain `wisp_` test: `wisp_upper_0` starts with both.
    if name.startswith("wisp_upper"):
        return "plumes"
    if name.startswith("wisp_"):
        return "skirt"
    if name.startswith("tendril"):
        return "tendrils"
    return options.body_group


def spectre_pivot_of(name, points, refs):
    """Where a group turns, measured from what is in it.

    THREE KINDS OF JOINT AND NO FOURTH. A thing that SPINS turns about its own
    centre -- the core, both rings, and the shard ring, whose six members are
    evenly spaced so their common centroid IS the axis they orbit. A thing that
    HANGS swings from its top. A thing that RISES bends at its base. Every one
    of those is a measurement off the group's own points, so a different body
    imported through this rig gets its own joints rather than this one's.

    This is a JOINT, not the offset the geometry is stored at: the rig declares
    `origin_pivot`, so the points ship where they really are and the cycle turns
    them about these with `turn_about`. That is what keeps `model.top` -- the
    height gl-world.js hangs the health bar at -- equal to the real crown of a
    body whose crown is a plume tip.
    """
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    zs = [p[2] for p in points]
    mid = [sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)]
    if name in ("skirt", "tendrils"):
        return [mid[0], mid[1], max(zs)]        # hangs
    if name == "plumes":
        return [mid[0], mid[1], min(zs)]        # rises
    return mid                                  # spins


# How far each part of the drift moves, in radians unless it says otherwise.
# Chosen against one rule: this body is 33 px tall on the board at its own
# sizeScale, so anything under about a hundredth of a radian on a joint near the
# centre is sub-pixel and is not an animation, it is file size. What reads at
# that size is the RINGS turning -- a full revolution is unmistakable at any
# scale -- and the skirt swinging under it.
DRIFT_HALO_TURNS = 1.0            # the big ring, one revolution per cycle
DRIFT_INNER_TURNS = -1.0          # the tight one, against it
DRIFT_SHARD_TURNS = 1.0           # the shards ride with the big ring
DRIFT_CORE_TURNS = -0.5           # ...and the lantern lags them all
DRIFT_SHARD_RISE = 0.06           # model units, peak, on the shard ring
DRIFT_SWAY = 0.085                # skirt and tendrils, about the horizontal
DRIFT_PLUME_SWAY = 0.055          # the crown, which is shorter and lighter
DRIFT_CORE_PULSE = 0.045          # the lantern breathes by this much of itself
DRIFT_TWIST = 0.05                # a little yaw on anything that sways


def drift_cycle(groups, frames, geometry, joints, options=None):
    """The pose of every group on every frame of one drift.

    EVERY TERM IS EITHER A WHOLE NUMBER OF TURNS OR A SINE OF THE CYCLE, which
    is not a stylistic preference: the caller loops this list, so a term that
    ends the cycle somewhere other than where it started is a visible jump once
    per cycle forever. A half-turn is admissible on the core for the same reason
    it is not on the rings -- see DRIFT_CORE_TURNS -- because the crystal is
    symmetric about the axis it is turned on and half a revolution of it lands
    on its own shape.

    THE SKIRT AND THE CROWN SWAY IN A CIRCLE, not back and forth. A tail that
    swings on one axis reads as a pendulum, which is a thing hanging off a body
    that is being carried; a tail whose tip describes a circle reads as a thing
    floating in its own right, which is what this is. That is the whole of why
    both a sine and a cosine appear here.
    """
    poses = []
    for f in range(frames):
        t = f / float(frames)
        turn = t * 2 * math.pi
        for_sway = math.sin(turn)
        cross_sway = math.cos(turn)
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)               # drawn by the instance alone
                continue
            joint = joints[name]
            if name == "halo":
                local = mat_rotate("z", DRIFT_HALO_TURNS * turn)
            elif name == "halo_inner":
                local = mat_rotate("z", DRIFT_INNER_TURNS * turn)
            elif name == "shards":
                local = mat_multiply(
                    mat_translate([0.0, 0.0, DRIFT_SHARD_RISE * for_sway]),
                    mat_rotate("z", DRIFT_SHARD_TURNS * turn))
            elif name == "core":
                local = mat_multiply(
                    mat_rotate("z", DRIFT_CORE_TURNS * turn),
                    mat_scale(1.0 + DRIFT_CORE_PULSE * for_sway))
            elif name in ("skirt", "tendrils"):
                # The tendrils trail the skirt by a quarter cycle, so the body
                # has an inside and an outside that do not move as one plate.
                phase = turn if name == "skirt" else turn - math.pi / 2
                local = mat_multiply(
                    mat_rotate("y", DRIFT_SWAY * math.sin(phase)),
                    mat_rotate("x", DRIFT_SWAY * math.cos(phase)))
                local = mat_multiply(
                    mat_rotate("z", DRIFT_TWIST * math.sin(phase)), local)
            elif name == "plumes":
                # Against the skirt: the crown leans off the vertical the way
                # the tails are not, which is what stops the silhouette
                # bending in one direction like a flag.
                local = mat_multiply(
                    mat_rotate("y", -DRIFT_PLUME_SWAY * for_sway),
                    mat_rotate("x", -DRIFT_PLUME_SWAY * cross_sway))
                local = mat_multiply(
                    mat_rotate("z", -DRIFT_TWIST * for_sway), local)
            else:
                local = IDENTITY
            pose.append(turn_about(joint, local))
        poses.append(pose)
    return poses


# --- a broadcast beacon's rig ------------------------------------------------
#
# THE SHIELDBEARER, AS OF 2026-08-18: `shieldbearer.glb`, which
# REPLACES the four-legged Tender this repo built in Blender. A beacon has no
# legs, so there is no plant to solve and nothing here inherits the walkers'
# hard constraint -- this is the spectre's case, arrived at from a different
# direction, and the type gains a `hover` block in js/enemy.js for exactly the
# reason the Healer has one: a body with nothing planted on the road cannot
# have its cycle driven by the distance it covers, and a legless body that
# stayed on the tarmac would SKATE. `check-gait-slip.js` measures that
# precisely -- a group planted in every frame while the body advances reads the
# whole cycle as slip -- so the choice was between a floating beacon and the
# worst gait figure in the library.
#
# WHAT THE HIERARCHY GIVES. Fifty flat siblings under one root, named by
# function, which is a rig if you read the names:
#
#   Base_*, Beacon_Main_Body, Lower_Collar, Core_Cradle, Energy_Channel_*,
#   Core_Guard_*, Guard_Light_*, Projection_Fin_*, Projection_Node_*,
#   Crown_Collar, Antenna_*                       the structure: it does not move
#   Shield_Core_Crystal, Shield_Core_Hotspot      the lantern in the cradle
#   Core_Focus_Ring_Lower/Upper, Core_Focus_Light the rings that aim it
#   Shield_Broadcast_Halo_A / _B                  two rings it emits
#   Shield_Broadcast_Arc_01 / _02                 two sweeps that orbit it
#
# THE STRUCTURE IS ONE STATIC GROUP AND THAT IS A DECISION, not an omission. A
# group is a draw call per body, and this type walks in threes; the base, the
# spire and the antenna have no more reason to move than a tower's plinth does.
# What moves is what the beacon is DOING, and separating those four things is
# what makes "it is broadcasting" legible at 60 px.
#
# THE TWO HALOS ARE SEPARATE GROUPS FOR ONE REASON: PHASE. They are the same
# gesture -- a ring emitted low, rising up the spire and growing as it goes --
# and one ring doing it alone reads as a hoop on a stick. Half a cycle apart,
# one is always leaving as the other arrives, which is what a beacon looks
# like. They cannot share a group and be out of phase, so they do not share one.
#
# EVERY TERM IS A WHOLE TURN OR A SINE OF THE CYCLE, with one deliberate
# exception, and the exception is why the pulse works: a ring that rises must
# START AGAIN at the bottom, which is a discontinuity. It is hidden the way a
# broadcast hides it -- the ring is scaled to nearly nothing at both ends of
# its travel, so it fades in from a point and shrinks back to one. Nothing
# jumps because nothing visible is there to jump.


def beacon_group_of(part, options):
    """Which animated group a mesh belongs to, from its own name.

    Matched on the MESH name, like the spectre's, because this hierarchy is
    flat: every one of the fifty parts is a direct child of the model root and
    the name is the only rig information the export carries.
    """
    name = part["name"]
    if name.startswith("Shield_Core"):
        return "beacon_core"
    if name.startswith("Core_Focus"):
        return "beacon_ring"
    if name == "Shield_Broadcast_Halo_A":
        return "beacon_pulse_a"
    if name == "Shield_Broadcast_Halo_B":
        return "beacon_pulse_b"
    if name.startswith("Shield_Broadcast_Arc"):
        return "beacon_arc"
    return options.body_group


def beacon_pivot_of(name, points, refs):
    """Where a group turns, measured from what is in it.

    EVERYTHING HERE SPINS ABOUT THE BEACON'S OWN AXIS, which is x = y = 0 after
    `build` centres the body -- and that is a stronger statement than "the
    centroid of this group", because two of these groups are PARTIAL sweeps
    whose centroid is not on the axis they orbit. Taking the centroid would
    have the arcs orbiting a point inside themselves, which is a wobble rather
    than an orbit. The height is the group's own, because a ring rises from
    where it is.
    """
    zs = [p[2] for p in points]
    return [0.0, 0.0, sum(zs) / len(zs)]


# The pulse's travel, as fractions of the model's own height -- derived at
# cycle time from the geometry that shipped, so a beacon imported at another
# size gets the same gesture rather than these numbers in the wrong units.
PULSE_FROM = 0.30                 # of body height: where a ring is emitted
PULSE_TO = 0.92                   # ...and where it has faded out
PULSE_MIN = 0.12                  # ring scale at both ends of the travel
PULSE_MAX = 1.15                  # ...and at the middle of it
BEACON_ARC_TURNS = 1.0            # the two sweeps orbit the spire, once
BEACON_RING_TURNS = -1.0          # the focus rings turn against them
BEACON_CORE_TURNS = 0.5           # the crystal is symmetric; half a turn lands
BEACON_CORE_PULSE = 0.05          # the lantern breathes by this much of itself


def broadcast_cycle(groups, frames, geometry, joints, options=None):
    """The pose of every group on every frame of one broadcast."""
    zs = [p[2] for pts in geometry.values() for p in pts]
    height = (max(zs) - min(zs)) if zs else 1.0
    poses = []
    for f in range(frames):
        t = f / float(frames)
        turn = t * 2 * math.pi
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)               # drawn by the instance alone
                continue
            joint = joints[name]
            if name == "beacon_core":
                local = mat_multiply(
                    mat_rotate("z", BEACON_CORE_TURNS * turn),
                    mat_scale(1.0 + BEACON_CORE_PULSE * math.sin(turn)))
            elif name == "beacon_ring":
                local = mat_rotate("z", BEACON_RING_TURNS * turn)
            elif name == "beacon_arc":
                local = mat_rotate("z", BEACON_ARC_TURNS * turn)
            elif name in ("beacon_pulse_a", "beacon_pulse_b"):
                # HALF A CYCLE APART. `u` is this ring's own position through
                # its rise, and the two rings read the same curve at opposite
                # phases -- so the group that is fading out at the top is
                # always the one the other is replacing at the bottom.
                u = t if name == "beacon_pulse_a" else (t + 0.5) % 1.0
                rise = (PULSE_FROM + (PULSE_TO - PULSE_FROM) * u) * height
                # Where the ring is AUTHORED, so the travel is measured from
                # its own home rather than from the floor.
                here = joint[2]
                grow = PULSE_MIN + (PULSE_MAX - PULSE_MIN) * math.sin(
                    math.pi * u)
                local = mat_multiply(
                    mat_translate([0.0, 0.0, rise - here]), mat_scale(grow))
            else:
                local = IDENTITY
            pose.append(turn_about(joint, local))
        poses.append(pose)
    return poses



# --- the Bulwark, which is TWO bodies and one machine -----------------------
#
# `bulwark_shield.glb` and `bulwark_no_shield.glb` are the same specialist
# before and after its shield goes, and gl-world.js swaps one for the other the
# moment `Enemy.prototype.breakShield` fires. So they share a grouping -- the
# artist gave both files one naming convention -- and they do NOT share a
# cycle, because the whole point of the swap is that the thing MOVES
# differently afterwards (the owner, 2026-08-20: "the animation of the bulwark
# should be fast and nimble with the shield, whilst without his shield, he
# would be moving in a very springy manner, like a kangaroo, but one leg at a
# time"). Two rigs, one `group_of`, one set of pivots, two cycles -- which is
# exactly the split `plodder` and `tyrant` already make against `humanoid`.
#
# THE SIDES ARE NAMED `Lead` AND `Trail`, WHICH IS A STANCE AND NOT A SIDE, and
# it is still the whole rig. Both files are authored mid-stride -- the lead toe
# is on the road at z 0 and the trail toe is in the air at z 0.085 (shield) /
# 0.163 (overdrive) -- so the artist named the legs for where they are in the
# step rather than for which side of the body they are on. They are none the
# less a left and a right: every `Lead_` part sits at x < 0 and every `Trail_`
# part at x > 0, and x < 0 is the side `boss.glb` spells `Left`, which is the
# convention this corpus already has. `lead` -> `leg_l`, `trail` -> `leg_r`.
#
# AND THE TOKEN IS SUFFICIENT ON ITS OWN, which is the property that makes this
# the shortest rig in the file. In BOTH sources, every part whose name carries a
# `lead` or `trail` token is leg geometry and nothing else is -- 20 parts in the
# shielded file, 26 in the stripped one, checked part by part against their
# bounding boxes. There is no need to also ask what a part IS, the way the
# plodder's table and the Tyrant's keyword lists have to.
#
# `Lead_Spring_To_Halo_Feed` AND `Trail_Spring_To_Halo_Feed` ARE THE ONE CALL
# IN THAT SENTENCE. They are feed lines from a calf spring out to the halo, so
# they belong to two groups and can only be in one: the leg swings and the halo
# is torso. They go with the LEG, because that is where they physically are --
# x -0.406..-0.148 against the lead calf's -0.436..-0.111, while the halo ring
# beside them at that height sits out at -0.891..-0.279. A gap opening between
# a strut and the energy ring it feeds is legible; a strut detached from the
# limb it is bolted to is not.
#
# THREE TRAPS, ALL OF THEM LIVE IN THESE FILES:
#
#   * `left` AND `right` APPEAR AND MUST BE IGNORED. `Targeting_Visor_Left`,
#     `Split_Combat_Fin_Left`, `Left_Vent_Fin`, `Left_Back_Vent_Upper`,
#     `Halo_Mount_Left_Shoulder` and `Retracted_Halo_Mount_Shoulder_Left` all
#     carry a side token, and NOT ONE of them is a limb -- they are a face, a
#     helmet fin, a pair of back vents and the halo's own mounts. The Tyrant's
#     rig reads exactly these words to find its legs; reading them here would
#     tear the back vents off the torso and swing them from a hip.
#   * `Overdrive_` IS A MODEL PREFIX, NOT A LIMB. It is on the stripped file's
#     toes AND on its hip core, its sternum, its helmet and its antenna. Only
#     the `lead`/`trail` token separates them, which is the reason this rig
#     matches on that and on nothing else.
#   * `vent` IS ON BOTH A BACK PANEL AND A CALF. `Left_Vent_Fin` is torso and
#     `Lead_Rebound_Vent` (x -0.427..-0.299, z 0.541..0.679) is on the lead
#     calf. The leg test runs first and answers the second one; a `fin`/`vent`
#     head-or-body test could never have separated them.
#
# THE ARMS ARE NAMED FOR WHAT THEY DO, so they are matched on their FIRST token
# and not on a substring: `Back_Shield_Bus` is a torso spine that carries the
# word `Shield`, and a substring test would hang it off the shoulder. Same for
# `Hip_Balance_Module` and `Counterbalance_Module`, which are hip mass rather
# than the balance arm. The shield arm and the strike arm are the same arm at
# two points in the machine's life and both are on the lead side, so both map
# to `arm_l` and the pair keeps swinging against the same leg across the swap.
BULWARK_ARMS = {"shield": "arm_l", "strike": "arm_l", "balance": "arm_r"}
# The head, on the same first-token rule where it can be and on a keyword where
# the artist put the noun second (`Aggressor_Wedge_Face`, `Gold_Trajectory_Visor`,
# `Kinetic_Specialist_Helmet`). `fin` is deliberately absent -- see the third
# trap above -- and the two helmet fins are claimed by `helmet` and by
# `split_combat` instead.
BULWARK_HEAD_PARTS = ("neck", "helmet", "face", "visor", "antenna", "sensor",
                      "target_lock", "split_combat")


def bulwark_group_of(part, options):
    """Which animated group a mesh belongs to, from its own NAME.

    Six groups: two legs, two arms, the head, and the body -- which on the
    shielded file also carries the entire halo, twenty ring segments and their
    mounts, circuits and nodes. The halo is NOT a seventh group: it is bolted to
    the shoulders and the hips at four points, so anything that moved it
    relative to the torso would open those four joints, and it is the one part
    of this body that has no reason to move on its own.
    """
    name = part["name"].lower()
    tokens = name.split("_")

    # THE LEG TEST IS FIRST AND IT IS THE WHOLE OF THE LEG. See the header:
    # a `lead` or `trail` token means leg geometry in both of these files.
    if "lead" in tokens:
        return "leg_l"
    if "trail" in tokens:
        return "leg_r"

    arm = BULWARK_ARMS.get(tokens[0])
    if arm:
        return arm

    if tokens[0] in BULWARK_HEAD_PARTS or \
            any(key in name for key in BULWARK_HEAD_PARTS):
        return "head"

    return options.body_group


# THE SHIELDED GAIT: FAST AND NIMBLE, WHICH IS A DUTY BEFORE IT IS AN AMPLITUDE.
#
# What separates this from `walk_cycle` -- the gait this body used to walk, as a
# Blender-built Courier -- is not that the numbers are bigger. It is that the
# walk holds each boot down for exactly half the cycle so that NO frame has both
# feet in the air, and this does not. At 0.46 each, offset by half, two frames
# per cycle have nothing on the road, and `airborne_lift` reads those two frames
# off the windows and gives the body a rise over each. That is the difference
# between walking quickly and moving lightly, and it is the same lever the
# hound's gallop pulls harder (0.25, two long suspensions).
SPRINT_PHASE = {"leg_l": 0.75, "leg_r": 0.25}
SPRINT_DUTY = 0.46
# Picks its feet up. Clear of check-gait-slip.js's 0.015 PLANT_BAND at every
# swing frame with the body's own rise subtracted, which is the condition a
# suspension adds to the usual one -- see `bulwark_body_rise`.
SPRINT_LIFT = 0.075
# A short contact buys a short plant arc; `leg_series` pays it back in the air.
# Small, because 0.46 is barely short -- the hound at 0.25 needs 0.85.
SPRINT_REACH = 0.22
# 0.045 AGAINST THE WALK'S 0.10, AND THAT IS THE POSTURE HALF OF "NIMBLE".
# `BODY_LEAN` is a zombie's stoop; a trained specialist runs upright. The sway
# is what is left of a footfall wobble on a body that is not fighting its own
# weight.
SPRINT_LEAN = 0.045
SPRINT_SWAY = 0.022
# How far the body rides up over each of the two suspensions. Small: this is a
# jog, not a bound, and every unit of it has to be bought back out of the swing
# lift above so a swinging boot still clears the plant band.
SPRINT_RISE = 0.022
# The arms work HARDER than a walker's 0.55, which is the other half of the
# reading. Taken off the solved leg angle, so the two cannot drift apart.
SPRINT_ARM_SWING = 0.72
# The head is held STILL against the body it is riding: the sway is cancelled
# and what is left is a small scan. A walker's head lolls at footfall rate
# (`walk_cycle` swings it 0.05 with the body); a body being carried by someone
# who is watching the road does not.
SPRINT_HEAD_SCAN = 0.035


# THE STRIPPED GAIT: A BOUND, ONE LEG AT A TIME.
#
# The owner asked for "a very springy manner, like a kangaroo, but one leg at a
# time", and the two halves of that sentence are two different decisions:
#
#   ONE LEG AT A TIME is the phase table. A kangaroo's own gait puts both feet
#   down together, which is one hop per cycle and a phase table with a single
#   entry in it; this is the alternating version, so each leg gets its own hop
#   and the two are half a cycle apart. Two hops per cycle, two suspensions, and
#   -- because gl-world.js advances a frame by DISTANCE and one cycle is
#   0.899281 model units at every size and every speed -- each hop covers half
#   of that whatever the body's speed scale happens to be. The Bulwark's speed
#   DOUBLES at the moment it loses this shield, so the same cycle simply plays
#   twice as fast: the leap does not get longer, the rhythm gets quicker, which
#   is what "it stops being the slow one" should look like.
#
#   SPRINGY is the duty, and it is the number that does the work. At 0.28 the
#   body is off the road for 8 of 16 frames -- HALF the cycle in the air, more
#   than the hound's gallop spends -- so `airborne_lift` has two long runs to
#   ease a rise over, and the rise is large.
BOUND_PHASE = {"leg_l": 0.875, "leg_r": 0.375}
BOUND_DUTY = 0.28
# A hopping leg picks up hard. The largest lift in the file, and it has to be:
# it is what the crouch below is measured against -- a swinging boot follows the
# body down into the other leg's stance and still has to clear
# check-gait-slip.js's 0.015 PLANT_BAND while it does.
BOUND_LIFT = 0.095
# 0.35, AND IT WAS 0.95 UNTIL THE RENDER SAID OTHERWISE. `swing_reach` buys arc
# in the air, which is right for the hound: a gallop protracts a jointed leg
# well ahead of the touchdown angle and settles back onto it, and at 0.85 that
# reads as reaching. THESE LEGS HAVE ONE JOINT. `humanoid_pivot_of` gives a leg
# a single hinge at the hip and nothing at the knee, so an overshoot cannot fold
# the limb, it can only swing the whole rigid thing further -- and this body's
# foot is nearly a third of its own height (`Overdrive_Lead_Toe` spans 0.98
# source units of a 3.04 body). At 0.95 the result was a straight-legged high
# kick with a slab on the end of it, twice a cycle. Seen on the real renderer.
#
# So the spring is bought where a one-jointed rig can actually spend it: in the
# BODY's rise and fall (`BOUND_RISE` and `BOUND_CROUCH`) and in the pitch those
# two drive. What is left here is the small forward reach a leg needs to be
# ahead of the hip at touchdown rather than under it.
BOUND_REACH = 0.35
# How far the body rides up over each suspension, and how far it sinks into each
# plant. THE SECOND ONE IS WHAT MAKES THIS A SPRING RATHER THAN A HOP: a body
# that only rises reads as being lifted; a body that compresses onto the leg
# that just caught it and then extends off it reads as being THROWN. Both are
# taken off the same plant windows (see `bulwark_body_rise`), so neither can
# disagree with a footfall.
BOUND_RISE = 0.125
BOUND_CROUCH = 0.055
# Nose up while the body climbs, nose down while it falls -- taken from the
# vertical VELOCITY of the curve those two numbers make rather than from a sine
# of its own. See `bulwark_body_rise`: a phase-authored pitch on a gait with two
# suspensions per cycle has to be hand-matched to them and silently stops
# matching the moment a duty is retuned.
BOUND_PITCH = 0.30
# The arms pump, hard, against the leg on their own side.
BOUND_ARM_SWING = 0.95
# The head leads: pitched down into the run and nodding once per hop.
BOUND_HEAD_LEAD = 0.13
BOUND_HEAD_NOD = 0.055


def bulwark_body_rise(frames, windows, height, crouch=0.0):
    """The body's height on every frame: airborne rise AND stance compression.

    `airborne_lift` answers half of a spring. It eases a rise over every run of
    frames with nothing on the road, which is the flight; what it has no opinion
    about is the frames where a foot IS down, and it returns 0 for all of them.
    A body that rides a curve of zeros through its own landing is a body being
    carried over the road rather than pushing off it.

    So the plants get the mirror of the same treatment: eased DOWN over each
    supported run, zero at both ends, which puts the deepest compression at
    mid-plant and returns the body to resting height on the exact frame the foot
    leaves. Composed with the rise, that is one continuous curve -- down into the
    catch, up through the throw, over the top, back down into the next catch --
    and every inflection in it is a footfall, because both halves are read off
    the same windows.

    THE PLANTED LEG DOES NOT FOLLOW THE CROUCH AND MUST NOT. `plant_leg` sets
    each leg's own lowest point on the road independently of the body, so a hip
    that sinks 0.055 while the sole stays put IS the leg compressing -- which is
    the thing being drawn. Following it would lift the foot off the road by
    exactly the amount the body sank.

    THE SWINGING LEG DOES FOLLOW IT, and that is the constraint that sizes
    `crouch`. It is attached to a body that is going down, so it goes down too,
    and its own swing lift has to be deep enough to keep the boot clear of
    check-gait-slip.js's 0.015 PLANT_BAND while that happens. The two are
    naturally in opposition -- the deepest crouch of one leg's plant falls at the
    peak of the other's swing -- and `--stats` on a re-import is what proves it
    stayed that way.

    Falls back to `airborne_lift`'s exact answer when `crouch` is 0, so the
    shielded body and the hound both get the curve they already had.
    """
    lift = airborne_lift(frames, windows, height)
    if not crouch:
        return lift

    down = [False] * frames
    for window in windows.values():
        for f in window:
            down[f] = True
    if not any(down) or all(down):
        return lift

    # Start on an UNSUPPORTED frame so a stance spanning the wrap is one run
    # rather than two -- the mirror of the argument `airborne_lift` makes about
    # a suspension, and the same place an eye-authored curve gets it wrong.
    start = 0
    while down[start]:
        start += 1
    run = []
    for f in [(start + i) % frames for i in range(frames)] + [None]:
        if f is not None and down[f]:
            run.append(f)
            continue
        for i, held in enumerate(run):
            lift[held] -= crouch * math.sin(math.pi * (i + 1) / (len(run) + 1))
        run = []
    return lift


def biped_cycle(groups, frames, geometry, joints, gait):
    """The pose of every group on every frame, for both of the Bulwark's gaits.

    ONE FUNCTION, TWO GAITS, AND THE DIFFERENCE BETWEEN THEM IS THE `gait` DICT.
    A jog and a bound are the same four questions -- which frames is each boot
    down, how high does the body ride, how far does it pitch, how hard do the
    arms work -- answered with different numbers. Two copies of this would let
    one of them drift into a stride that skates while `check-gait-slip.js` still
    reads zero on the other, which is the argument `leg_series` and
    `plant_windows` already make one level down.

    THE PITCH IS THE BODY'S OWN VERTICAL VELOCITY, normalised by its own peak.
    Nose up while it climbs, nose down while it falls. That is a real
    relationship rather than a phase somebody matched to the footfalls by eye,
    and it CANNOT come apart from them: retune a duty and the rise changes, the
    velocity changes with it, and the pitch follows. A cosine phased off frame 0
    would keep its old timing and tip the body nose-down at the top of its leap.

    AN AIRBORNE LEG FOLLOWS THE BODY AND A PLANTED ONE DOES NOT -- `run_cycle`'s
    rule, and it is load bearing here for a second reason: this curve goes DOWN
    as well as up (see `bulwark_body_rise`), so `follow` carries a swinging boot
    into the crouch as well as up into the leap.
    """
    names = [n for n in ("leg_l", "leg_r") if n in geometry]
    windows = plant_windows(frames, names, gait["phase"], gait["duty"])
    angles = {}
    for name in names:
        angles[name] = leg_series(geometry[name], joints[name], frames,
                                  windows[name], gait["lift"], gait["reach"])

    # WHERE IN ITS OWN SWEEP EACH LEG IS, NORMALISED TO -1..+1, and it is the
    # only drive the cross-body channels below are allowed to read.
    #
    # `swipe` and `twist` (see the Vanguard's two gaits) both have to land ON a
    # footfall, and the file already carries the argument for why: a sine of
    # their own would keep its phase while a retuned duty moved the feet, and
    # nothing announces when the two come apart. The solved leg angle is the
    # footfall, so a channel taken off it cannot drift from one -- the same
    # relationship `arm` has had since `walk_cycle`, expressed once so a third
    # channel does not have to re-derive it.
    #
    # -1..+1 rather than radians because these are ANGLES ON OTHER AXES: a
    # swipe across the chest is not the same size as the leg sweep that times
    # it, and multiplying a gait's own amplitude by a unit drive keeps the two
    # decisions apart. `half` cannot be zero for a solved leg -- a leg that
    # never moves has no plant -- but a rig with a degenerate window would
    # divide by it, so it falls back to 1.
    sweep = {}
    for name in names:
        series = angles[name][0]
        lo = min(series.values())
        hi = max(series.values())
        mid = (lo + hi) / 2.0
        half = (hi - lo) / 2.0 or 1.0
        sweep[name] = [(series[f] - mid) / half for f in range(frames)]

    rise = bulwark_body_rise(frames, windows, gait["rise"],
                             gait.get("crouch", 0.0))
    # Central difference on a cycle that wraps, normalised by its own largest
    # value so `pitch` is an angle in radians and not a scale factor on one.
    slope = [(rise[(f + 1) % frames] - rise[(f - 1) % frames]) / 2.0
             for f in range(frames)]
    peak = max(abs(v) for v in slope) or 1.0

    hip = joints.get("hip")

    poses = []
    for f in range(frames):
        t = f / float(frames)
        slow = t * 2 * math.pi              # once per cycle
        fast = slow * 2                     # once per footfall
        # A rotation about +y tips whatever is ahead of the hip DOWNWARD, so a
        # forward lean is positive and a nose-up pitch is subtracted from it.
        pitch = (gait["lean"] + gait.get("sway", 0.0) * math.sin(fast)
                 - gait.get("pitch", 0.0) * slope[f] / peak)
        # THE COIL. A body yaw about the hip line, driven by the DIFFERENCE
        # between the two legs' sweeps -- so the torso turns toward whichever
        # leg is forward and squares up at the crossover, which is what a
        # running animal's hips actually do. Zero on both existing gaits, and
        # zero for any rig with fewer than two legs.
        twist = 0.0
        if gait.get("twist") and len(names) == 2:
            twist = gait["twist"] * (sweep[names[0]][f] - sweep[names[1]][f]) / 2.0
        carry = IDENTITY
        if hip:
            local = mat_rotate("y", pitch)
            if twist:
                local = mat_multiply(mat_rotate("z", twist), local)
            carry = mat_multiply(
                mat_translate([0.0, 0.0, rise[f]]),
                turn_about(hip, local))
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)
                continue
            joint = joints[name]
            ride = False
            if name in angles:
                series, lift = angles[name]
                # `lift` is keyed by swing frame, so it is also the record of
                # which frames this boot is off the road.
                follow = rise[f] if f in lift else 0.0
                placed = plant_leg(geometry[name], joint, series, lift, f,
                                   follow)
            elif name in ("arm_l", "arm_r"):
                leg = "leg_l" if name == "arm_l" else "leg_r"
                swing = (-gait["arm"] * angles[leg][0][f]) if leg in angles \
                    else 0.0
                # `arm_set` IS A POSTURE AND `arm` IS A MOTION, and the Vanguard
                # is why they are two numbers. Its dash wants the arms held
                # SWEPT BACK and barely pumping -- a constant plus a small
                # swing -- and scaling the swing alone can only ever make them
                # pump less about the same hanging rest pose. Positive is
                # backward: `plant_leg`'s note applies to any limb that hangs,
                # an increasing rotation about +y carries its far end to -x.
                local = mat_rotate("y", swing + gait.get("arm_set", 0.0))
                # ACROSS THE BODY, on the arm's own side. A rotation about +x
                # takes a hanging limb toward +y, and `leg_l`/`arm_l` are the
                # +y side (see `vanguard_group_of`), so `+side` is OUTWARD for
                # the left arm and inward is the negative of it. `flare` is the
                # constant part (a sprinter holds the arms clear of the ribs)
                # and `swipe` is the moving part, raking IN as that side's own
                # leg comes forward.
                side = 1.0 if name == "arm_l" else -1.0
                across = side * (gait.get("arm_flare", 0.0) -
                                 gait.get("swipe", 0.0) *
                                 (sweep[leg][f] if leg in sweep else 0.0))
                if across:
                    local = mat_multiply(local, mat_rotate("x", across))
                placed = turn_about(joint, local)
                ride = True
            elif name.startswith("shard_"):
                # A LOOSE FRAGMENT IS NOT PART OF ANY GAIT, AND ITS BAKED POSE
                # IS DELIBERATELY THE IDENTITY.
                #
                # These groups are driven at DRAW time -- gl-world.js composes
                # a matrix per shard per frame from the body's own shield
                # timeline, because where a dropped shard is depends on where
                # the road was when it fell, which no baked frame can know. An
                # override is applied in its group's own space (see drawActor),
                # so leaving the baked pose at identity is what makes that
                # space the model's own rather than the torso's.
                #
                # It is also the honest fallback: a shattered body drawn with
                # no override at all wears its shards exactly where the artist
                # scattered them, static, rather than somewhere arbitrary.
                placed = IDENTITY
            elif name == "barrier":
                # HELD LEVEL AGAINST THE BODY CARRYING IT, the same argument the
                # head makes one branch down. The ring is bolted to the
                # shoulders and hips, so it rides the machine -- but it is a
                # field emitter, and a barrier that tips nose-down through every
                # leap reads as a hoop somebody hung on the boss rather than as
                # the thing that stops shots.
                placed = turn_about(joint, mat_rotate("y", -pitch))
                ride = True
            elif name == "head":
                # Held LEVEL against the body that is carrying it -- the whole
                # of the body's pitch is subtracted before the head's own
                # motion is added, so eyes stay on the road through a leap.
                placed = turn_about(joint, mat_multiply(
                    mat_rotate("y", gait.get("head_lead", 0.0) - pitch
                               + gait.get("head_nod", 0.0) * math.sin(fast)),
                    mat_rotate("z", gait.get("head_scan", 0.0)
                               * math.sin(slow))))
                ride = True
            else:
                placed = carry
            pose.append(mat_multiply(carry, placed) if ride else placed)
        poses.append(pose)
    return poses


SPRINT_GAIT = {
    "phase": SPRINT_PHASE, "duty": SPRINT_DUTY, "lift": SPRINT_LIFT,
    "reach": SPRINT_REACH, "rise": SPRINT_RISE, "lean": SPRINT_LEAN,
    "sway": SPRINT_SWAY, "arm": SPRINT_ARM_SWING, "head_scan": SPRINT_HEAD_SCAN,
}

BOUND_GAIT = {
    "phase": BOUND_PHASE, "duty": BOUND_DUTY, "lift": BOUND_LIFT,
    "reach": BOUND_REACH, "rise": BOUND_RISE, "crouch": BOUND_CROUCH,
    # A bound has no constant stoop of its own: the whole of its pitch comes
    # from the leap, which is why this is 0 where the jog carries 0.045.
    "lean": 0.0, "pitch": BOUND_PITCH, "arm": BOUND_ARM_SWING,
    "head_lead": BOUND_HEAD_LEAD, "head_nod": BOUND_HEAD_NOD,
}


def sprint_cycle(groups, frames, geometry, joints, options=None):
    """The shielded Bulwark: quick, upright, light on its feet."""
    return biped_cycle(groups, frames, geometry, joints, SPRINT_GAIT)


def bound_cycle(groups, frames, geometry, joints, options=None):
    """The stripped Bulwark: a spring, one leg at a time."""
    return biped_cycle(groups, frames, geometry, joints, BOUND_GAIT)


# --- the Vanguard, which is one machine in TWO GAITS -------------------------
#
# `vanguard.glb` and `vanguard-shattered.glb` are the fast boss with its bulwark
# up and with it blown off, and both import through THIS rig. That is the
# opposite arrangement to the Bulwark's pair next door, and the difference is
# worth stating because the two look alike from a directory listing:
#
#   THE BULWARK'S TWO FILES ARE TWO GAITS. Its shield break is one-way and
#   permanent, so the body before the break and the body after it never move
#   the same way again; two rigs, one cycle each.
#
#   THE VANGUARD'S TWO FILES ARE ONE GAIT PAIR EACH. Its states are not
#   before-and-after anything: it DASHES for the opening 400 u.l. and SKATES
#   for the rest of the road (`Enemy.TYPES.boss_fast.sprint`), and it does both
#   whether or not its shield is up -- the shield comes back every seven
#   seconds. So the two cycles belong to the MODEL, as two bands, and each file
#   carries both. `enemyModel` picks the file off the shield, `gaitBand` picks
#   the band off the sprint, and neither has to know about the other.
#
# THE HIERARCHY IS THE RIG, as in every import here, and this one is the
# cleanest of the set: `Vanguard > leg_1 | leg_-1 | upper_body > arm_1 | arm_-1`
# with the barrier a fourth child. Nothing has to be matched on a keyword.
#
# `_1` IS THE LEFT SIDE AND `_-1` IS THE RIGHT, and it is measured rather than
# assumed. Every `_1` part sits at source x > 0 (`foot_1` spans 0.130..0.550)
# and every `_-1` part at x < 0. This file is Y-UP and faces +Z, so `build`'s
# remap sends source +x to game +y -- and game +y is the LEFT of a body facing
# +x. Getting it backwards would not draw anything wrong on its own; it would
# pair each arm with the wrong leg and swing them together instead of against
# each other.
#
# TWO NODES CARRY A SIDE TOKEN AND ARE NOT LIMBS: `crest_horn_left` and
# `crest_horn_right` are helmet horns, and they are claimed by the head list
# below before any side test could reach them. The head is matched on its own
# names because the artist left it flat under `upper_body` rather than under a
# `head` node -- the one place in these two files where a name has to be read.
VANGUARD_HEAD_PARTS = (
    "neck", "helm", "helm_brow", "helm_gash", "visor", "jaw",
    "crest_fin", "crest_horn_left", "crest_horn_right",
)


def vanguard_group_of(part, options):
    """Which animated group a mesh belongs to, from its ancestry.

    Six groups on the intact body -- two legs, two arms, the head, the barrier
    ring, and the torso that carries the rest -- and TEN MORE on the shattered
    one, because every loose shield fragment is driven separately at draw time
    and a group is the only thing this format can drive.

    A SHARD IS ITS OWN GROUP AND EVERYTHING ELSE UNDER `barrier_shattered` IS
    NOT. The three part-reformed ring segments (`reforming_frame_*`,
    `reforming_node_*`) are the stub of the barrier growing back and belong to
    the ring; the ten `shard_*` are the pieces in flight. Both live under the
    same parent node, so the parent cannot separate them and the name does.
    """
    chain = part["chain"]
    name = part["name"].lower()
    limb = (chain[1] if len(chain) > 1 else name).lower()
    # The arms hang off `upper_body`, one level deeper than the legs.
    sub = (chain[2] if len(chain) > 2 else "").lower()

    if limb == "leg_1":
        return "leg_l"
    if limb == "leg_-1":
        return "leg_r"
    if sub == "arm_1":
        return "arm_l"
    if sub == "arm_-1":
        return "arm_r"
    if limb == "barrier":
        return "barrier"
    if limb == "barrier_shattered":
        return name if name.startswith("shard_") else "barrier"
    if name in VANGUARD_HEAD_PARTS:
        return "head"
    return options.body_group


def vanguard_pivot_of(name, points, refs):
    """Where a group turns: the humanoid's answer, plus two this rig adds.

    A LOOSE SHARD TURNS ABOUT ITS OWN CENTRE, which is the only point on it
    that means anything -- it is tumbling, not hinged, and gl-world.js rotates
    it about exactly this point when it throws it and again when it draws it
    back in. The centroid of its own vertices, so a shard the artist moves
    moves its pivot with it.

    THE BARRIER TURNS ABOUT THE BODY'S AXIS AND NOT ABOUT ITS OWN MASS. It is a
    ring, so its centroid is on the axis in x and y already; what has to be
    said is the HEIGHT, and it is the ring's own mid-height rather than its
    lowest point, because a hoop held level pivots through its middle.
    """
    if name.startswith("shard_"):
        return [sum(p[k] for p in points) / len(points) for k in range(3)]
    if name == "barrier":
        zs = [p[2] for p in points]
        return [0.0, 0.0, (min(zs) + max(zs)) / 2.0]
    return humanoid_pivot_of(name, points, refs)


# THE DASH: the opening 400 u.l., and the brief is an EXPLOSION rather than a
# fast walk (the owner, 2026-08-26: "the unit explodes forward with an explosive
# burst of speed, a dash, with his arms swept back, body leaning forward").
#
# WHAT MAKES IT READ AS ACCELERATION IS THE DUTY, NOT THE RATE. The cycle is
# distance-driven like every other body's -- one cycle per 0.899281 model units
# whatever the speed -- so the sprint plays this twice as fast for free and no
# number here is allowed to be about "faster". What IS about the dash is that
# the machine is barely on the road: at 0.22 duty, seven of sixteen frames have
# nothing down, in two long suspensions, which is shorter contact than the
# hound's gallop and by some way the shortest in this file.
VANGUARD_DASH_PHASE = {"leg_l": 0.75, "leg_r": 0.25}
VANGUARD_DASH_DUTY = 0.22
# Picks the boots up hard and throws them a long way forward in the air. A
# 3-frame contact buys a very short plant arc, and `leg_series` pays it back as
# protraction -- the same trade the hound's 0.85 makes, and affordable here for
# the reason the Bulwark's bound could not afford it: this body's legs are
# jointed thigh-shin-ankle-foot with the foot a tenth of its height, not one
# rigid slab a third of it.
VANGUARD_DASH_LIFT = 0.085
VANGUARD_DASH_REACH = 0.80
# Small. A dash is FLAT -- the body is being thrown forward, not upward, and
# every unit of rise here is a unit of bounce, and the other gait does not
# bounce at all -- it glides. See `vanguard_skate_cycle`.
VANGUARD_DASH_RISE = 0.030
VANGUARD_DASH_CROUCH = 0.018
# 0.32 RAD OF PERMANENT FORWARD LEAN -- three times the zombie's stoop and the
# largest constant in the file. This is the whole silhouette of the state: mass
# ahead of the feet, which is what a body accelerating actually looks like and
# what a body at constant speed cannot look like without falling over.
VANGUARD_DASH_LEAN = 0.32
VANGUARD_DASH_PITCH = 0.10
# THE ARMS ARE A POSTURE HERE AND A MOTION IN THE OTHER GAIT. 0.95 rad swept
# back and held, against a swing of 0.20 -- they trail, they do not pump. See
# `arm_set` in `biped_cycle` for why that needs a second number.
VANGUARD_DASH_ARM = 0.20
VANGUARD_DASH_ARM_SET = 0.95
VANGUARD_DASH_ARM_FLARE = 0.30
# Head down into the run and almost still: a body at 175 u.l./s is not looking
# around.
VANGUARD_DASH_HEAD_LEAD = 0.22
VANGUARD_DASH_HEAD_NOD = 0.020


# THE SKATE: everything after the sprint is spent.
#
# The owner, 2026-08-26, replacing the bounding attack run authored earlier the
# same day: *"make the vanguard slide as if he has roller skates after his
# initial dash."*
#
# THE BOUND IS DELETED RATHER THAN LEFT UNREACHABLE. Its phase table, duty,
# rise, crouch and pitch are gone, not commented out and not zeroed -- a zeroed
# gait draws a flawless-looking body standing still, passes every gate, and
# reports nothing. No `VANGUARD_BOUND_` constant survives anywhere in this
# file, because nothing should be able to half-restore one.
#
# THIS IS THE FIRST GAIT IN THE FILE THAT IS NOT A SOLVE, AND THAT IS THE WHOLE
# POINT OF IT. Every walker here exists to keep a planted sole on ONE patch of
# road: `solve_hip_angles` inverts the hip rotation frame by frame so the
# contact travels backward by exactly the ground the body covers, and
# `check-gait-slip.js` grades the result at zero. A skate is the precise
# opposite claim. The wheels roll, so the contact moves FORWARD with the
# machine at the machine's own speed, and a foot that stayed put would be a
# foot that had stopped rolling. So there is no plant window, no swing lift, no
# `leg_series` and no `airborne_lift` in here at all -- what the legs do is
# authored, and the only thing borrowed from the walkers is `set_down`, which
# keeps the wheels ON the road while they slide along it.
#
# The consequence is that this band scores the largest gait error in the
# library and MUST. `check-gait-slip.js` carries a per-band `GLIDES` exemption
# naming exactly `enemy-boss_fast#0` and `enemy-boss_fast-shattered#0`; band 1,
# the dash, still plants and still reads 0.000. Read that table before treating
# either number as a fault.
#
# WHAT MAKES IT READ AS SKATING RATHER THAN AS A BODY BEING DRAGGED:
#
#   THE LEGS GO OUT TO THE SIDE, NOT FORE AND AFT. A run is a rotation about
#   +y; a skate is mostly a rotation about +x, one leg pushing out into the
#   stroke while the other rides in under the body. That is the silhouette
#   difference, and it is why `arm_flare`'s axis is the one this gait spends
#   its amplitude on.
#
#   THE WEIGHT TRANSFERS, ONCE PER STROKE. The body slides sideways over the
#   riding skate and rolls into it, so the two are in phase and driven by the
#   same term -- a skater leaning the wrong way is a skater falling over.
#
#   IT NEVER LEAVES THE GROUND. The only vertical is a shallow dip on each
#   push. That is also what buys back the health-bar margin the bound was
#   spending: 0.135 of rise against 0.022 of dip.
VANGUARD_SKATE_SPLAY = 0.20     # rad, how far the wheels sit outside the hips
VANGUARD_SKATE_PUSH = 0.34      # rad, added to the leg driving the stroke
# Small. A skate DOES swing fore and aft -- the pushing leg trails behind the
# body and the recovering one comes back under it -- but it is a fraction of
# what a stride does, and overspending it turns the glide back into a walk.
VANGUARD_SKATE_REACH = 0.16
# How far the machine slides across its own centre line, in model units, and
# how far it rolls into that slide. One stroke each way per cycle.
VANGUARD_SKATE_SWAY = 0.055
VANGUARD_SKATE_ROLL = 0.10
# The dip on each push -- twice a cycle, because both legs push -- and it is
# the ONLY vertical this gait has.
VANGUARD_SKATE_DIP = 0.022
# Pitched forward and held there. A skater's lean is a constant, not a
# consequence of a leap, so this is authored where the dash's is authored and
# the bound's came out of its own vertical velocity.
VANGUARD_SKATE_LEAN = 0.22
# The arms still work, and they still work AGAINST the legs -- which on a skate
# means across the body rather than fore and aft. `swipe` is the claw rake the
# earlier brief asked for, kept and re-timed: it now lands on each PUSH instead
# of on each bounce, because that is the beat this gait has.
VANGUARD_SKATE_ARM = 0.35
VANGUARD_SKATE_SWIPE = 0.62
VANGUARD_SKATE_ARM_FLARE = 0.22
VANGUARD_SKATE_ARM_SET = 0.30
# The coil, kept from the bound and now driven by the stroke: the torso turns
# toward whichever skate is carrying, which is what a skater's shoulders do.
VANGUARD_SKATE_TWIST = 0.18
VANGUARD_SKATE_HEAD_LEAD = 0.10


def vanguard_skate_cycle(groups, frames, geometry, joints, options=None):
    """BAND 0: a long, low glide -- wheels down, weight rolling side to side.

    Authored throughout. See the block above for why a solve would be the wrong
    answer here rather than a more accurate one.

    ONE STROKE PER LEG PER CYCLE, half a cycle apart, and every channel below is
    a function of the same `stroke` term -- so the sway, the roll, the dip, the
    coil, the arm swing and the rake cannot come apart from the legs or from
    each other. That is the property `biped_cycle` gets from its plant windows
    and this gait has to get from having a single drive.
    """
    legs = [n for n in ("leg_l", "leg_r") if n in geometry]
    hip = joints.get("hip")

    # +1 for the +y side. `vanguard_group_of`'s header measures which that is:
    # source `_1` parts sit at x > 0, and the y-up remap sends source +x to
    # game +y, which is the LEFT of a body facing +x.
    side = {"leg_l": 1.0, "leg_r": -1.0}

    poses = []
    for f in range(frames):
        t = f / float(frames)
        cycle = t * 2 * math.pi

        # How far through its own stroke each skate is: +1 at full push, -1
        # fully gathered under the body.
        stroke = {}
        for name in legs:
            stroke[name] = math.sin(cycle + (0.0 if side[name] > 0 else math.pi))

        # WHICH SKATE IS CARRYING, as -1..+1. The body slides toward it and
        # rolls into it, and the shoulders turn with it.
        carry_to = 0.0
        if len(legs) == 2:
            carry_to = (stroke[legs[1]] - stroke[legs[0]]) / 2.0

        # The dip is on the PUSH, so it is twice a cycle whatever the legs are
        # called -- and it is taken off the strokes themselves rather than from
        # a doubled sine, so a retimed stroke takes it along.
        push = max(abs(stroke[n]) for n in legs) if legs else 0.0
        drop = -VANGUARD_SKATE_DIP * push

        local = mat_rotate("y", VANGUARD_SKATE_LEAN)
        local = mat_multiply(mat_rotate("z", VANGUARD_SKATE_TWIST * carry_to),
                             local)
        local = mat_multiply(mat_rotate("x", VANGUARD_SKATE_ROLL * carry_to),
                             local)
        carry = IDENTITY
        if hip:
            carry = mat_multiply(
                mat_translate([0.0, VANGUARD_SKATE_SWAY * carry_to, drop]),
                turn_about(hip, local))

        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)
                continue
            joint = joints[name]
            ride = False
            if name in stroke:
                # OUT TO THE SIDE, always, and further on the push. The splay
                # is what keeps the wheels outside the hips through the whole
                # cycle; a leg that came back under the body every stroke would
                # be stepping.
                out = side[name] * (VANGUARD_SKATE_SPLAY + VANGUARD_SKATE_PUSH
                                    * max(0.0, stroke[name]))
                fore = VANGUARD_SKATE_REACH * stroke[name]
                limb = mat_multiply(mat_rotate("y", fore),
                                    mat_rotate("x", out))
                # THE WHEELS STAY ON THE ROAD, AND DO NOT FOLLOW THE DIP.
                # `plant_leg`'s rule, and it is load-bearing for the same
                # reason: a hip that sinks 0.022 while the wheel stays put IS
                # the leg compressing, which is the thing being drawn. Passing
                # `drop` here instead of zero sinks the wheels into the tarmac
                # by exactly the amount the body dropped -- measured at
                # contactZ -0.0220 on the first build of this gait.
                placed = set_down(geometry[name], joint, limb, 0.0)
            elif name in ("arm_l", "arm_r"):
                leg = "leg_l" if name == "arm_l" else "leg_r"
                drive = stroke.get(leg, 0.0)
                arm_side = 1.0 if name == "arm_l" else -1.0
                limb = mat_rotate("y", VANGUARD_SKATE_ARM_SET
                                  - VANGUARD_SKATE_ARM * drive)
                across = arm_side * (VANGUARD_SKATE_ARM_FLARE
                                     - VANGUARD_SKATE_SWIPE * drive)
                limb = mat_multiply(limb, mat_rotate("x", across))
                placed = turn_about(joint, limb)
                ride = True
            elif name == "head":
                # Level against the body carrying it, exactly as `biped_cycle`
                # holds it: the lean and the roll are both subtracted before
                # the head's own lead is added, so the eyes stay on the road
                # through every weight transfer.
                placed = turn_about(joint, mat_multiply(
                    mat_rotate("y", VANGUARD_SKATE_HEAD_LEAD
                               - VANGUARD_SKATE_LEAN),
                    mat_rotate("x", -VANGUARD_SKATE_ROLL * carry_to)))
                ride = True
            elif name.startswith("shard_"):
                # Driven at draw time. See `biped_cycle` for the whole of why.
                placed = IDENTITY
            elif name == "barrier":
                placed = turn_about(joint,
                                    mat_rotate("y", -VANGUARD_SKATE_LEAN))
                ride = True
            else:
                placed = carry
            pose.append(mat_multiply(carry, placed) if ride else placed)
        poses.append(pose)
    return poses


VANGUARD_DASH_GAIT = {
    "phase": VANGUARD_DASH_PHASE, "duty": VANGUARD_DASH_DUTY,
    "lift": VANGUARD_DASH_LIFT, "reach": VANGUARD_DASH_REACH,
    "rise": VANGUARD_DASH_RISE, "crouch": VANGUARD_DASH_CROUCH,
    "lean": VANGUARD_DASH_LEAN, "pitch": VANGUARD_DASH_PITCH,
    "arm": VANGUARD_DASH_ARM, "arm_set": VANGUARD_DASH_ARM_SET,
    "arm_flare": VANGUARD_DASH_ARM_FLARE,
    "head_lead": VANGUARD_DASH_HEAD_LEAD, "head_nod": VANGUARD_DASH_HEAD_NOD,
}

def vanguard_dash_cycle(groups, frames, geometry, joints, options=None):
    """BAND 1: the opening burst -- swept back, leant over, barely down."""
    return biped_cycle(groups, frames, geometry, joints, VANGUARD_DASH_GAIT)


# --- a cart's rig: a body that rides on wheels -------------------------------
#
# TWO IMPORTS ARRIVED ON WHEELS ON 2026-08-28 -- `speaker-herald.glb` and
# `sapper.glb` -- and neither is a walker, a hoverer or a skater. A cart is a
# fourth thing, and the difference is worth stating because the toolchain
# grades on it: its contact with the road is REAL (the tyres are on the tarmac,
# not floating like the beacon's plinth) and it does not PLANT. It ROLLS, which
# is the one moving contact that is honest, because a rolling wheel's contact
# patch is momentarily at rest however fast the wheel is turning above it.
#
# THE RIG IS TWO RULES AND NOTHING ELSE:
#
#   WHICH PARTS ARE A WHEEL, and which wheel each belongs to. Read off the
#   names, like every other rig here -- but off BOTH the part's own name and
#   its ancestry, and the two answer different halves. The ANCESTRY says WHICH
#   wheel (`drive_wheel_l`, `wheel_assembly_front_r`, `caster`); the PART'S OWN
#   NAME says whether it turns at all. The second test is not decoration:
#   `caster_fork` is the strut the caster swings under, it is a child of the
#   node named `caster`, and a rig that read the ancestor alone would spin the
#   fork with the wheel and drill it through the deck once per stride.
#
#   HOW FAST EACH ONE TURNS, which is measured off the wheel. See `roll_cycle`.
#
# EVERYTHING ELSE IS ONE STATIC GROUP, exactly as the beacon's structure is and
# for the same reason: a group is a draw call per body, these two walk in ones
# and twos, and a deck plank has no more reason to move than a tower's plinth
# does. What sells a cart is its wheels going round; nothing else on it needs a
# matrix, and the Herald's broadcast is already drawn by the tethers its
# `support.tether` block puts on everything it hastens.

# A part that turns with a wheel names itself as one of these. Anything else
# under a wheel node is bodywork bolted beside it and stays with the chassis.
WHEEL_PARTS = ("wheel", "tire", "tyre", "tread", "rim", "hub", "spoke", "ring")

# The node names that OWN a wheel. Both files nest one wheel's pieces under a
# node named for it, which is the whole of what tells the wheels apart -- there
# is no other information in either file about which tyre is the left one.
WHEEL_NODES = ("wheel", "caster")


def cart_is_wheel_group(name):
    """Is this group name a wheel, rather than the chassis?

    Asked by the pivot rule and by the cycle, and asked of the GROUP NAME
    rather than of a list built somewhere else, so the three cannot disagree
    about what a wheel is.
    """
    return bool(name) and any(word in name for word in WHEEL_NODES)


def cart_group_of(part, options):
    """Which wheel a mesh turns with, or the chassis.

    BOTH TESTS MUST PASS. A part with an owning wheel node and no turning name
    (the caster's fork, an axle brace) is chassis; so is a part with a turning
    name and no owner (a bare axle, a rim-shaped trim strip on a cabinet).
    """
    own = part["name"].lower()
    if not any(word in own for word in WHEEL_PARTS):
        return options.body_group
    for name in list(part["chain"][1:]) + [part["name"]]:
        low = name.lower()
        if any(word in low for word in WHEEL_NODES):
            return low
    return options.body_group


def cart_pivot_of(name, points, refs):
    """Where a group turns: a wheel about its own axle, the chassis about zero.

    THE AXLE IS THE CENTROID OF THE WHEEL, and on a wheel that is not an
    approximation -- a tyre, a rim, a hub and a ring of spokes are each centred
    on the axle by construction, so their combined centroid IS it. Nothing here
    is eyeballed and nothing is typed, which is the promise `firefly_pivot_of`
    and `walker_pivot_of` already make.
    """
    if cart_is_wheel_group(name):
        return [sum(p[k] for p in points) / len(points) for k in range(3)]
    return [0.0, 0.0, 0.0]


def wheel_radius(points, joint):
    """A wheel's radius, measured off the wheel.

    The largest distance from the axle in the plane the wheel turns in -- x
    (along the road) and z (up) -- and never in y, which is the wheel's own
    thickness and has nothing to do with how far it rolls per turn.
    """
    return max(math.hypot(p[0] - joint[0], p[2] - joint[2]) for p in points)


def roll_cycle(groups, frames, geometry, joints, options=None):
    """The pose of every group on every frame of one roll.

    A WHEEL'S RATE IS MEASURED, NOT CHOSEN, and this is the cart's answer to
    the thing `walk_cycle` solves for a leg. gl-world.js advances the frame by
    DISTANCE covered -- one cycle is CYCLE_UNITS of travel at every size and
    every speed -- so a wheel of radius r must turn CYCLE_UNITS / (2 pi r)
    times in that cycle or its tyre is sliding down the road. Each wheel is
    measured separately, because a hand-cart's caster is a third the diameter
    of its drive wheels and has to spin three times as fast to keep up.

    AND THEN QUANTIZED TO THE WHEEL'S OWN SYMMETRY, which is the one place this
    departs from the measurement, because the frame list is a LOOP. A wheel
    that has turned 1.368 times when the cycle wraps snaps back a third of a
    turn on the seam, and on a four-spoke wheel that is a visible 42-degree
    jolt once per stride. Rounding the turn count to a whole number of SPOKE
    PITCHES (`--wheel-facets`) makes the wrap invisible instead: the wheel
    comes back to a pose its own symmetry makes indistinguishable from the one
    it left. What is left over is a wheel rolling a fraction of a percent off
    true, which nobody can see, against a jolt everybody can.

    BOTH SHIPPED CARTS CHOOSE THEIR FITTED SIZE SO THERE IS ALMOST NOTHING TO
    ROUND -- the Herald's drive wheel wants 4.000 sixths of a turn at 1.237 u
    and the Sapper's wheels 5.003 quarters at 0.930 u -- so this is a safety
    net on those two rather than a cost being paid. The commands are in this
    file's header and the residual is printed by `--stats`.
    """
    facets = max(1, int(getattr(options, "wheel_facets", 1) or 1))
    turns = {}
    for name, _offset in groups:
        if not name or name not in geometry or name not in joints:
            continue
        if not cart_is_wheel_group(name):
            continue
        joint = joints[name]
        radius = wheel_radius(geometry[name], joint)
        if radius <= 1e-6:
            continue
        exact = CYCLE_UNITS / (2 * math.pi * radius)
        turns[name] = max(1, int(round(exact * facets))) / float(facets)

    poses = []
    for f in range(frames):
        t = f / float(frames)
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)
                continue
            if name in turns:
                # A POSITIVE ROTATION ABOUT y TAKES LOCAL +x TOWARD LOCAL -z,
                # so the front of the wheel goes down and the tyre rolls
                # FORWARD -- the same convention the Hedger's strike is written
                # against in js/gl/gl-world.js.
                pose.append(turn_about(joints[name],
                                       mat_rotate("y", turns[name] * t * 2 * math.pi)))
            else:
                pose.append(IDENTITY)
        poses.append(pose)
    return poses


# --- the Dinomech: ONE MESH, NO HIERARCHY, AND A RIG READ OFF THE GEOMETRY ---
#
# `dinomech.glb` is the wave-40 finale and it arrives as a SINGLE node carrying
# a SINGLE mesh under six named materials. There are no child nodes, so there
# are no names, so the whole apparatus every other rig in this file is built on
# -- "the names are the entire rig" -- has nothing to read. The only rig
# information this file carries is WHERE its geometry is, and this is the rig
# that reads that.
#
# THAT IS A DIFFERENT KIND OF RIG AND IT SAYS SO. `group_of` maps a PART to a
# group, and one part cannot become four, so the split happens one stage
# earlier: `rig["split"]` cuts the single part into named pseudo-parts by the
# position of each triangle's own centroid, and `group_of` then does what it
# always does. `build` runs it after the body has been oriented, scaled,
# grounded, faced and centred, so every threshold below is in the model's final
# space and none of them depends on how the file happened to be authored.
#
# ---- IT IS A BIPED, AND THIS RIG WAS BRIEFLY WRITTEN FOR SOMETHING ELSE -----
#
# On 2026-08-28 this rig was re-authored for `glb/biomech.glb`, a generated
# 502 250-triangle QUADRUPED inside a unit cube that faced -x and carried a
# scythe of a tail curled up over its own back. **That file was withdrawn on
# 2026-08-29 and the body is the skeletal biped again**, now named
# `glb/dinomech.glb`. Everything the quadruped cost has been given back: four
# legs are two, the diagonal trot is a walk, the "tail curls forward over the
# spine" clause is gone, and `source_forward` is **+x** and not -x.
#
# THAT LAST ONE IS THE WHOLE REASON THIS PARAGRAPH EXISTS. The two meshes face
# OPPOSITE WAYS, so a rig carrying the other one's facing turns this body
# through 180 degrees and walks the finale down the road tail-first -- and
# **every instrument in this toolchain reports green on it and always will**,
# because a heel plants exactly as well as a toe. `check-gait-slip.js` graded
# the backwards body 0.001 board px. What actually catches it is asking where
# the EYES are: `Red Optics` is 336 triangles at source x +1.70..+1.96 and
# y 5.23..5.49 -- the head is at +x, near the top, and it is the only material
# on the body that says so. Check that, not the gait, whenever this changes.
#
# ---- THE THRESHOLDS, AND THE SCAN THEY CAME OUT OF --------------------------
#
# All of them are FRACTIONS of the body's own extent, never source units, so
# re-importing at another size cuts the same animal. Every one was measured off
# the mesh rather than chosen:
#
#   BEHIND x = 0.50 L FROM THE NOSE, THERE IS NOTHING BUT TAIL. That is the
#   strongest statement in this header and it is what makes the cut trivial:
#   scanned in half-unit columns from the hips back to the tip, the mesh behind
#   the mid-point holds 7 556 triangles spanning z 1.60..3.47 and |y| <= 0.72,
#   and NOT ONE TRIANGLE of anything else -- no pelvis, no spine, no back
#   plating. So the tail is "behind the middle", full stop.
#
#   BELOW z = 0.30 H AND OUTBOARD OF |y| = 0.33 W IS A LEG. Under 0.30 H this
#   body has no mass within 0.33 W of its own centre line at all: the bottom
#   fifth is two columns at |y| = 0.63..0.99 W with nothing between them, and
#   the centre line fills in at 0.20 H where the crotch starts and is solid by
#   0.30 H. The cut takes 5 075 triangles, 2 537 left and 2 538 right -- a
#   symmetry that is itself the check, since a threshold slicing through a hip
#   would not come out even.
#
#   AND THE TWO TESTS DO NOT OVERLAP, which is measured and not assumed. The
#   tail dips to z 1.60 (0.26 H) and swells to |y| 0.72 (0.53 W) near its root,
#   so on paper it can pass both halves of the leg test -- but not at the same
#   time: the leg cut at 0.30 H / 0.33 W takes **zero** triangles from behind
#   x = 0. At 0.34 H it starts taking 104 of them, which is where a foot would
#   begin swinging with the tail. 0.30 is the value with margin under that.
#
# THE TAIL FLOOR IS A GUARD THAT CHANGES NOTHING ON THIS MESH, and it is kept
# for exactly that reason. Nothing behind the hips sits below 0.26 H today, so
# 0.18 H drops not one triangle; it is here so that a re-export which lets the
# tail tip touch the road does not silently hand a foot to a group that is
# about to be swung through the tarmac.
#
# WHY THE TAIL IS A GROUP AT ALL, and it is not for the walk: the Dinomech's
# second attack is a TAIL SLAM (js/enemy.js), and js/gl/gl-world.js swings this
# group for it off `slamFlash` exactly as it swings the Hedger's `mast` off
# `attackFlash`. A body cannot be given a strike gesture it has no group for --
# `strikeOf` warns and draws the plain walk -- so the attack and the group are
# one decision, made here.
#
# THERE IS NO HEAD GROUP, and that is a decision rather than an omission. The
# skull is at the end of a neck that is already the tallest geometry on the
# body; giving it a matrix would buy a nod nobody can read at 87 board px and
# would put `model.top` at risk for the health bar. The Harvester's rig
# declined the same part for the same reason.

# Where the legs stop and the hips start, as a fraction of the body's height.
SAURIAN_LEG_TOP = 0.30
# How far outboard a triangle must sit to be a leg rather than a belly, as a
# fraction of the body's half-width.
SAURIAN_LEG_INNER = 0.33
# Where the tail leaves the hips, as a fraction of the body's length from the
# NOSE, and how high above the road it has to be to count. See the header: the
# first is the mid-point of the body and the second is a guard.
SAURIAN_TAIL_FROM = 0.50
SAURIAN_TAIL_FLOOR = 0.18


def saurian_split(parts, options):
    """One mesh -> four pseudo-parts, cut by where each triangle sits.

    Returns parts in a stable order (body, tail, then the legs left to right)
    so a re-run cannot reorder the vertex buffer; `build` sorts the group names
    afterwards anyway, but the triangles inside a group are emitted in the
    order they arrive here.

    THE TAIL TEST RUNS FIRST AND THE LEG TEST SECOND. On this body the two are
    disjoint by measurement (see the header), so the order changes nothing
    today -- but the tail is the part that reaches furthest back and lowest,
    and asking about it first is what keeps a re-export that lets it sag from
    quietly welding its tip to a foot.
    """
    every = [p for part in parts for tri in part["triangles"] for p in tri[0]]
    lo_x, hi_x = min(p[0] for p in every), max(p[0] for p in every)
    hi_z = max(p[2] for p in every)
    half_w = max(abs(p[1]) for p in every)
    length = hi_x - lo_x
    leg_top = hi_z * SAURIAN_LEG_TOP
    leg_inner = half_w * SAURIAN_LEG_INNER
    tail_back = hi_x - length * SAURIAN_TAIL_FROM
    tail_floor = hi_z * SAURIAN_TAIL_FLOOR

    legs = ("leg_l", "leg_r")
    buckets = dict((name, []) for name in legs)
    buckets["tail"] = []
    buckets[options.body_group] = []
    for part in parts:
        for tri in part["triangles"]:
            cx = sum(p[0] for p in tri[0]) / 3.0
            cy = sum(p[1] for p in tri[0]) / 3.0
            cz = sum(p[2] for p in tri[0]) / 3.0
            if cx < tail_back and cz > tail_floor:
                where = "tail"
            elif cz < leg_top and abs(cy) > leg_inner:
                # +y is the machine's LEFT, which is what `walker_group_of`
                # already reads a sign for: the game's forward is +x and its up
                # is +z, so a right-handed frame puts left on +y.
                where = "leg_l" if cy > 0 else "leg_r"
            else:
                where = options.body_group
            buckets[where].append(tri)

    order = [options.body_group, "tail"] + list(legs)
    return [{"name": name, "chain": [], "triangles": buckets[name]}
            for name in order if buckets[name]]


def saurian_group_of(part, options):
    """The split already named it. This rig's grouping is its split."""
    return part["name"]


def saurian_pivot_of(name, points, refs):
    """Where each group turns.

    THE LEGS AND THE BODY BORROW THE HUMANOID'S ANSWER, by reference rather
    than by copy: a leg hinges at its top and a body leans about the hip line
    whatever animal it belongs to, and `walk_cycle`'s solve is written against
    exactly those two.

    THE TAIL IS THE ONE NEW JOINT AND IT IS THE TAIL'S ROOT, not its centroid.
    A centroid pivot would have the tail rotating about a point halfway along
    itself, which lifts the tip and drives the base through the hips at the
    same time.

    THE ROOT IS THE SLICE NEAREST THE HIPS, measured by distance from the hip
    line rather than taken as the frontmost slice. On a STRAIGHT tail like this
    one the two rules agree -- its root really is its frontmost point -- and
    they come apart on a tail that curls forward over its own spine, where the
    frontmost point is the TIP. Distance is the rule that is right on both, so
    it is the rule that is written, and it costs nothing here.

    The height and side offset are the mean over the slice, so a tail that
    leaves the body off centre keeps its own line.
    """
    if name.startswith("leg_"):
        return humanoid_pivot_of("leg_l", points, refs)
    if name == "tail":
        hip = refs.get("hip", [0.0, 0.0, 0.0])

        def reach(p):
            return math.hypot(p[0] - hip[0], p[2] - hip[2])

        near = min(reach(p) for p in points)
        band = [p for p in points if reach(p) <= near + TAIL_ROOT_BAND]
        return [sum(p[0] for p in band) / len(band),
                sum(p[1] for p in band) / len(band),
                sum(p[2] for p in band) / len(band)]
    return refs.get("hip", [0.0, 0.0, 0.0])


# How thick the slice at the root of the tail is, in model units, when the
# root joint is measured. Wide enough to average over a real cross-section of
# the spar rather than over whichever three vertices happen to be nearest.
TAIL_ROOT_BAND = 0.06
# The tail's sway, in radians, about the machine's up axis. SMALL on purpose:
# the tail is the longest lever on the board and every radian here is paid for
# in plan extent -- which the ring budget in tools/check-gait-slip.js measures
# and the frost and camo rings are drawn to.
SAURIAN_TAIL_SWAY = 0.055
# And how much it rises and falls with the stride, as a rotation about the side
# axis. Half the sway, because a counterweight bobs less than it swings.
SAURIAN_TAIL_LIFT = 0.028
# A two-legged machine this heavy does not lean into its walk the way a zombie
# does -- what it does is rock, once per footfall, and that is all this is.
SAURIAN_BODY_ROCK = 0.022


def saurian_cycle(groups, frames, geometry, joints, options=None):
    """The pose of every group on every frame of one stride.

    THE LEGS ARE SOLVED BY THE SAME CODE THE ZOMBIE'S ARE -- `leg_series` and
    `plant_leg`, half the cycle planted each, offset by half -- because a foot
    that does not travel backward by exactly the distance the road moves under
    it is skating, and that has one right answer regardless of what is standing
    on the foot. The windows are `walk_cycle`'s own, phased the same way and
    for the reason stated there: `leg_l` starts its plant three quarters of the
    way round so frame 0, the pose a stopped body holds and the one every still
    capture shows, falls in the MIDDLE of a stride rather than at its extreme.

    `about_rest` IS SET, and on this body that matters more than on most: its
    feet are authored well outboard of its hips, and solving for "sole directly
    under the hip" would tuck both underneath it and jack the whole machine up
    to put them back on the road. That is the Harvester's argument.

    THE TAIL IS A COUNTERWEIGHT AND IS ANIMATED AS ONE: it swings AGAINST the
    stride, once per cycle, and lifts at twice that -- the footfall rate, which
    on two legs is once per step -- so it reads as balancing the animal rather
    than as wagging.
    """
    half = frames // 2
    start = frames - frames // 4
    windows = {
        "leg_l": [(start + i) % frames for i in range(half)],
        "leg_r": [(start + half + i) % frames for i in range(half)],
    }

    angles = {}
    for name in windows:
        if name not in geometry:
            continue
        angles[name] = leg_series(geometry[name], joints[name], frames,
                                  windows[name], about_rest=True)

    hip = joints.get("hip")
    poses = []
    for f in range(frames):
        t = f / float(frames)
        slow = t * 2 * math.pi              # once per stride
        fast = slow * 2                     # once per footfall
        carry = (turn_about(hip, mat_rotate("y", SAURIAN_BODY_ROCK *
                                            math.sin(fast)))
                 if hip else IDENTITY)
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)
                continue
            joint = joints[name]
            if name in angles:
                series, lift = angles[name]
                pose.append(plant_leg(geometry[name], joint, series, lift, f))
            elif name == "tail":
                swung = mat_multiply(
                    mat_rotate("z", SAURIAN_TAIL_SWAY * math.sin(slow)),
                    mat_rotate("y", SAURIAN_TAIL_LIFT * math.sin(fast)))
                pose.append(mat_multiply(carry, turn_about(joint, swung)))
            else:
                pose.append(carry)
        poses.append(pose)
    return poses



# --- the Volatile: FOUR NAMED LIMBS, NAMED BY WHERE THEY STAND ---------------
#
# `volatile.glb` is the v0.5.1 diver and it arrives with a real hierarchy --
# `limbs/limb_1..limb_4`, each carrying a shell, its seams and a foot -- so
# unlike the Dinomech there IS something to read. What there is NOT is any
# statement of which limb is which corner of the animal: the four are numbered,
# not named, and a number says nothing about front, back, left or right.
#
# THAT MATTERS BECAUSE THE GAIT IS KEYED ON THE CORNER AND NOT ON THE LIMB.
# `GALLOP_PHASE` puts the hind pair down first and splits each pair by a beat,
# so `leg_bl` and `leg_fl` are two different roles in one rhythm. Bucketing the
# numbers in file order would have been a coin flip per corner -- and a gallop
# whose "hinds" are actually the front pair is a body running backwards on the
# spot, which every instrument in this toolchain reports green (a paw plants
# just as well whichever end of the animal it is on -- see `source_forward`).
#
# SO THE CORNER IS MEASURED, in the model's FINAL space, after `build` has
# oriented, scaled, grounded, faced and centred the body: the game's forward is
# +x and its left is +y, so the sign of each limb's own centroid IS its corner.
# Nothing here depends on how the file happened to be numbered, and a re-export
# that renumbers the limbs imports identically.
#
# WHY THIS IS A `split` AND NOT A `group_of`, which is what a named hierarchy
# would normally use. `group_of` is handed one part at a time and has to answer
# from that part alone; the corner of a limb is only knowable against the OTHER
# three, because "front" means "ahead of the middle of this animal". The split
# stage sees all of them at once, which is the whole reason the saurian rig
# reaches for it too.
#
# THE FOUR CORNERS MUST COME OUT DISTINCT, and a clash is raised rather than
# resolved. Two limbs in one corner means this is not the animal the rig is a
# gait for, and picking a winner would ship a body galloping on three legs with
# a fourth welded into the shell -- the same silent defect `build` raises on an
# absent leg for, one stage earlier.


def volatile_split(parts, options):
    """The limb subtrees -> four legs, each named by the corner it stands in.

    Everything that is not under a `limb_*` node -- the shell, the molten core,
    the crystals and the eyes -- goes into the body group, which is what a
    `group_of` would have done with it anyway.

    Returns parts in a stable order (body, then the legs front to back and left
    to right) so a re-run cannot reorder the vertex buffer.
    """
    limbs = {}
    body = []
    for part in parts:
        stem = None
        for name in list(part["chain"][1:]) + [part["name"]]:
            if name and name.lower().startswith("limb_"):
                # The LIMB, never the shell or the foot under it: everything
                # bolted to a limb travels with it, which is the same rule
                # `quadruped_group_of` states for a named hierarchy.
                stem = name.lower()
                break
        if stem is None:
            body.extend(part["triangles"])
        else:
            limbs.setdefault(stem, []).extend(part["triangles"])

    if len(limbs) != 4:
        raise ValueError("rig volatile wants four limb_* subtrees; this file "
                         "has %d (%s)" % (len(limbs),
                                          ", ".join(sorted(limbs)) or "none"))

    corners = {}
    for stem in sorted(limbs):
        pts = [p for tri in limbs[stem] for p in tri[0]]
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        # +x is forward and +y is the animal's left -- the game's own frame,
        # which `build` has already put these points into.
        corner = "leg_%s%s" % ("f" if cx > 0 else "b", "l" if cy > 0 else "r")
        if corner in corners:
            raise ValueError("rig volatile put %s and %s both at %s; this "
                             "file's limbs do not stand one per corner"
                             % (corners[corner], stem, corner))
        corners[corner] = stem

    order = [options.body_group] + list(VOLATILE_LEGS)
    buckets = {options.body_group: body}
    for corner, stem in corners.items():
        buckets[corner] = limbs[stem]
    return [{"name": name, "chain": [], "triangles": buckets[name]}
            for name in order if buckets.get(name)]


def volatile_group_of(part, options):
    """The split already named it. This rig's grouping is its split."""
    return part["name"]


VOLATILE_LEGS = ("leg_fl", "leg_fr", "leg_bl", "leg_br")


# --- a MISSILE: the first import that is not a body at all -------------------
#
# `missile.glb` is the warhead the Dinomech's silos put in the air
# (js/systems/missiles.js), and it is the first thing this tool imports that
# does not stand on the road. Everything else here is an animal or a machine
# that walks; this is ordnance, and three of the assumptions the rest of the
# file is built on come apart on it.
#
# IT IS AUTHORED STANDING ON ITS TAIL. The nose is at source y = +3.02 and the
# exhaust plume hangs below the nozzle at y = -1.58: a rocket on a pad, which
# is how a missile is modelled and is ninety degrees away from how one FLIES.
# `source_forward` cannot fix that -- it is a yaw about the up axis, so it can
# turn a body that is already lying down and can do nothing to one that is
# standing up. What lays it down is `source_up: "z"`, which says the axis this
# file should be stood up along is its OWN z -- a radial direction through the
# fins, because a missile has no up of its own -- leaving the long axis
# horizontal for `source_forward: "+y"` to yaw onto the game's forward.
#
# So the two declarations are doing different halves of one rotation here,
# rather than the "which way is up" and "which way is the head" they do for
# every walking body. That is worth stating because the pair reads like a
# mistake otherwise: a y-up file declaring z-up is exactly what a careless
# import looks like.
#
# `--exclude sparks` IS NOT OPTIONAL ON THIS FILE. The `sparks` node is a POINT
# primitive (glTF draw mode 0), and `collect` raises on any mode but triangles
# rather than silently dropping it -- correctly, because a mesh this tool
# cannot read is a mesh the board would be missing without anyone being told.
# There is nothing to lose: a spark shower is what js/effects.js already throws
# at the impact, in the one place this game draws debris.
#
# THE PLUME IS A GROUP SO THAT IT CAN BURN. It is the only part of a missile
# that moves at all -- the airframe is rigid, and rigid is the whole of what a
# warhead does between the silo and the tower -- so this rig's "cycle" is a
# throttle flicker and nothing else. See `missile_cycle`.


def missile_group_of(part, options):
    """The exhaust, or the airframe.

    Matched on the `thrust` parent rather than on each plume's own name so the
    shock diamonds inside the flame travel with it, which is the rule
    `quadruped_group_of` states for a named hierarchy and the reason the
    exporter put them under one node.
    """
    for name in list(part["chain"][1:]) + [part["name"]]:
        if name and name.lower() == "thrust":
            return "plume"
    return options.body_group


def missile_pivot_of(name, points, refs):
    """Where the flame is anchored: the nozzle, which is its FRONT.

    The plume streams backward from the nozzle along -x once the body has been
    laid down and faced, so the end that must not move when the throttle
    flickers is its maximum x. Scaling about the centroid instead would push
    the flame forward into the boat tail on every bright frame.
    """
    if name == "plume":
        return [max(p[0] for p in points),
                sum(p[1] for p in points) / len(points),
                sum(p[2] for p in points) / len(points)]
    return [0.0, 0.0, 0.0]


# How far the exhaust stretches and shrinks over one cycle, as a fraction of
# its own length, and how much of that reaches the flame's width. A rocket
# motor's plume pulses far more along its axis than across it -- the width is
# set by the nozzle and the length by what is coming out of it -- so the two
# numbers are deliberately not the same.
MISSILE_THROTTLE = 0.22
MISSILE_FLARE = 0.07


def missile_cycle(groups, frames, geometry, joints, options=None):
    """The airframe is rigid; the flame flickers. That is the whole animation.

    TWO BEATS PER CYCLE, NOT ONE. gl-world.js advances an unbanded model's
    frames off a clock for anything that does not touch the road, and a single
    slow swell reads as a balloon inflating; a motor roars. The second harmonic
    is a third of the first so the flicker is uneven, which is what keeps it
    from reading as a sine.

    A SCALE, WHICH NO OTHER CYCLE IN THIS FILE EMITS. Every walking rig poses
    its groups with rotations, because a limb that changed size would be a limb
    that changed shape. A flame is not geometry in that sense -- it is the one
    part of any model here whose length IS its state -- so the pose is a
    non-uniform scale about the nozzle, built directly rather than through
    `mat_rotate`.
    """
    poses = []
    for f in range(frames):
        t = f / float(frames)
        beat = (math.sin(t * 2 * math.pi) +
                0.33 * math.sin(t * 4 * math.pi + 1.1))
        along = 1.0 + MISSILE_THROTTLE * beat
        across = 1.0 + MISSILE_FLARE * beat
        pose = []
        for name, _offset in groups:
            if not name:
                pose.append(None)
                continue
            if name != "plume":
                pose.append(IDENTITY)
                continue
            joint = joints[name]
            # Scale about the nozzle: translate the joint to the origin, scale,
            # and put it back. Written out rather than reached for through
            # `turn_about`, which composes a ROTATION and would silently drop
            # the scale's off-diagonal-free diagonal.
            scaled = [[along, 0.0, 0.0, 0.0],
                      [0.0, across, 0.0, 0.0],
                      [0.0, 0.0, across, 0.0],
                      [0.0, 0.0, 0.0, 1.0]]
            pose.append(mat_multiply(
                mat_translate([joint[0], joint[1], joint[2]]),
                mat_multiply(scaled,
                             mat_translate([-joint[0], -joint[1], -joint[2]]))))
        poses.append(pose)
    return poses


# --- the mechanical dragon: A FIRST-LOOK RIG, AND IT SAYS SO -----------------
#
# `dragon.glb` is a Tripo export: ONE node, ONE mesh, ONE material with a
# 2048x2048 base colour atlas, 100 568 triangles, authored inside a unit cube
# and already grounded at y = 0. Structurally it is `biomech.glb` again, so it
# needs a rig that reads its grouping off the GEOMETRY.
#
# THIS ENTRY IS DELIBERATELY NOT THAT RIG YET. It ships the body as ONE static
# group with no cycle, for one reason: **which end is the head cannot be read
# off this file.** Both ends taper to |z| ~ 0.02, there is no emissive material
# to give the skull away (the Dinomech's `Red Optics` is what that check rests
# on), and NOTHING IN THIS TOOLCHAIN MEASURES FACING -- a backwards body grades
# 0.001 board px on check-gait-slip.js and passes every suite. A split that
# names legs "front" and "back" is a split that has already assumed the answer,
# so the answer gets established by LOOKING first, on the board, at a body that
# is merely oriented and painted.
#
# What this pass is for, in order: does the silhouette survive the decimation,
# does `texture_bands` give the paint back, and which way is it pointing.
# Grouping and gait come after, once those three are facts.
#
# `source_forward` WAS A GUESS AND THE GUESS WAS WRONG. The long axis is source
# x, so it has to be declared (a y-up remap defaults to "+z", which would walk
# the body sideways down the road). "+x" was the starting assumption, on the
# strength of where the mass and the wider pair of ground contacts sat. Drawn
# beside the Dinomech at the same yaw the two pointed OPPOSITE ways, so it is
# "-x": this dragon's skull is at its -x end. Neither the geometry scan nor the
# palette settled it -- both ends taper to |z| ~ 0.02 and the one saturated
# band splits across the body -- and only the side-by-side did.


def dragon_group_of(part, options):
    """Everything is the body, for now. See the header."""
    return options.body_group


def dragon_pivot_of(name, points, refs):
    """Nothing turns yet, so nothing needs a joint."""
    return [0.0, 0.0, 0.0]


def dragon_cycle(groups, frames, geometry, joints, options=None):
    """One rest pose repeated: a body that is drawn, not animated.

    Emitted as real frames rather than an empty list so the model carries the
    same shape every other import here does and gl-world's band reader has
    something to index. A static body costs one matrix per frame and no solve.
    """
    return [[IDENTITY for _name, _offset in groups] for _f in range(frames)]


# --- the rigs, and what each one is a set of --------------------------------
#
# A GROUPING, A SET OF PIVOTS AND A CYCLE ARE ONE DECISION, NOT THREE. A wing
# hinge means nothing to a walk and a solved plant means nothing to a body that
# never touches the ground, so they are declared together and chosen together.
# `fit_axis` belongs here for the same reason: an insect is measured nose to
# tail (glTF -Z) and a person is measured floor to crown (glTF Y), and reading
# the wrong one off a body scales it by its own aspect ratio.

# The six directions a rig may declare as its file's forward, in that file's own
# coordinates. See the note in `build`: this is `fit_axis`'s companion, not a
# tuning knob, and getting it wrong is a body that walks backwards with every
# instrument in the toolchain reporting green.
FORWARD_VECTORS = {
    "+x": (1.0, 0.0, 0.0), "-x": (-1.0, 0.0, 0.0),
    "+y": (0.0, 1.0, 0.0), "-y": (0.0, -1.0, 0.0),
    "+z": (0.0, 0.0, 1.0), "-z": (0.0, 0.0, -1.0),
}

RIGS = {
    "firefly": {
        "group_of": firefly_group_of,
        "pivot_of": firefly_pivot_of,
        "cycle": hover_cycle,
        "fit_axis": 2,                  # glTF Z: nose to tail
        "fit_name": "length",
        "default_size": 0.82,
    },
    "humanoid": {
        "group_of": humanoid_group_of,
        "pivot_of": humanoid_pivot_of,
        "cycle": walk_cycle,
        "fit_axis": 1,                  # glTF Y: floor to crown
        "fit_name": "height",
        "default_size": 1.19,           # what enemy-normal stands
        "legs": ("leg_l", "leg_r"),
        # Points stay in world space and the joint goes into the matrix, so
        # GLModels' `model.top` is the real crown. See the rig's header.
        "origin_pivot": True,
    },
    "plodder": {
        # Grouping is the only thing this rig owns; the pivots and the gait are
        # the humanoid's, referenced rather than copied so a fix to the walk
        # reaches both bodies. See the header above PLODDER_LIMBS.
        "group_of": plodder_group_of,
        "pivot_of": humanoid_pivot_of,
        "cycle": walk_cycle,
        "fit_axis": 1,                  # glTF Y: sole to crown
        "fit_name": "height",
        # THIS FILE FACES -Z, which is the opposite of every import before it.
        # Its ToePlates, ChestPlate and FacePlate are all at negative z where
        # the Revenant's chest_plate is at +0.108..+0.295. Without this the
        # plodder walks down the road backwards and nothing reports it: the
        # gait still solves, and slip still scores 0.000, because a heel plants
        # exactly as well as a toe.
        "source_forward": "-z",
        # 0.979, WHICH IS THE BODY THIS ONE REPLACES AND NOT THIS MESH'S OWN
        # PROPORTIONS. The Slow has drawn 31.1 px of body (0.979 * 31.8032 at
        # its sizeScale of 1.0) since the chassis built it, and that is the
        # silhouette every wave it appears in was balanced to read -- it is
        # deliberately SHORTER than a normal's 37.8 px. Fitting the plodder to
        # the humanoid's own 1.19 default would have quietly made the slow type
        # the taller of the two. Same argument as the beacon's 1.40: an import
        # inherits the silhouette of the body it replaces.
        "default_size": 0.979,
        "legs": ("leg_l", "leg_r"),
        "origin_pivot": True,
    },
    "tyrant": {
        # Grouping only; the pivots and the gait are the humanoid's, by
        # reference. See the header above TYRANT_LEG_PARTS.
        "group_of": tyrant_group_of,
        "pivot_of": humanoid_pivot_of,
        "cycle": walk_cycle,
        # Z-UP, like the beacon and unlike the other six.
        "source_up": "z",
        # AND FACING -Y, which no import before it did. Its jaw, sensor brow and
        # all three threat sensors sit at y = -0.9..-1.2; its foot claws point
        # the same way. Without this the Tyrant walks the road sideways.
        "source_forward": "-y",
        # Measured floor to antenna tip, which for a z-up source is axis 2.
        "fit_axis": 2,
        "fit_name": "height",
        # 1.076, THE BODY THIS ONE REPLACES. The Tyrant has drawn 82.1 px of
        # body since the chassis built it (1.076 * 31.8032 at its sizeScale of
        # 2.40) and AGENTS.md balances the roster against exactly that figure --
        # "82 tall and 70 wide", the tallest thing that walks. Fitting this mesh
        # to its own proportions would have moved the silhouette the whole
        # campaign ends on. Same argument as the plodder's 0.979 and the
        # beacon's 1.40.
        "default_size": 1.076,
        "legs": ("leg_l", "leg_r"),
        "origin_pivot": True,
    },
    "quadruped": {
        "group_of": quadruped_group_of,
        "pivot_of": quadruped_pivot_of,
        "cycle": run_cycle,
        # A DOG IS MEASURED NOSE TO TAIL, NOT AT THE SHOULDER, and the axis is
        # the one thing here that cannot be a matter of taste: fitting a
        # long-and-low body by its height would scale it by its own aspect
        # ratio and put a 47 px animal on a board sized for 38 px ones.
        "fit_axis": 2,                  # glTF Z: nose to tail
        "fit_name": "length",
        "default_size": 1.15,
        "legs": ("leg_fl", "leg_fr", "leg_bl", "leg_br"),
        "origin_pivot": True,
    },
    "spectre": {
        "group_of": spectre_group_of,
        "pivot_of": spectre_pivot_of,
        "cycle": drift_cycle,
        # MEASURED FLOOR TO CROWN like the bipeds, and for a body that never
        # touches the floor that needs saying: what is fitted is the height of
        # the whole apparition, tail tip to plume tip, because that is its
        # silhouette on the road. How far off the ground it then rides is not
        # this tool's business at all -- it is `hover` on the type in
        # js/enemy.js, which the 2D board and the 3D board both read.
        "fit_axis": 1,                  # glTF Y: tail tip to plume tip
        "fit_name": "height",
        # TALLER THAN THE BIPEDS' 1.19, and the Healer's own sizeScale of 1.45
        # is not what makes it so -- that scales every body it is set on. This
        # is a thing with no legs whose lower third is a skirt of tails, so a
        # crown-height fit at 1.19 would put its actual mass -- the core and
        # its rings -- at about two thirds the height of a zombie's chest, on
        # the type the player is being taught to shoot FIRST.
        "default_size": 1.42,
        # No `legs`: there is nothing here to solve a plant for, which is the
        # whole of what separates this rig from the three above it.
        "origin_pivot": True,
    },
    "beacon": {
        "group_of": beacon_group_of,
        "pivot_of": beacon_pivot_of,
        "cycle": broadcast_cycle,
        # THE ONLY Z-UP SOURCE IN THE SET. See the note in `build`: this file
        # is authored with its base on z = 0, so the glTF Y-up remap every
        # other import needs would lay it on its side.
        "source_up": "z",
        # Measured floor to antenna tip, which for a z-up source is axis 2.
        "fit_axis": 2,
        "fit_name": "height",
        # 1.40, AND IT IS THE ONE NUMBER HERE THAT IS NOT ABOUT THIS MESH. The
        # Tender it replaces stood 1.593 u -- 68.4 board px at the type's own
        # sizeScale of 1.35, the tallest body in the enemy roster. This beacon
        # HOVERS, so its drawn crown is the model plus `hover.liftRadii` * the
        # body's radius: 1.40 * 31.8032 * 1.35 + 0.55 * 14.85 = 68.3 px. The
        # type keeps the silhouette height the wave was balanced to read, and
        # the lift is bought out of the model rather than added on top of it.
        "default_size": 1.40,
        # No `legs`: nothing here plants, which is the whole of what separates
        # this rig and the spectre's from the three that solve a gait.
        "origin_pivot": True,
    },
    # THE TWO HALVES OF ONE BODY. Same source convention, same grouping, same
    # pivots, same fitted height -- and two cycles, because the swap between
    # them is a swap of how the machine MOVES. See `bulwark_group_of` for the
    # grouping and the three traps in these files, and the two gait blocks above
    # for what separates a jog from a bound.
    #
    # BOTH ARE Z-UP AND FACE -Y, exactly like `boss.glb` and unlike the six y-up
    # imports. Measured: feet on z = 0, antenna tip at z 3.077 (shielded) and
    # 3.037 (stripped), and every faceplate, visor, toe and gauntlet at negative
    # y. Get either wrong and the specialist walks the road on its side or
    # sideways, with the gait still solving and slip still reading 0.000.
    "bulwark": {
        "group_of": bulwark_group_of,
        # The humanoid's, by reference: a boot plants the way a boot plants, and
        # a limb hinges at its top whatever the limb is called. Same borrowing
        # `plodder` and `tyrant` make.
        "pivot_of": humanoid_pivot_of,
        "cycle": sprint_cycle,
        "source_up": "z",
        "source_forward": "-y",
        "fit_axis": 2,                  # a z-up source is measured on axis 2
        "fit_name": "height",
        # 1.354, WHICH IS THE BODY THIS ONE REPLACES AND NOT THIS MESH'S OWN
        # PROPORTIONS. The Courier has drawn 49.5 px of body (1.354 * 31.8032 at
        # the Bulwark's sizeScale of 1.15) since the chassis built it, and that
        # is the silhouette every wave it appears in was balanced to read.
        # Same argument as the plodder's 0.979, the Tyrant's 1.076 and the
        # beacon's 1.40: an import inherits the silhouette of the body it
        # replaces.
        "default_size": 1.354,
        "legs": ("leg_l", "leg_r"),
        "origin_pivot": True,
    },
    # THE SAME MACHINE WITH ITS SHIELD GONE, AND IT MUST IMPORT AT THE SAME
    # SCALE, not merely at the same fitted height. The two files are not quite
    # the same proportion -- 3.0771 source units against 3.0371, because the
    # halo tops out just under the antenna -- so fitting each to 1.354 would
    # make the stripped body's every part 1.3% larger and the Bulwark would grow
    # at the instant its shield popped. `--span` is the mechanism (it exists for
    # the Revenant's two halves); the import line in this file's header passes
    # the shielded file's own measured span, and the stripped body comes out at
    # 1.336 as a CONSEQUENCE of being the same machine.
    "bulwark_overdrive": {
        "group_of": bulwark_group_of,
        "pivot_of": humanoid_pivot_of,
        "cycle": bound_cycle,
        "source_up": "z",
        "source_forward": "-y",
        "fit_axis": 2,
        "fit_name": "height",
        # Never reached in practice -- the import passes --height and --span
        # together -- and it is the shielded body's number rather than a second
        # one so that a bare re-run cannot silently resize half of a pair.
        "default_size": 1.354,
        "legs": ("leg_l", "leg_r"),
        "origin_pivot": True,
    },
    # ONE RIG FOR BOTH VANGUARD FILES, AND TWO CYCLES INSIDE IT. See the block
    # above `VANGUARD_HEAD_PARTS` for why that is the opposite arrangement to
    # the Bulwark's pair and still the right one.
    #
    # Y-UP AND FACING +Z, which is the glTF convention and the default here, so
    # neither `source_up` nor `source_forward` appears. Measured rather than
    # assumed: feet on y = 0 and the crest tip at y 4.35, `visor` at z
    # 0.230..0.290 and `toe_claw_1` at z 0.360..0.560 against `back_plate` at
    # z -0.400..-0.240. Both files agree.
    "vanguard": {
        "group_of": vanguard_group_of,
        "pivot_of": vanguard_pivot_of,
        # BAND 0 IS THE SKATE AND BAND 1 IS THE DASH, in that order and not the
        # other one. Band 0 is what every reader that does not know about bands
        # falls back to (`walkBand` in gl-world.js, and the exporter's own
        # contract note), and the skate is the gait this body spends all but the
        # first 400 u.l. of its life in. A fallback should be the common case.
        "cycles": (vanguard_skate_cycle, vanguard_dash_cycle),
        "fit_axis": 1,                  # glTF Y: sole to crest tip
        "fit_name": "height",
        # 1.298, WHICH IS THE BODY THIS ONE REPLACES AND NOT THIS MESH'S OWN
        # PROPORTIONS -- `tools/check-model-top.js` reads exactly 1.298 off the
        # chassis-built enemy-boss_fast, and at the type's sizeScale of 1.9 that
        # is the 78.4 board px every wave the Vanguard appears in was balanced
        # to read. Same argument as the plodder's 0.979, the Tyrant's 1.076, the
        # beacon's 1.40 and the Bulwark's 1.354.
        "default_size": 1.298,
        "legs": ("leg_l", "leg_r"),
        "origin_pivot": True,
    },
    # A CART, WHICH IS THE FOURTH KIND OF CONTACT IN THIS FILE. See the header
    # above `cart_group_of`: it is not a walker, not a hoverer and not a
    # skater, and the difference is that its wheels are ON the road and are
    # MEANT to turn under it.
    #
    # Y-UP AND FACING +Z, which is the glTF convention and the default here, so
    # neither `source_up` nor `source_forward` appears. Measured rather than
    # assumed on both files: the Herald's caster (its steering wheel) sits at
    # z +0.52 against its drive axle at z -0.14 and its push handle at z -0.50,
    # and its speaker baffle faces +z; the Sapper's front axle is at z +0.21
    # and its rear at z -0.21, its eyes and emitter at +z and its coil pack at
    # -z. Both roll toward +z, which the y-up remap sends to the game's +X.
    #
    # NO `legs`. There is nothing here to solve a plant for, which is what this
    # rig shares with the spectre's and the beacon's -- and unlike those two,
    # this body does not hover: it touches the road with a rolling contact, so
    # tools/check-gait-slip.js grades it as a GLIDE band rather than exempting
    # it as clock-driven. See the note beside `GLIDES` in that file.
    #
    # THE DEFAULT SIZE IS THE HERALD'S, and both shipped sizes are chosen off
    # the WHEEL rather than off the body -- see `roll_cycle`. 1.237 u at the
    # Herald's own sizeScale of 1.15 is 45.2 board px, deliberately taller than
    # a Trudge's 37.8: a standard-bearer the player is being taught to shoot
    # first has to be findable in the crowd it is hastening.
    "cart": {
        "group_of": cart_group_of,
        "pivot_of": cart_pivot_of,
        "cycle": roll_cycle,
        "fit_axis": 1,                  # glTF Y: road to the top of the load
        "fit_name": "height",
        "default_size": 1.237,
        "origin_pivot": True,
    },
    # THE DINOMECH, AND THE ONLY RIG HERE WHOSE GROUPING IS NOT READ OFF A
    # NAME. See the header above `saurian_split` for why, and for the scan the
    # four thresholds came out of.
    #
    # Y-UP AND FACING +X. Its `Red Optics` -- 336 triangles, the only material
    # on the body that says which end is the head -- sit at source x +1.70,
    # y 5.23..5.49, so the skull is at the +x end and near the crown. Under a
    # y-up remap the default facing is "+z", which would put the head on the
    # game's LEFT, so this has to be declared; and it is declared as **+x**
    # rather than the -x this rig briefly carried for the withdrawn
    # `biomech.glb`. Left on -x the finale walks the road backwards with every
    # instrument reading green -- a heel plants exactly as well as a toe --
    # which is the failure the Trudge's own entry warns about and which this
    # body has actually shipped once.
    #
    # 1.05 u AT ITS OWN sizeScale OF 2.6 IS 86.8 BOARD px, which makes it the
    # tallest body in the game by 1.9 px over the Tyrant's 84.9 -- and unlike
    # every other import here, that number is NOT inherited from a body this
    # one replaces. There is no such body: wave 40 drew an untextured sphere
    # until this type was meshed. So the figure is set against the roster
    # instead, and it is set deliberately close: the finale should be the
    # tallest thing that walks, and it should not be so by a margin that makes
    # the Tyrant look small in the wave before it.
    "saurian": {
        "split": saurian_split,
        "group_of": saurian_group_of,
        "pivot_of": saurian_pivot_of,
        "cycle": saurian_cycle,
        "source_forward": "+x",
        "fit_axis": 1,                  # glTF Y: road to crest
        "fit_name": "height",
        "default_size": 1.05,
        "legs": ("leg_l", "leg_r"),
        "origin_pivot": True,
    },
    # THE VOLATILE, 2026-08-28. Four limbs off a molten shell, and the only
    # rig here whose legs are named by MEASUREMENT rather than by the file --
    # see the header above `volatile_split`.
    #
    # `run_cycle` AND NOT `saurian_cycle`, which is the other four-legged gait
    # in this file and the wrong one for this body. A saurian trots: diagonals
    # in lockstep, half the cycle planted each, no frame with nothing on the
    # road. This type's whole character is that it arrives faster than a slow
    # gun can re-aim (js/enemy.js), so what it has to read as is a RUN -- the
    # gallop's quarter-cycle duty leaves two suspensions per stride, and a
    # moment of flight is the only thing that separates the two gaits to the
    # eye at 20 board px.
    #
    # MEASURED FLOOR TO CROWN, like the bipeds and unlike the hound, because
    # this animal is a SPHERE on stubs: its length and its height are the same
    # number to within a few percent, so a nose-to-tail fit would scale it by
    # the reach of its own crystals. 1.013 u is the height the body shipped at
    # before it had a gait, and it is held deliberately -- the change the owner
    # asked for on 2026-08-28 was "make them smaller", and that is `sizeScale`
    # on the type, which moves the hit radius and the health bar with the mesh.
    # Shrinking the model here instead would have drawn a smaller body inside
    # the same hit box, rings and shadow.
    "volatile": {
        "split": volatile_split,
        "group_of": volatile_group_of,
        # A leg hinges at its top and a body rides its own hip line, whatever
        # animal they belong to -- referenced, not copied, so a fix to either
        # reaches both bodies.
        "pivot_of": quadruped_pivot_of,
        "cycle": run_cycle,
        "fit_axis": 1,                  # glTF Y: sole to crystal tip
        "fit_name": "height",
        "default_size": 1.013,
        "legs": VOLATILE_LEGS,
        "origin_pivot": True,
    },
    # THE WARHEAD, 2026-08-28. Not a body -- see the header above
    # `missile_group_of` for why `source_up` and `source_forward` are doing
    # something different here than they do for anything that walks.
    #
    # 0.75 u IS 23.9 BOARD px NOSE TO PLUME TIP, of which the airframe itself
    # is 15.9. Set against what it is drawn NEXT TO rather than against the
    # file: six of these leave a machine 94 px long and cross a board where the
    # smallest body on the roster is 12 px across, so a missile has to be a
    # thing you can count at a glance and must not be a thing you mistake for
    # an enemy. There is no body this one replaces and no silhouette to
    # inherit; js/gl/gl-world.js scales it from here and nothing else.
    "missile": {
        "group_of": missile_group_of,
        "pivot_of": missile_pivot_of,
        "cycle": missile_cycle,
        "source_up": "z",
        "source_forward": "+y",
        # SOURCE Y, WHICH IS THE ONE PLACE THIS RIG DEPARTS FROM THE RULE
        # `build` states two paragraphs above `source_up`: a z-up source is
        # measured along axis 2. That rule is about bodies STOOD UP along the
        # axis they were authored along, and this file is not stood up along
        # its z -- its z is a radius through the fins, 0.44 u wide. Fitting on
        # it would scale the missile by its own calibre.
        "fit_axis": 1,                  # glTF Y: nozzle plume to nose cone
        "fit_name": "length",
        "default_size": 0.75,
        "origin_pivot": True,
    },
    # THE MECHANICAL DRAGON -- a FIRST-LOOK rig. See the header above
    # `dragon_group_of` for why it has no split and no gait yet.
    "dragon": {
        "group_of": dragon_group_of,
        "pivot_of": dragon_pivot_of,
        "cycle": dragon_cycle,
        # MEASURED BY EYE, NOT GUESSED. The first import declared "+x" on the
        # strength of where the mass sat; drawn beside the Dinomech at the same
        # yaw -- whose head is at model +x and is VERIFIED off its `Red Optics`
        # -- the two pointed opposite ways. This body's skull is at its -x end.
        # That comparison is the check to repeat, because nothing in this
        # toolchain measures facing and a backwards body passes every suite.
        "source_forward": "-x",
        "fit_axis": 0,                  # glTF X: this body's long axis
        "fit_name": "length",
        "default_size": 1.787,          # the Dinomech's length, to compare like
                                        # with like on the board
        "origin_pivot": True,
    },
    "walker": {
        "group_of": walker_group_of,
        "pivot_of": walker_pivot_of,
        "cycle": march_cycle,
        # A MACHINE THIS SHAPE IS MEASURED FLOOR TO CROWN, like a person and
        # unlike the hound, because its height is the one dimension that is not
        # a consequence of how far apart its legs are planted.
        "fit_axis": 1,                  # glTF Y: road to antenna tip
        "fit_name": "height",
        # THE SAME 1.19 THE BIPEDS STAND, AND NOT A COINCIDENCE. At the
        # midboss's own sizeScale of 1.8 that is 68 px tall and 82 px wide on
        # the board, against the wave-35 Tyrant's 82 tall and 70 wide: the
        # Harvester is the widest thing that walks the road and it is still not
        # the tallest, which is the right way round for the body that arrives
        # twenty-four waves before the boss does.
        "default_size": 1.19,
        "legs": ("leg_fl", "leg_fr", "leg_bl", "leg_br"),
        "origin_pivot": True,
    },
}


# --- assembly ---------------------------------------------------------------

def build(gltf, options):
    rig = RIGS[options.rig]
    parts = collect(gltf, options.exclude)

    # PAINT FIRST, BEFORE ANY OTHER STAGE HAS AN OPINION. `texture_bands` reads
    # the base colour atlas at each triangle's own UV, quantises what it finds
    # into synthetic materials, and hands back the (points, material) pairs
    # every stage below already takes -- so orientation, splitting, decimation
    # and the palette de-dup are the same code for a painted body as for a
    # hand-authored one. It is a no-op, tuple shape included, on a file whose
    # materials carry their own colours.
    paint = texture_bands(gltf, parts, options.texture_bands)

    # ORIENT, SCALE, GROUND. glTF is Y-up; this game is Z-up with forward on
    # +X. The remap below is (x, y, z) <- (gz, gx, gy), whose determinant is
    # +1 -- a rotation, not a mirror -- so every triangle keeps its winding and
    # GLRenderer's back-face cull keeps showing the outside.
    #
    # WHICH AXIS IS MEASURED IS THE RIG'S TO SAY, and `--span` overrides even
    # that. Two bodies that must be interchangeable on the board -- the
    # Revenant's living and undead halves -- have to arrive at ONE scale, and
    # fitting each to the same target height instead would silently rescale
    # whichever of them happens to be shorter. Handing both the FIRST one's
    # measured span makes them the same creature at the same size, and the
    # difference between them stays the difference the artist authored.
    raw = [p for part in parts for tri in part["triangles"] for p in tri[0]]
    axis = rig["fit_axis"]
    measured = max(p[axis] for p in raw) - min(p[axis] for p in raw)
    span = max(options.span or measured, 1e-6)
    scale = options.size / span

    # A .glb IS NOT ALWAYS Y-UP, AND THE ONE THAT IS NOT ARRIVES LYING DOWN.
    #
    # The remap above is the glTF convention and every import before the beacon
    # obeyed it. `shieldbearer.glb` does not: it is authored Z-UP (its
    # base sits at z = 0 and its antenna tip at z = 5.35, measured before
    # anything was built), so the Y-up remap tips a five-metre spire onto its
    # side -- which is exactly what the owner reported and asked to be fixed.
    #
    # A rig declares which it is, because the convention belongs to the FILE and
    # a rig is written against one file's hierarchy. Both maps are proper
    # rotations of determinant +1 -- the z-up one is the identity, which is the
    # cheapest rotation there is -- so neither can flip a winding and put
    # GLRenderer's back-face cull on the wrong side of the mesh.
    #
    # `fit_axis` stays in SOURCE coordinates for both. It answers "which axis of
    # THIS FILE is the body measured along", and a rig that knows its file's
    # convention knows that too: 1 (glTF Y) for a y-up source, 2 for a z-up one.
    up = rig.get("source_up", "y")
    if up == "z":
        floor = min(p[2] for p in raw)

        def convert(p):
            return (p[0] * scale, p[1] * scale, (p[2] - floor) * scale)

        def redirect(d):
            return (d[0], d[1])
    else:
        floor = min(p[1] for p in raw)

        def convert(p):
            return ((p[2] - 0.0) * scale, p[0] * scale, (p[1] - floor) * scale)

        def redirect(d):
            return (d[2], d[0])

    for part in parts:
        part["triangles"] = [([convert(p) for p in tri[0]], tri[1])
                             for tri in part["triangles"]]

    # WHICH WAY THE BODY FACES IS THE FILE'S TO SAY, EXACTLY AS `source_up` IS,
    # AND THE COST OF GETTING IT WRONG IS A BODY THAT WALKS BACKWARDS.
    #
    # The remaps above fix which axis is UP; neither says anything about which
    # way the thing is pointing once it is standing. The game's forward is +X
    # (gl-world.js says so, and `anchorWorld` proves it), and the y-up remap
    # sends source +Z there -- so every import until now has silently assumed
    # "this file faces +Z", which happened to be true of all six.
    #
    # IT IS NOT TRUE OF ALL OF THEM. `slow.glb` faces -Z: its ToePlates,
    # ChestPlate and FacePlate all sit at negative z, where the Revenant's
    # `chest_plate` sits at +0.108..+0.295. Imported on the old assumption the
    # plodder walked down the road backwards, gait solved and slip at 0.000 --
    # because a heel plants just as well as a toe and NOTHING in the pipeline
    # measures facing. `boss.glb` is worse: it is z-up AND faces -Y, so the
    # identity remap the beacon needs would have marched the Tyrant sideways.
    # The beacon never revealed this because a radially symmetric spire has no
    # front to get wrong.
    #
    # Declared in SOURCE coordinates for the same reason `fit_axis` is -- it is
    # a fact about THIS FILE -- then carried through the same remap and undone
    # as a yaw about the up axis. A yaw is a proper rotation, so it cannot flip
    # a winding onto the wrong side of the back-face cull, and it is applied
    # BEFORE the centring below so the body is centred as it will be drawn.
    #
    # THE DEFAULTS ARE THE OLD BEHAVIOUR EXACTLY: "+z" under a y-up remap and
    # "+x" under a z-up one both land on +X, which is a yaw of zero, and a zero
    # yaw skips the loop entirely rather than multiplying every point by an
    # identity built out of cos and sin. The six imports that predate this
    # reproduce byte-identical, which is the only acceptable outcome for a
    # change to a shared stage of the pipeline.
    facing = rig.get("source_forward", "+x" if up == "z" else "+z")
    if facing not in FORWARD_VECTORS:
        raise ValueError("rig %s declares source_forward %r; expected one of %s"
                         % (options.rig, facing, ", ".join(sorted(FORWARD_VECTORS))))
    ahead = redirect(FORWARD_VECTORS[facing])
    yaw = math.atan2(ahead[1], ahead[0])
    if yaw:
        cos_y = math.cos(-yaw)
        sin_y = math.sin(-yaw)

        def turn(p):
            return (p[0] * cos_y - p[1] * sin_y,
                    p[0] * sin_y + p[1] * cos_y,
                    p[2])

        for part in parts:
            part["triangles"] = [([turn(p) for p in tri[0]], tri[1])
                                 for tri in part["triangles"]]

    # The centre of the body, on the ground, is the origin. A model whose x
    # ranged 0.0 .. 0.83 would hover a whole body-length ahead of the point the
    # path says it is at, and every range check in the game uses that point.
    xs = [p[0] for part in parts for tri in part["triangles"] for p in tri[0]]
    ys = [p[1] for part in parts for tri in part["triangles"] for p in tri[0]]
    shift = ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0)
    for part in parts:
        part["triangles"] = [([(p[0] - shift[0], p[1] - shift[1], p[2])
                               for p in tri[0]], tri[1])
                             for tri in part["triangles"]]

    # GROUPED AFTER THE BODY IS CENTRED, which is a change of order and not of
    # geometry -- the shift above is computed and applied exactly as before, and
    # the three imports that predate this are byte-identical across it.
    #
    # It is here because a rig may have to place a part by WHERE IT IS rather
    # than by what it is called: `walker_group_of` reads the sign of a limb's
    # own centroid, and a sign is only meaningful once the machine's centre line
    # is at zero rather than at whatever origin the file was authored around.
    # A RIG MAY HAVE TO CUT THE PARTS UP BEFORE IT CAN GROUP THEM, and exactly
    # one does. `group_of` maps a PART to a group and a part cannot become
    # four, so a source that arrives as a single undivided mesh -- which
    # `dinomech.glb` does -- has no way to reach four groups
    # through it. `split` runs here, one stage earlier, with the body already
    # oriented, scaled, grounded, faced and CENTRED, so a rig that cuts by
    # position is cutting in the model's final space rather than around
    # whatever origin the file was authored about. Absent on every other rig,
    # which is what keeps their output byte-identical.
    if rig.get("split"):
        parts = rig["split"](parts, options)

    for part in parts:
        part["group"] = rig["group_of"](part, options)

    before = sum(len(part["triangles"]) for part in parts)
    for part in parts:
        part["triangles"] = cluster(part["triangles"], options.cell * scale,
                                    options.floor)
    after = sum(len(part["triangles"]) for part in parts)

    # Where each wing turns, taken from the hinge the model ships for it.
    hinges = {}
    for part in parts:
        if part["name"].startswith("wing_hinge_") and part["triangles"]:
            pts = [p for tri in part["triangles"] for p in tri[0]]
            hinges.setdefault(part["group"], []).extend(pts)

    # Groups come out SORTED, exactly as export_mesh.py emits them, so the
    # unnamed one is first and a reader comparing two model files is comparing
    # the same shape of thing.
    names = sorted(set(part["group"] for part in parts))
    member = {}
    for name in names:
        pts = [p for part in parts if part["group"] == name
               for tri in part["triangles"] for p in tri[0]]
        if pts:
            member[name] = pts

    # WHAT A PIVOT MAY LOOK AT BESIDES ITS OWN POINTS. The wing hinges above,
    # and the hip line -- which is the mean of the two legs' own pivots, so a
    # body's lean turns about the joints its legs are solved about rather than
    # about a point somebody liked the look of.
    #
    # A DECLARED LEG THAT DID NOT ARRIVE IS AN ERROR, NOT A LIMP. The rig names
    # the legs it is a gait for, so a source that spells one of them differently
    # would otherwise ship a body galloping on three -- and the fourth would not
    # be missing, it would be welded into the torso and drawn stiff, which is
    # the kind of defect that survives a preview and is found on the board.
    refs = {"hinges": hinges}
    absent = [name for name in rig.get("legs", ()) if name not in member]
    if absent:
        raise ValueError("rig %s wants %s; this file has no geometry under %s"
                         % (options.rig, ", ".join(rig["legs"]),
                            ", ".join(absent)))
    legs = [name for name in rig.get("legs", ()) if name in member]
    if legs:
        tops = [rig["pivot_of"](name, member[name], refs) for name in legs]
        refs["hip"] = [sum(t[k] for t in tops) / len(tops) for k in range(3)]
        # The lean is a pitch about the side axis, so a hip line off centre in
        # y would tip the body sideways as well as forward.
        refs["hip"][1] = 0.0

    # A JOINT AND A STORAGE OFFSET ARE NOT THE SAME NUMBER, and only one rig so
    # far separates them. `joints` is where a group TURNS; the second half of
    # each `groups` pair is where its points are STORED relative to. They are
    # equal on the firefly and the offset is zero on the humanoid -- see that
    # rig's note on `model.top` for why.
    joints = {}
    for name in names:
        if name in member:
            joints[name] = rig["pivot_of"](name, member[name], refs)
    joints["hip"] = refs.get("hip")

    at_origin = rig.get("origin_pivot", False)
    groups = [(name, [0.0, 0.0, 0.0] if at_origin else joints[name])
              for name in names if name in member]

    palette = []
    lookup = {}
    positions = []
    normals = []
    colour_index = []
    out_groups = []
    # THE POINTS THE CYCLE IS SOLVED AGAINST ARE THE POINTS THAT SHIP -- local
    # to the group and rounded to PRECISION, exactly what check-gait-slip.js
    # will read back out of the .js file. Solving against the unrounded source
    # would be solving a body that is not the one on the board.
    emitted = {}

    for name, pivot in groups:
        first = len(colour_index) * 3
        mine = emitted.setdefault(name, [])
        for part in parts:
            if part["group"] != name:
                continue
            for tri in part["triangles"]:
                # Geometry is stored in the group's LOCAL space, so the frame
                # matrix is the whole of the animation. Same contract as the
                # Blender exporter's, arrived at from the other direction:
                # there the pivot is an empty, here it is a measurement.
                local = [(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2])
                         for p in tri[0]] if name else list(tri[0])
                n = triangle_normal(local)
                entry = material_entry(
                    gltf.json["materials"][tri[1]], options.tint, options.glow,
                    options.emit_cap)
                key = tuple(entry)
                if key not in lookup:
                    lookup[key] = len(palette)
                    palette.append(list(entry))
                colour_index.append(lookup[key])
                normals.extend(round(v, PRECISION) for v in n)
                for p in local:
                    rounded = tuple(round(v, PRECISION) for v in p)
                    positions.extend(rounded)
                    mine.append(rounded)
        out_groups.append({"name": name, "first": first,
                           "count": len(colour_index) * 3 - first})

    # ONE CYCLE OR SEVERAL, AND SEVERAL ARE DECLARED AS `bands` RATHER THAN
    # COUNTED BY A READER.
    #
    # A rig with more than one gait concatenates them into the single frame list
    # the format has and says where each one starts and how long it is. That
    # pair is the whole contract -- `export_mesh.py` emits the same field for
    # the same reason, and gl-world.js's `walkBand` exists because every
    # off-by-one it replaced came from a reader dividing `frames.length` by
    # something. A reader must never divide.
    #
    # ABSENT MEANS "THIS RIG DID NOT DECLARE A LAYOUT", which is what every
    # import before this one wants: one cycle, and the whole list is it. That is
    # also what keeps those seven models byte-identical across this change --
    # the single-cycle path runs exactly the call it used to.
    cycles = rig.get("cycles") or (rig["cycle"],)
    frames = []
    bands = []
    for cycle in cycles:
        # `options` IS HANDED TO THE CYCLE, and every cycle that predates the
        # cart rig ignores it (they take it as a defaulted fifth parameter and
        # never read it, so their output is byte-identical across this change).
        # It is here for the one thing a cycle can need that is a fact about
        # the FILE rather than about the rig: `--wheel-facets` is a property of
        # the wheels in a particular .glb, exactly as `--exclude`, `--cell` and
        # `--height` are properties of a particular .glb, and the alternative
        # was a second rig entry per spoke count.
        block = cycle(groups, options.frames, emitted, joints, options)
        bands.append([len(frames), len(block)])
        frames.extend(block)
    frames = [[None if m is None else
               [round(m[r][c], 5) for c in range(4) for r in range(4)]
               for m in pose] for pose in frames]

    return {"name": options.name, "triangles": len(colour_index),
            "palette": palette, "positions": positions, "normals": normals,
            "colourIndex": colour_index, "groups": out_groups,
            "frames": frames, "bands": bands if len(cycles) > 1 else None,
            "before": before, "after": after, "paint": paint,
            "scale": scale, "span": span}


def write_js(model, filename, source):
    path = os.path.join(OUTPUT_DIR, filename)

    def arr(values):
        return "[" + ",".join(
            (repr(v) if isinstance(v, int) else ("%g" % v))
            for v in values) + "]"

    lines = [
        "// GENERATED by tools/glb_to_model.py -- do not edit.",
        "// Source of truth is %s; re-run the importer." % source,
        "//",
        "// %d triangles, %d colours. Normals and colours are per TRIANGLE;" %
        (model["triangles"], len(model["palette"])),
        "// positions are per vertex. GLModels.register expands them.",
        "GLModels.register(%s, {" % json.dumps(model["name"]),
        "  unitsToPx: %g," % UNITS_TO_PX,
        "  triangles: %d," % model["triangles"],
        "  palette: %s," % json.dumps(model["palette"]),
        "  groups: %s," % json.dumps(model["groups"]),
    ] + ([
        # Emitted ONLY by a rig that declared more than one cycle. An absent
        # `bands` is not "no bands" and not "one band" -- it means this model
        # never declared a layout, and every reader falls back to treating the
        # whole list as one cycle. See `build`.
        "  bands: %s," % json.dumps(model["bands"]),
    ] if model.get("bands") else []) + [
        "  frames: %s," % json.dumps(model["frames"]),
        "  positions: %s," % arr(model["positions"]),
        "  normals: %s," % arr(model["normals"]),
        "  colourIndex: %s" % arr(model["colourIndex"]),
        "});",
        ""
    ]
    with open(path, "w") as handle:
        handle.write("\n".join(lines))
    return os.path.getsize(path)


# --- looking at it ----------------------------------------------------------
#
# DO NOT DISCOVER AN IMPORT PROBLEM BY LOADING THE GAME. An orientation that is
# ninety degrees out, a winding the cull eats, a decimation grid that has taken
# the wings off -- all three are one glance to spot and a long session to
# attribute from inside a running board, and MODEL_SKINS_GUIDE.md already says
# so about the sprite pipeline ("do not discover clipping by rendering").
#
# So the importer draws its own contact sheet, in the SAME fixed camera the
# sprite renders use: screen_right = x, screen_up = 0.56y + 0.829z. Painter's
# algorithm, flat shading, one column per facing and one per animation frame.
# It is a hundred lines and it has caught the axis remap twice.


def _png(path, width, height, pixels):
    """A 24-bit PNG from a bytearray of RGB rows. zlib is in the stdlib."""
    import zlib

    raw = bytearray()
    for y in range(height):
        raw.append(0)                                   # filter: none
        raw.extend(pixels[y * width * 3:(y + 1) * width * 3])

    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data +
                struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    open(path, "wb").write(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) +
        chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def _posed_triangles(model, frame, yaw):
    """Every triangle in WORLD space at one frame, posed and yawed."""
    pose = model["frames"][frame % len(model["frames"])]
    c, s = math.cos(yaw), math.sin(yaw)
    out = []
    for gi, group in enumerate(model["groups"]):
        m = pose[gi]
        for v in range(group["first"], group["first"] + group["count"], 3):
            tri = []
            for k in range(3):
                p = model["positions"][(v + k) * 3:(v + k) * 3 + 3]
                if m:
                    # frames are column-major, the order WebGL wants
                    p = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
                         m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
                         m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14])
                tri.append((p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]))
            out.append((tri, model["colourIndex"][v // 3]))
    return out


def preview(model, path, tile=190, frames=(0, 3, 6, 9),
            yaws=(0.0, math.pi / 2, math.pi, -math.pi / 2)):
    cols, rows = len(frames), len(yaws)
    width, height = tile * cols, tile * rows
    pixels = bytearray([18, 21, 30] * width * height)

    # The sprite camera, exactly. Depth grows away from it, so painting in
    # descending depth is back-to-front.
    def project(p):
        return p[0], 0.56 * p[1] + 0.829 * p[2]

    def depth(p):
        return 0.829 * p[1] - 0.56 * p[2]

    view = (0.0, 0.829, -0.56)
    key = (-0.45, -0.55, 0.70)
    klen = math.sqrt(sum(v * v for v in key))
    key = tuple(v / klen for v in key)

    ortho = 1.35                                        # Blender units across
    for row, yaw in enumerate(yaws):
        for col, frame in enumerate(frames):
            tris = _posed_triangles(model, frame, yaw)
            tris.sort(key=lambda t: -max(depth(p) for p in t[0]))
            ox, oy = col * tile, row * tile
            for tri, colour in tris:
                n = triangle_normal(tri)
                if n[0] * view[0] + n[1] * view[1] + n[2] * view[2] > 0:
                    continue                            # back face, as GL culls
                entry = model["palette"][colour]
                lam = max(0.0, sum(n[k] * key[k] for k in range(3)))
                emit = min(1.0, entry[3] * 0.16)
                shade = [min(1.0, entry[k] * (0.32 + 0.72 * lam) + emit)
                         for k in range(3)]
                rgb = [int(255 * v) for v in shade]
                pts = []
                for p in tri:
                    sx, sy = project(p)
                    pts.append((ox + tile * (0.5 + sx / ortho),
                                oy + tile * (0.86 - sy / ortho)))
                _fill(pixels, width, height, pts, rgb, ox, oy, tile)
    _png(path, width, height, pixels)
    return width, height


def _fill(pixels, width, height, pts, rgb, ox, oy, tile):
    """Scanline-fill one triangle, clipped to its own tile."""
    lo_y = max(int(math.floor(min(p[1] for p in pts))), oy)
    hi_y = min(int(math.ceil(max(p[1] for p in pts))), oy + tile - 1)
    if lo_y > hi_y:
        return
    (ax, ay), (bx, by), (cx, cy) = pts
    area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
    if abs(area) < 1e-9:
        return
    for y in range(max(lo_y, 0), min(hi_y, height - 1) + 1):
        py = y + 0.5
        xs = []
        for (x0, y0), (x1, y1) in ((pts[0], pts[1]), (pts[1], pts[2]),
                                   (pts[2], pts[0])):
            if (y0 <= py < y1) or (y1 <= py < y0):
                xs.append(x0 + (py - y0) * (x1 - x0) / (y1 - y0))
        if len(xs) < 2:
            continue
        x_lo = max(int(math.floor(min(xs))), ox, 0)
        x_hi = min(int(math.ceil(max(xs))), ox + tile - 1, width - 1)
        base = y * width * 3
        for x in range(x_lo, x_hi + 1):
            i = base + x * 3
            pixels[i] = rgb[0]
            pixels[i + 1] = rgb[1]
            pixels[i + 2] = rgb[2]


# THE AETHER WISP IS BLUE, and it is blue in six places that are not this file.
#
# js/enemy.js gives the type `color: { r: 108, g: 190, b: 246 }`, and that one
# value already drives the 2D body, the kill burst, the codex swatch, the hover
# card and the minimap. The imported firefly lights its lantern yellow-green and
# its eyes hot orange, which are good colours for a firefly and would put the
# only glowing thing on the board in a hue the game uses nowhere -- a player
# would have no reason to connect it to the Wisp entry they just read.
#
# So the two EMISSIVE materials are retinted and nothing else is: the carbon
# shell, the brass and the gunmetal arrive exactly as authored. Values are the
# type colour in LINEAR light, because that is the space glTF emissive factors
# live in and material_entry converts once on the way out.
#
#   (108, 190, 246) / 255, gamma 2.2  ->  0.153, 0.526, 0.921
#
# The eyes take a hotter, whiter cut of the same hue so the head still reads as
# a separate thing from the lantern at 23 px.
WISP_TINT = {
    "lantern_glow": [0.153, 0.526, 0.921],
    "eye_lens": [0.55, 0.82, 1.0],
}

# THE HOUND IS LAVA, AND LAVA IS THREE TEMPERATURES.
#
# At the owner's instruction (2026-08-17), replacing the amber this shipped with
# first. The amber was the `fast` type's own `color` from `js/enemy.js` -- the
# argument being that a body should be lit in the colour of its codex swatch --
# and it read as YELLOW, which is a lamp, not molten rock.
#
# WHY THIS IS THREE ENTRIES AND NOT ONE COLOUR APPLIED THRICE. Lava does not
# have a colour, it has a temperature gradient, and this model already carries
# the geometry for one -- the three emissive materials land on parts at three
# different depths into the body:
#
#   ember_vent   the ten cracks along the spine, the rib, rear and cheek vents.
#                CRUST. Cooling rock split open, so the deepest orange.
#   ember_core   the chest furnace, the mouth, the nose, the brows, the four
#                KNEE glows and the six tail joints -- everywhere the inside
#                shows through a gap. Hotter, and yellower for being hotter.
#   ember_eye    two triangles. The white-hot point, which is what keeps the
#                skull reading as a separate thing from the chest at 37 px.
#
# **THE HEATS ARE LOW, AND THAT IS WHAT MAKES THE COLOUR SATURATED.** This is
# the counterintuitive half and the reason the numbers look wrong next to the
# source's own 3.2 / 2.4 / 5.0. `uGlow` is 0 for a body on the board, so a
# material's whole emission is `GLModels.expand`'s resting floor: `min(1, e *
# 0.16)` added to each linear channel EQUALLY. That floor is white. Raising the
# heat therefore does not make a part more orange, it makes it less -- it drags
# every channel toward 1 together, and the hottest number available is also the
# whitest. Measured through the board's own lighting (ambient 0.125/0.142/0.180,
# key 1.02), a key-lit face of each:
#
#   crust  e=0.55 -> (254, 127,  93)      furnace e=0.90 -> (254, 176, 117)
#   eye    e=1.40 -> (254, 246, 165)      the amber it replaces -> (254, 254, 167)
#
# The amber's own green and red were BOTH pinned at 254 -- that is the yellow,
# and no choice of base colour fixes it at that heat.
#
# Values are LINEAR, which is the space glTF emissive factors live in and the
# space `material_entry` converts out of exactly once. The six unlit materials
# -- carbon shell, plating, gunmetal, joints, teeth, claws -- arrive as authored
# and are the grey the lava is set into.
#
# WHAT THIS GIVES UP. The `fast` type's swatch, hover card, kill burst and
# minimap dot are all still (240, 199, 71) amber, so the body no longer matches
# them exactly. Orange against amber is a drift and not a miss -- unlike the
# firefly's yellow-green against blue, which is what that rule was written for.
# Moving `js/enemy.js` too would repaint five pieces of 2D interface, and that
# is a decision about the interface rather than about this mesh.
HOUND_TINT = {
    "ember_vent": [1.0, 0.09, 0.0, 0.55],
    "ember_core": [1.0, 0.22, 0.0, 0.90],
    "ember_eye": [1.0, 0.55, 0.08, 1.40],
}

# A TINT BELONGS TO A BODY, NOT TO A RIG. It was keyed on `--rig firefly` when
# the firefly was the only import with one, and the header there already names
# the hazard: applied to a zombie it would find no material of those names and
# do nothing, a silent dependency on a coincidence. A second tinted body makes
# the coincidence real -- `--rig quadruped` is a gait, and the next quadruped
# imported through it will not be amber. The MODEL NAME is what a palette
# decision is actually about, and keying on it leaves the Wisp import
# byte-identical because that import is `--name enemy-flying`.
# THE HARVESTER HAS ONE LAMP, AND IT IS THE WRONG COLOUR.
#
# `midboss.glb` carries exactly one emissive material -- `lens`, the single eye
# in the turret head -- and it arrives orange-red at strength 0.6. Ten
# materials, one of them lit: on this body the lens is not decoration, it is the
# only part of an eighty-pixel machine of rust and gunmetal that a player's eye
# is drawn to first.
#
# `js/enemy.js` gives the type `color: { r: 214, g: 74, b: 138 }`, and that one
# value already drives the codex swatch, the hover card, the kill burst, the
# minimap dot and -- uniquely for this type -- the NAMED HEALTH BANNER across
# the top of the screen while it is alive. Wave 11 is the wave that introduces
# a boss bar, so "the pink bar at the top belongs to the pink-eyed thing on the
# road" is a connection the player has to make once, at a glance, and an orange
# eye simply does not offer it. This is the firefly's case (a lantern in a hue
# the game uses nowhere), not the hound's (orange against amber).
#
#   (214, 74, 138) / 255, gamma 2.2  ->  0.680, 0.066, 0.259
#
# THE HEAT IS LOW BECAUSE THE COLOUR MATTERS. `uGlow` is 0 for a body on the
# board, so a material's whole emission is `GLModels.expand`'s resting floor,
# min(1, e * 0.16) added to every LINEAR channel equally -- and that floor is
# white. 0.85 spends 0.136 of it, which lifts the lens clear of the dark head it
# is set into while leaving the magenta intact; the source's own 0.6 is dimmer
# than the part deserves and the hound's eye heat of 1.4 would wash it pale.
MIDBOSS_TINT = {
    "lens": [0.680, 0.066, 0.259, 0.85],
}

# THE LANTERN IS THE ONE PART THAT ARRIVES TOO HOT, and this is the whole of
# the Healer's palette decision.
#
# `healer.glb` is emissive from end to end -- all six of its materials
# glow -- and imported with `--glow emissive` its five outer ones land where the
# artist put them: a cyan ramp from the pale plume tips down to the deep blue of
# the orbiting shards. The core does not. `core_crystal` is authored at strength
# 2.6 and `core_inner` at 4.0, and `GLModels.expand` spends a material's whole
# emission as a WHITE floor of min(1, e * 0.16) -- 0.42 and 0.64 added to every
# linear channel. That is not a bright cyan crystal, it is a white blob with a
# cyan body hanging off it, which is what the first import drew.
#
# COLOURS UNCHANGED, HEAT RETUNED. Each rgb below is the material's own
# `emissiveFactor` copied verbatim (they are already linear, which is the space
# a tint's first three numbers are in), so nothing here repaints the artist's
# work -- the fourth number is the entire edit, and it exists because a strength
# authored for a path tracer that renders bloom is not a strength for a board
# that adds white. 1.0 and 1.2 leave the crystal the brightest thing on the
# body, which is right for a lantern, and leave it CYAN, which the source
# strengths did not.
#
# The four outer materials are absent on purpose rather than by oversight: 0.9
# to 1.6 spend floors of 0.14 to 0.26, which lights them without bleaching them,
# and a tint entry that restated the authored value would be a value to keep in
# step with the file for no gain.
HEALER_TINT = {
    "core_crystal": [0.323, 0.687, 1.0, 1.0],
    # THE ONE COLOUR HERE THAT IS NOT THE ARTIST'S. `core_inner` emits a flat
    # white -- correct in a renderer where it is seen THROUGH a cyan crystal at
    # alpha 0.95, and this format has no alpha, so the crystal is opaque and the
    # glow ball inside it (radius 0.32, against an octahedron whose inradius is
    # 0.286) pokes out through six flat faces as a white dot in the middle of a
    # cyan body. Given to the crystal's own hue, lifted towards white, it reads
    # as what it is: the hot heart of the lantern, in the lantern's colour.
    "core_inner": [0.55, 0.85, 1.0, 1.2],
    # AND THE PALE HALF OF THE SKIRT, which is a different argument from the
    # two above and is worth separating from them. The core was too HOT; this
    # one is the right heat and too WEAK a colour. `wisp_pale` carries all four
    # plumes and three of the six tails -- the largest area on the body -- and
    # its authored emissive is a pale blue that, lit and floored, lands at about
    # (209, 245, 255): a white apparition with cyan trim, on a board where the
    # thing it is meant to be reading as is the cyan one. Pulled to the crystal's
    # own hue at a hair under full saturation, the same body lands near
    # (140, 220, 255) on its lit faces, which is the colour of the cord it
    # throws. The deep half of the skirt (`wisp_ectoplasm`) is untouched: it is
    # what the pale half now has to read AGAINST.
    "wisp_pale": [0.311, 0.751, 1.0, 0.75],
}

# THE BEACON ARRIVES LIT FOR A PATH TRACER, AND EVERY LAMP ON IT IS TOO HOT.
#
# Four of its seven materials emit, at strengths of 2.25, 3.5, 5.0 and 8.0.
# `GLModels.expand` spends a material's whole emission as a resting floor of
# min(1, e * 0.16) added to every LINEAR channel -- and that floor is WHITE --
# so those four arrive as floors of 0.36, 0.56, 0.80 and 1.00. The last of
# those is not a hot cyan, it is the colour white; the crystal at 0.80 is a
# white blob with a dark spire under it. This is the Healer's case exactly, and
# it is settled the same way: COLOURS UNCHANGED, HEAT RETUNED. Every rgb below
# is the material's own `emissiveFactor` copied verbatim -- they are already
# linear, which is the space a tint's first three numbers are in -- and the
# fourth number is the entire edit.
#
# The ladder between them is what carries the body's read at 60 px: the hotspot
# is the brightest thing on the model because it is the smallest, the crystal
# it sits inside is next, the shield field it broadcasts is below that, and the
# channels -- which have the largest lit area by far, running the full height
# of the spire -- are the dimmest, because an area that big at a lamp's heat
# stops being a detail and becomes the body's colour.
BEACON_TINT = {
    "Core_Hotspot": [0.62, 1.0, 1.0, 1.30],
    "Auroris_Core_Cyan": [0.02, 0.92, 1.0, 1.00],
    "Shield_Field": [0.02, 0.72, 1.0, 0.70],
    "Energy_Channel_Cyan": [0.0, 0.82, 1.0, 0.55],
}

# THE BULWARK'S ONE LAMP, AND IT IS HERE BECAUSE `--glow sum` GOT IT WRONG.
#
# `Bulwark_Energy_Gold` is the only emissive material in either bulwark file --
# the power paths in the chest, the halo's twenty ring segments and their nodes,
# the leg springs, the visor, the antenna tip. It carries a bright base (1.0,
# 0.66, 0.11) AND a bright emissive (0.82, 0.38, 0.015), which is neither of the
# two cases `material_entry`'s `glow` argument was written for: summed in linear
# light those clamp to (1.0, 1.0, 0.125) -- the red and the green both pinned --
# and a rich amber ships as PALE YELLOW. The authored strength of 1.0 then adds
# `min(1, e * 0.16)` = 0.16 of WHITE on top of it, and the springs came out as
# white stripes on a navy machine. Seen on the real renderer before this was
# written, which is the only way this class of defect gets caught.
#
# SO THE HUE IS THE EMISSIVE'S OWN, PUSHED TO FULL, AND THE HEAT IS LOW. Same
# trade HOUND_TINT documents at length and for the same reason: the resting
# floor is white, so a saturated lit part is bought with a SMALL number, not a
# big one. 0.55 is the hound's lava crust, which is the closest thing in the
# library to what this is -- a hot line showing through a gap in armour.
#
# ONE TABLE, TWO NAMES. The shielded body and the stripped one are the same
# machine and share this material outright (both files ship all eight materials
# with identical values, halo or no halo), so a second table would be a second
# place for the two halves of one body to drift apart at the moment they swap.
#
# THE GOLD IS NOT THE TYPE'S CODEX COLOUR and that is deliberate, exactly as it
# is on the hound. `Enemy.TYPES.shielded.color` is a pale cyan (118, 196, 214)
# and the 2D board, the codex swatch and the health bars all keep it; the mesh
# keeps the navy-and-gold the artist painted, because the armour, the trim and
# the halo were authored as one scheme and repainting one material of it cyan
# would leave a cyan lamp on a gold machine.
BULWARK_TINT = {
    "Bulwark_Energy_Gold": [1.0, 0.46, 0.02, 0.55],
}

# THE MISSILE'S EXHAUST, AND IT IS HERE BECAUSE THE FILE DECLARES NO EMISSION
# AT ALL. Its four plume materials are `KHR_materials_unlit` -- the glTF way of
# saying "draw this at its base colour and do not light it", which is exactly
# right in a renderer that has an unlit path and means nothing whatever in this
# one. `material_entry` reads emission, finds none, and ships a rocket flame as
# four shades of flat orange plastic: the correct colour, with no heat in it,
# on the one part of the model whose whole job is to be the brightest thing in
# the frame.
#
# THE RGB IS EACH MATERIAL'S OWN BASE COLOUR, unchanged and only converted to
# the linear space a tint's first three numbers live in, so the flame keeps the
# ladder the artist painted -- deep orange outside, pale gold inside, white at
# the core. The fourth number is the entire edit, and it is a LADDER for the
# reason BEACON_TINT gives: the resting floor is white, so the smallest,
# innermost part carries the most heat and the big outer envelope carries the
# least, or the flame blows out into one white blob at 24 board px.
#
# THE SHOCK DIAMONDS ARE THE HOTTEST THING ON THE MODEL and are 24 triangles.
# That is the whole argument for giving them 1.30 where the outer envelope gets
# 0.30: they are what says this is a rocket motor rather than a flare.
MISSILE_TINT = {
    "plume_outer": [0.75, 0.08, 0.005, 0.30],
    "plume_mid": [1.0, 0.25, 0.012, 0.55],
    "plume_core": [1.0, 0.89, 0.56, 0.85],
    "shock_diamond": [1.0, 1.0, 1.0, 1.30],
}

# THE VOLATILE IS A ROCK WITH A FIRE INSIDE IT, AND `--emit-cap` ALONE SHIPS
# THE FIRE AS WHITE. This is the hound's case and the beacon's case again, in
# the same terms both of those are settled in.
#
# The file emits at 2.8 (`magma_core`), 3.4 (`magma_whitehot`) and 2.4
# (`eye_arc`). `GLModels.expand` spends a strength as a resting floor of
# min(1, e * 0.16) added to every LINEAR channel, and that floor is WHITE --
# so even capped at 1.6 all three arrive with 0.26 of white under them, which
# turns a saturated orange into salmon and the white-hot core into the colour
# white. Seen on the real page, in the index's own viewer, before this was
# written; it is not a thing a palette dump shows.
#
# COLOURS UNCHANGED, HEAT RETUNED, and the heats are a LADDER by AREA rather
# than by temperature -- which is the counter-intuitive half and the one
# BEACON_TINT spells out. The seams of magma are the largest lit area on the
# body by a wide margin, so they take the LOWEST heat or they stop being a
# detail and become the body's colour; the white-hot vents are a tenth of that
# area and can carry more; the two eyes are 22 triangles and carry the most,
# because they are what makes this thing read as alive rather than as a rock.
#
# THE RGBs ARE EACH MATERIAL'S OWN EMISSIVE, pushed to full saturation for the
# reason HOUND_TINT gives at length: a vivid lit part is bought with a SMALL
# number, not a big one, so the hue has to start where it means to end up.
#
# THE BASALT AND THE OBSIDIAN ARE UNTOUCHED AND ARE MEANT TO BE. They are not
# emissive at all, so a tint cannot reach them -- `material_entry` will not let
# a palette decision turn plating into a lamp -- and they should not be
# reached: a near-black shell with hot seams through it is what makes a
# 12 px body on a green board read as an ember rolling down the road, which is
# the whole silhouette this type is asking for.
VOLATILE_TINT = {
    "magma_core": [1.0, 0.18, 0.02, 0.5],
    "magma_whitehot": [1.0, 0.62, 0.12, 0.85],
    "eye_arc": [0.06, 0.45, 1.0, 1.15],
}

TINTS = {
    "missile": MISSILE_TINT,
    "enemy-volatile": VOLATILE_TINT,
    "enemy-shieldbearer": BEACON_TINT,
    "enemy-flying": WISP_TINT,
    "enemy-fast": HOUND_TINT,
    "enemy-midboss": MIDBOSS_TINT,
    "enemy-healer": HEALER_TINT,
    "enemy-shielded": BULWARK_TINT,
    "enemy-shielded-broken": BULWARK_TINT,
}


def main():
    parser = argparse.ArgumentParser(
        description="Convert a .glb into a js/gl/models/*.js the game loads "
                    "from file://.")
    parser.add_argument("source", help="path to the .glb")
    parser.add_argument("--name", default="enemy-flying",
                        help="model id GLModels.register is called with")
    parser.add_argument("--out", default=None,
                        help="output filename (default <name>.js)")
    parser.add_argument("--rig", default="firefly", choices=sorted(RIGS),
                        help="how the hierarchy divides into groups, where "
                             "they turn, and what cycle they move in")
    parser.add_argument("--length", type=float, default=None,
                        help="nose-to-tail size in Blender units (--rig "
                             "firefly, --rig quadruped). The board's own scale: "
                             "enemy-swarm is 0.77 long. Defaults to the rig's "
                             "own: 0.82 firefly, 1.15 quadruped.")
    parser.add_argument("--height", type=float, default=None,
                        help="floor-to-crown size in Blender units (--rig "
                             "humanoid). The board's own scale: enemy-normal "
                             "stands 1.19 and the Bulwark 1.354. Default 1.19.")
    parser.add_argument("--span", type=float, default=None,
                        help="use this SOURCE-unit span for the fit instead of "
                             "the one measured off this file, so two variants "
                             "of one body import at the same scale")
    parser.add_argument("--exclude", action="append", default=[],
                        metavar="NODE",
                        help="drop this node and everything under it; repeat "
                             "for more. Errors if it matches nothing.")
    parser.add_argument("--body-group", default=None,
                        help="name of the group everything unclaimed by a limb "
                             "goes into (default <name minus enemy->_body)")
    parser.add_argument("--glow", default="emissive",
                        choices=("emissive", "sum"),
                        help="colour of an emissive material: its emissive "
                             "factor alone, or base + emissive. See "
                             "material_entry -- `sum` is right for new work.")
    parser.add_argument("--emit-cap", type=float, default=None,
                        dest="emit_cap", metavar="STRENGTH",
                        help="clamp every emissive strength to at most this. "
                             "At rest the board spends emission as "
                             "min(1, e*0.16) added to each channel, so an "
                             "imported 5 ships a WHITE part, not a bright one. "
                             "See material_entry. A tint entry's own fourth "
                             "number overrides this for that material.")
    parser.add_argument("--texture-bands", type=int, default=6,
                        dest="texture_bands", metavar="N",
                        help="how many colours a BASE COLOUR TEXTURE is "
                             "quantised into, one synthetic material each. "
                             "Ignored by a file whose materials carry their "
                             "own colours; 0 turns the stage off and ships a "
                             "textured body in its material's flat colour. "
                             "See texture_bands.")
    parser.add_argument("--cell", type=float, default=0.018,
                        help="decimation grid, in SOURCE units")
    parser.add_argument("--floor", type=int, default=300,
                        help="parts at or below this many triangles are left "
                             "alone")
    parser.add_argument("--wheel-facets", type=int, default=1,
                        dest="wheel_facets", metavar="N",
                        help="how many poses one of this file's wheels has "
                             "per turn -- its spoke count (--rig cart). A "
                             "wheel's roll is rounded to a whole number of "
                             "these so the cycle's wrap is invisible. See "
                             "roll_cycle. Default 1: whole turns only.")
    parser.add_argument("--frames", type=int, default=12,
                        help="frames in one cycle")
    parser.add_argument("--stats", action="store_true",
                        help="report and write nothing")
    parser.add_argument("--preview", default=None,
                        help="also draw a contact sheet PNG here")
    args = parser.parse_args()

    # A tint is one body's palette decision, looked up by that body's name. See
    # TINTS for why this is not keyed on the rig any more.
    args.tint = TINTS.get(args.name, {})
    fit = RIGS[args.rig]["fit_name"]
    given = {"length": args.length, "height": args.height}
    for other, value in given.items():
        if other != fit and value is not None:
            parser.error("--%s is not how a %s is measured; use --%s"
                         % (other, args.rig, fit))
    # THE DEFAULT SIZE BELONGS TO THE RIG, not to the name of the axis. Two
    # rigs now measure a `length` and a hound is not a firefly: keying the
    # fallback on `fit_name` would have imported the hound at 0.82 -- an animal
    # two thirds the length of the Wisp it is supposed to outweigh -- and
    # nothing would have reported it except the picture.
    args.size = given[fit] if given[fit] is not None \
        else RIGS[args.rig]["default_size"]
    if args.body_group is None:
        stem = args.name[len("enemy-"):] if args.name.startswith("enemy-") \
            else args.name
        args.body_group = stem.replace("-", "_") + "_body"

    gltf = Gltf(args.source)
    model = build(gltf, args)

    print("%s: %d -> %d triangles (%.0f%% off), %d colours, "
          "%d group(s), %d frames" %
          (args.name, model["before"], model["after"],
           100.0 * (1 - model["after"] / float(model["before"])),
           len(model["palette"]), len(model["groups"]), len(model["frames"])))
    print("   rig %s, %s %.3f u from a source span of %.4f (scale %.5f)"
          % (args.rig, fit, args.size, model["span"], model["scale"]))
    if args.exclude:
        print("   dropped: %s" % ", ".join(args.exclude))
    for material, centres in sorted(model.get("paint", {}).items()):
        print("   painted from %s: %s" % (material, " ".join(
            "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in rgb)
            for rgb in centres)))
    if model.get("bands"):
        print("   bands: %s" % ", ".join(
            "[%d, %d]" % (b[0], b[1]) for b in model["bands"]))
    for g in model["groups"]:
        print("   %-16s %6d tris" % (g["name"] or "(thorax)", g["count"] // 3))

    if args.preview:
        w, h = preview(model, args.preview)
        print("wrote %s  %dx%d" % (args.preview, w, h))
    if args.stats:
        return
    if not os.path.isdir(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
    filename = args.out or (args.name + ".js")
    size = write_js(model, filename, os.path.basename(args.source))
    print("wrote js/gl/models/%s  %.1f KB" % (filename, size / 1024.0))


if __name__ == "__main__":
    main()
