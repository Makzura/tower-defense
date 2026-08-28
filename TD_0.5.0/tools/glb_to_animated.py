#!/usr/bin/env python3
# ---------------------------------------------------------------------------
# An imported .glb WITH ITS OWN ANIMATION -> a plain .js file the game loads.
#
#     python3 tools/glb_to_animated.py ../glb/mana_well_base_2.glb \
#         --name farm-base --frames 64
#
# WHY THIS EXISTS BESIDE glb_to_model.py, WHICH ALSO IMPORTS A .glb.
#
# That tool imports geometry and SYNTHESISES the motion: a rig says how the
# hierarchy divides into groups, where each group turns, and what cycle it
# walks, and the file's own animation -- if it has one -- is ignored. That is
# right for the enemies it was written for. Every one of them arrived as a
# static mesh, and a walk cycle that has to stay in step with distance covered
# is solved (see `walk_cycle` there), not authored.
#
# The Farm's three models are the other case. They arrive with the motion
# already in them: one looping glTF animation each, authored at 24 fps, on
# named nodes -- a crank turning, a lever rocking, a bucket rising, six splash
# drops popping, a novice's arms following the handle. Nothing here is solved
# and nothing here is a rig: the file says what moves and by how much, and this
# tool's whole job is to sample that faithfully into the frame list the game's
# model format already has.
#
# So the two tools are not variants of each other. `glb_to_model.py` answers
# "what should this body do"; this one answers "what does this file already do".
# A model that needed both would be a model with an authored idle and a solved
# gait, and there is none.
#
# WHAT IT SHARES with the other tool, by importing it rather than copying it:
# the .glb reader, the mesh walk, the palette derivation, the axis convention,
# and the emitted format. Every one of those is a decision about THIS PROJECT
# rather than about a rig, and two copies of any of them is how the imported
# models would start disagreeing with each other.
#
# THE AXIS CONVENTION IS THE OTHER TOOL'S. glTF is Y-up; the game is Z-up with
# forward on +X, and the remap (x, y, z) <- (gz, gx, gy) is a rotation of
# determinant +1, so no winding flips and GLRenderer's back-face cull keeps
# showing the outside. Ground contact is the model's own lowest point.
#
# THE SCALE IS THE SOURCE'S OWN, and that is a measurement rather than a
# default. The Farm's footprint is 35 u.l. -- a 72.8 px diameter -- and
# `mana_well_base_2.glb` is 2.294 source units across, which at the shared
# `unitsToPx` of 31.8032 is 72.96 px. The models were authored to the
# footprint they are placed on, to within 0.3%, so fitting them to a target
# height would be rescaling correct geometry to make it wrong. `--size` is
# there for a file that is not authored that way; it is not passed for these.
#
# HOW A GROUP IS DECIDED, and it is the file's business, not a rig's:
#
#   * every mesh node walks up its ancestors to the nearest ANIMATED one --
#     itself included -- and that node names its group;
#   * a mesh with no animated ancestor lands in the unnamed group, which is the
#     static body and is posed by `null` on every frame, exactly as the other
#     tool's is;
#   * GEOMETRY IS STORED IN MODEL SPACE AND EVERY PIVOT IS ZERO, which is what
#     the walker rigs in the other tool do (`origin_pivot`) and for both of
#     their reasons. The first is the format: a frame matrix is applied as
#     `instance * pose`, so it must land its points in MODEL space -- storing
#     them relative to a joint means every matrix has to carry that joint's
#     translation back, and getting the direction wrong shifts a whole group by
#     the pivot. It did, on the first version of this tool: the well's bucket
#     and rope were pushed out of frame, the novice's hands ended up inside the
#     well, and the pumps' levers sank into the ground. The second is
#     `GLModels.expand`, which derives `model.top` -- the height a health bar is
#     drawn at -- from the RAW stored positions with no group matrix applied, so
#     a tower whose parts are stored relative to joints halfway up itself
#     reports a top halfway up itself. `node tools/check-model-top.js` is what
#     catches that.
#
#     Nothing is lost by it. A rotation is expressed about the node's own origin
#     either way, because that origin is inside the delta the animation is
#     sampled into -- see below.
#
# THE MATRIX PER GROUP PER FRAME, which is the whole of the animation:
#
#     W_rest  = product of local matrices up the chain, as authored
#     W_f     = the same product with animated nodes sampled at time f
#     D       = W_f . W_rest^-1                    (a delta in SOURCE space)
#     M       = C . D . C^-1                       (the same delta, game space)
#
# where C is the axis remap, scale and ground shift above. `D` already turns
# about the part's own origin -- it is built from that node's world transform,
# not from a rotation at the model root -- so no conjugation by a pivot is
# needed once the geometry is in model space. Composing the chain rather than
# reading one node's channel is what makes a novice's forearm follow the upper
# arm that carries it.
#
# WHY THE LAST KEY IS DROPPED. A looping animation authored at 24 fps ends on a
# repeat of its first pose -- 193 keys for an 8 s loop is 192 steps plus the
# seam. Sampling N frames over [0, duration) rather than [0, duration] is what
# stops the loop stuttering once per cycle on a frame the reader would play
# twice in a row.
#
# FRAME COUNT IS A TRADE AND IT IS NOT THE SOURCE'S. gl-world indexes the strip
# and never interpolates, so the playback rate is `frames / seconds` and every
# frame is a 4x4 per group on disk. 24 fps for 8 seconds is 192 frames and about
# half a megabyte per model for motion no reader can see; 8 fps is 5.6 degrees a
# frame on the T2 flywheel -- the fastest thing any of these files does -- and
# lands each model near the size of the ones already shipped.
#
# ACTION CLIPS ARE SAMPLED FASTER THAN IDLES, and that is why the two rates are
# separate flags. An idle is a slow loop nobody watches closely; an action is a
# short punctuation the player's eye is on, and B3's `target_lock` lasts 0.35 s
# -- three frames at 8 fps, which is not a snap, it is a stutter. Actions ship at
# the source's own 24 fps, which costs 38 frames for a 1.6 s tick.
#
# MORE THAN ONE CLIP MEANS `bands`, WHICH THE FORMAT ALREADY HAS. Clips are
# concatenated into the one frame list the format allows and `bands` says where
# each starts and how long it runs -- the same pair `export_mesh.py` emits, and
# the reason gl-world's `walkBand` exists: a reader must never divide
# `frames.length` by something. Two more fields go with it, because a band's
# LENGTH IN FRAMES does not say how long it lasts or what it is: `bandSeconds`
# is each band's duration and `bandNames` is each band's clip name. Naming them
# is what lets gl-world map `produce_tick` to a production tick rather than to
# "band 1", which would silently point at a different clip the day a model gains
# one.
#
# BAND 0 IS THE IDLE, by the handoff's own naming convention: a clip called
# `idle_*` comes first and loops, everything else is a one-shot in file order.
# The design guarantees action clips begin and end bit-exact on the idle's t=0
# pose, so returning to band 0 frame 0 needs no blend.
#
# The contact sheet below is how you check any of this without loading the game.
#
# LOOK AT IT BEFORE SHIPPING IT. `--preview out.png` draws the same contact
# sheet the other tool does, in the same fixed camera, and for the same reason:
# an axis ninety degrees out or a group posed about the wrong point is one
# glance to spot and a long session to attribute from inside a running board.
# ---------------------------------------------------------------------------

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from glb_to_model import (                       # noqa: E402
    Gltf, IDENTITY, OUTPUT_DIR, PRECISION, UNITS_TO_PX,
    collect, mat_apply, mat_multiply, mat_translate, material_entry,
    node_matrix, preview, triangle_normal,
)


# --- small matrix helpers the other tool does not export --------------------

def mat_invert(m):
    """The inverse of an AFFINE 4x4 -- a rotation/scale block and a shift.

    Written out rather than solved generally because every matrix here is
    affine by construction (glTF TRS nodes and the axis remap), and a general
    inverse would hide a bug in the one case it must never get wrong: a
    non-uniform scale, which several of these nodes carry (`well_rope` scales
    in y alone, and every splash drop pulses on all three).
    """
    a = [row[:3] for row in m[:3]]
    det = (a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1])
           - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0])
           + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]))
    if abs(det) < 1e-12:
        raise ValueError("a node's rest transform is singular; it cannot be "
                         "inverted, so its animation cannot be expressed as a "
                         "delta from it")
    inv = [[0.0] * 3 for _ in range(3)]
    inv[0][0] = (a[1][1] * a[2][2] - a[1][2] * a[2][1]) / det
    inv[0][1] = (a[0][2] * a[2][1] - a[0][1] * a[2][2]) / det
    inv[0][2] = (a[0][1] * a[1][2] - a[0][2] * a[1][1]) / det
    inv[1][0] = (a[1][2] * a[2][0] - a[1][0] * a[2][2]) / det
    inv[1][1] = (a[0][0] * a[2][2] - a[0][2] * a[2][0]) / det
    inv[1][2] = (a[0][2] * a[1][0] - a[0][0] * a[1][2]) / det
    inv[2][0] = (a[1][0] * a[2][1] - a[1][1] * a[2][0]) / det
    inv[2][1] = (a[0][1] * a[2][0] - a[0][0] * a[2][1]) / det
    inv[2][2] = (a[0][0] * a[1][1] - a[0][1] * a[1][0]) / det
    t = [m[r][3] for r in range(3)]
    shift = [-sum(inv[r][k] * t[k] for k in range(3)) for r in range(3)]
    return [[inv[0][0], inv[0][1], inv[0][2], shift[0]],
            [inv[1][0], inv[1][1], inv[1][2], shift[1]],
            [inv[2][0], inv[2][1], inv[2][2], shift[2]],
            [0.0, 0.0, 0.0, 1.0]]


def trs_matrix(translation, rotation, scale):
    """T . R . S, the order glTF composes a node's local transform in."""
    out = IDENTITY
    if scale is not None:
        out = mat_multiply([[scale[0], 0, 0, 0], [0, scale[1], 0, 0],
                            [0, 0, scale[2], 0], [0, 0, 0, 1]], out)
    if rotation is not None:
        x, y, z, w = rotation
        out = mat_multiply(
            [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w),
              2 * (x * z + y * w), 0],
             [2 * (x * y + z * w), 1 - 2 * (x * x + z * z),
              2 * (y * z - x * w), 0],
             [2 * (x * z - y * w), 2 * (y * z + x * w),
              1 - 2 * (x * x + y * y), 0],
             [0, 0, 0, 1]], out)
    if translation is not None:
        out = mat_multiply(mat_translate(translation), out)
    return out


# --- the animation ----------------------------------------------------------

def slerp(a, b, t):
    """Shortest-arc quaternion interpolation, which is what glTF LINEAR means.

    glTF says rotations interpolate spherically even when the sampler is
    LINEAR, and the difference is not academic on these files: the T2 flywheel
    turns a full circle per loop, so consecutive keys are 15 degrees apart and
    a lerp would shorten the radius -- a wheel that pulses smaller four times a
    revolution.
    """
    dot = sum(a[i] * b[i] for i in range(4))
    if dot < 0.0:                       # take the short way round
        b = [-v for v in b]
        dot = -dot
    if dot > 0.9995:                    # nearly parallel: lerp and normalise
        out = [a[i] + (b[i] - a[i]) * t for i in range(4)]
    else:
        import math
        theta = math.acos(max(-1.0, min(1.0, dot)))
        s = math.sin(theta)
        wa = math.sin((1 - t) * theta) / s
        wb = math.sin(t * theta) / s
        out = [a[i] * wa + b[i] * wb for i in range(4)]
    import math
    n = math.sqrt(sum(v * v for v in out)) or 1.0
    return [v / n for v in out]


def clip_order(gltf):
    """Every animation index, the idle first.

    The handoff names its loop `idle_*` and its one-shots anything else, and
    that convention is the only thing in the file that says which clip a model
    rests in. A file with no `idle_` clip keeps its own order and band 0 is
    simply the first one -- which is right for the Base/T1/T2 models, whose
    single clip is an idle without saying so.
    """
    anims = gltf.json.get("animations") or []
    order = list(range(len(anims)))
    order.sort(key=lambda i: (0 if str(anims[i].get("name", ""))
                              .startswith("idle") else 1, i))
    return order


class Animation(object):
    """One glTF animation, sampled by time onto the nodes it drives."""

    def __init__(self, gltf, index=0):
        anims = gltf.json.get("animations") or []
        if not anims:
            raise ValueError("this .glb carries no animation -- there is "
                             "nothing for this tool to import. Check that the "
                             "export included it: the first Farm export did "
                             "not, and the files were otherwise identical.")
        anim = anims[index]
        self.name = anim.get("name") or ""
        self.channels = {}              # node index -> {path: (times, values)}
        self.duration = 0.0
        for channel in anim["channels"]:
            sampler = anim["samplers"][channel["sampler"]]
            interp = sampler.get("interpolation", "LINEAR")
            if interp != "LINEAR":
                raise ValueError(
                    "sampler interpolation %s is not supported; these files "
                    "are LINEAR throughout and a CUBICSPLINE sampler stores "
                    "tangents this reader would silently treat as keys"
                    % interp)
            times = [t[0] for t in gltf.accessor(sampler["input"])]
            values = gltf.accessor(sampler["output"])
            node = channel["target"]["node"]
            path = channel["target"]["path"]
            if path == "weights":
                raise ValueError("morph target weights are not supported; "
                                 "this format poses rigid groups by a 4x4")
            self.channels.setdefault(node, {})[path] = (times, values)
            if times:
                self.duration = max(self.duration, times[-1])

    def animates(self, node):
        return node in self.channels

    def sample(self, node, nodes, time):
        """The node's local matrix at `time`, or None if it is not animated.

        A CHANNEL THAT IS ABSENT FALLS BACK TO THE NODE'S AUTHORED VALUE, and
        that is the whole reason this takes `nodes`. An animated node is
        normally driven on ONE component -- `well_pulley` has a rotation channel
        and nothing else -- and rebuilding its local matrix from the animation
        alone silently drops the translation that puts it up on the beam. The
        first run of this importer did exactly that: the pulley's frame matrix
        carried a residual shift of -1.44 in z, which is its own height, because
        every animated pose had moved it to the model's origin and the delta
        against its rest pose was that move.
        """
        driven = self.channels.get(node)
        if not driven:
            return None
        rest = nodes[node]
        if "matrix" in rest and driven:
            # glTF forbids this pairing for exactly the reason it would break
            # here: a baked matrix cannot be recomposed with one TRS component.
            raise ValueError("node %r is animated and carries a baked matrix"
                             % rest.get("name"))

        def value(path, default):
            got = self._value(driven, path, time)
            return got if got is not None else list(rest.get(path, default))

        return trs_matrix(value("translation", [0.0, 0.0, 0.0]),
                          value("rotation", [0.0, 0.0, 0.0, 1.0]),
                          value("scale", [1.0, 1.0, 1.0]))

    def _value(self, driven, path, time):
        entry = driven.get(path)
        if not entry:
            return None
        times, values = entry
        if len(times) == 1:
            return list(values[0])
        # The keys are uniform in every file this reads, but the search is a
        # scan rather than an index so an unevenly keyed export cannot land
        # silently on the wrong pair.
        i = 0
        while i < len(times) - 2 and times[i + 1] < time:
            i += 1
        span = times[i + 1] - times[i]
        t = 0.0 if span <= 0 else max(0.0, min(1.0, (time - times[i]) / span))
        a, b = list(values[i]), list(values[i + 1])
        if path == "rotation":
            return slerp(a, b, t)
        return [a[k] + (b[k] - a[k]) * t for k in range(len(a))]


# --- the hierarchy ----------------------------------------------------------

def node_index_by_chain(gltf):
    """Every node's parent, name and rest matrix, plus a name -> index map.

    Names are unique in these files and the mesh walk in `collect` reports a
    part by name, so the two halves are joined on it. A duplicate name is
    refused rather than resolved: it would silently attach a mesh to the wrong
    animated ancestor, which reads as one part of the model being possessed.
    """
    nodes = gltf.json["nodes"]
    parent = {}
    for i, node in enumerate(nodes):
        for child in node.get("children", []):
            parent[child] = i
    names = {}
    for i, node in enumerate(nodes):
        name = node.get("name") or ""
        if name in names:
            raise ValueError("two nodes are both called %r; this tool joins "
                             "the mesh walk to the hierarchy by name" % name)
        names[name] = i
    return parent, names


def chain_of(index, parent):
    """A node's ancestors, root first, including itself."""
    out = []
    while index is not None:
        out.append(index)
        index = parent.get(index)
    out.reverse()
    return out


def idle_poses(clips, nodes):
    """What each animated node holds while a clip that does not key it plays.

    A NODE KEYED ONLY BY AN ACTION CLIP HAS NO POSE IN THE IDLE, and its
    authored transform is not it. `b3_capture_pulse` is the case that proves it:
    the orb that travels from lens to vial during a capture is exported with a
    rest scale of 2, is keyed by `kill_capture` alone, and the idle never
    mentions it -- so falling back to the authored transform parks a full-size
    orb on the scanner's lens for the entire run. The design source is explicit
    that it is hidden (`pulse.scale.setScalar(0.001)`, and the idle clip sets it
    again), but that intent does not survive into glTF.

    It is recovered from the data rather than typed: an action clip is
    guaranteed to END on the idle pose, so the pose such a node should hold is
    that clip's own final one. Every other node -- keyed by the idle, or keyed
    by nothing at all -- keeps its authored transform, so this changes nothing
    for the models that have a single clip.
    """
    idle = clips[0]
    poses = {}
    for index in range(len(nodes)):
        if idle.animates(index):
            continue                                  # the idle speaks for it
        for clip in clips[1:]:
            if clip.animates(index):
                poses[index] = clip.sample(index, nodes, clip.duration)
                break
    return poses


def world_at(chain, anim, time, nodes, idles=None):
    """The product of local matrices up a chain, animated nodes sampled.

    `time` of None gives the AUTHORED pose, which is what `collect` bakes the
    geometry with and therefore what every delta is measured against. It is
    deliberately not the idle: the two differ exactly on the nodes `idle_poses`
    describes, and measuring a delta against a rest the geometry is not in would
    move those parts twice.
    """
    out = IDENTITY
    for index in chain:
        local = None if time is None else anim.sample(index, nodes, time)
        if local is None and idles:
            local = idles.get(index)
        if local is None:
            local = node_matrix(nodes[index])
        out = mat_multiply(out, local)
    return out


# --- the build --------------------------------------------------------------

def build(gltf, options):
    clips = [Animation(gltf, i) for i in clip_order(gltf)]
    # THE UNION OF EVERY CLIP'S NODES DECIDES THE GROUPS, not the idle's alone.
    # A3's valve and its three liquid levels are keyed by `produce_tick` and by
    # nothing else; grouping off the idle would weld them into the static body
    # and the tick would move a machine with a valve painted on it.
    anim = clips[0]
    nodes = gltf.json["nodes"]
    idles = idle_poses(clips, nodes)
    parent, by_name = node_index_by_chain(gltf)
    parts = collect(gltf, options.exclude)

    # WHICH GROUP EACH MESH BELONGS TO: the nearest animated ancestor, itself
    # included. Everything else is the static body.
    group_node = {}
    for part in parts:
        index = by_name.get(part["name"])
        if index is None:
            raise ValueError("mesh %r is not in the node table" % part["name"])
        owner = None
        for ancestor in reversed(chain_of(index, parent)):
            if any(clip.animates(ancestor) for clip in clips):
                owner = ancestor
                break
        part["group"] = (nodes[owner].get("name") or "") if owner is not None else ""
        if owner is not None:
            group_node[part["group"]] = owner

    # ORIENT, SCALE, GROUND -- the other tool's convention, and its comment on
    # `convert` is the argument for it. The scale is the source's own unless a
    # size is asked for; see the header.
    raw = [p for part in parts for tri in part["triangles"] for p in tri[0]]
    measured = max(p[1] for p in raw) - min(p[1] for p in raw)
    scale = 1.0 if options.size is None else options.size / max(measured, 1e-6)
    floor = min(p[1] for p in raw)

    def convert(p):
        return (p[2] * scale, p[0] * scale, (p[1] - floor) * scale)

    # The same map as a matrix, so a delta can be conjugated into game space
    # rather than re-derived by fitting points -- see the header.
    C = [[0.0, 0.0, scale, 0.0],
         [scale, 0.0, 0.0, 0.0],
         [0.0, scale, 0.0, -floor * scale],
         [0.0, 0.0, 0.0, 1.0]]
    C_inv = mat_invert(C)

    for part in parts:
        part["triangles"] = [([convert(p) for p in tri[0]], tri[1])
                             for tri in part["triangles"]]

    # Groups come out SORTED, exactly as the other tool and the Blender
    # exporter emit them, so the unnamed one is first and two model files can
    # be compared as the same shape of thing.
    names = sorted(set(part["group"] for part in parts))

    rest_world = {}
    for name in names:
        if not name:
            continue
        chain = chain_of(group_node[name], parent)
        rest_world[name] = world_at(chain, anim, None, nodes)   # time None: authored

    palette = []
    lookup = {}
    positions = []
    normals = []
    colour_index = []
    out_groups = []

    for name in names:
        first = len(colour_index) * 3
        for part in parts:
            if part["group"] != name:
                continue
            for tri in part["triangles"]:
                # MODEL SPACE, every group, animated or not -- see the header.
                local = list(tri[0])
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
                    positions.extend(round(v, PRECISION) for v in p)
        out_groups.append({"name": name, "first": first,
                           "count": len(colour_index) * 3 - first})

    # THE FRAMES, one block per clip, concatenated with a band each.
    #
    # An IDLE is sampled over [0, duration) so its closing repeat of frame 0 is
    # not shipped twice. An ACTION is sampled over [0, duration] INCLUSIVE: it
    # is played once and its last frame is the pose it hands back to the idle,
    # which the handoff guarantees is bit-exact on idle t=0. Dropping it would
    # end every action one frame early, on a pose mid-motion.
    frames = []
    bands = []
    band_seconds = []
    band_names = []
    for index, clip in enumerate(clips):
        idle = index == 0
        fps = options.idle_fps if idle else options.action_fps
        count = max(options.min_frames, int(round(clip.duration * fps)))
        first = len(frames)
        for f in range(count):
            span = float(count) if idle else float(max(1, count - 1))
            time = clip.duration * f / span
            pose = []
            for name in names:
                if not name:
                    pose.append(None)
                    continue
                chain = chain_of(group_node[name], parent)
                posed = world_at(chain, clip, time, nodes, idles)
                delta = mat_multiply(posed, mat_invert(rest_world[name]))
                pose.append(mat_multiply(C, mat_multiply(delta, C_inv)))
            frames.append(pose)
        bands.append([first, count])
        band_seconds.append(round(clip.duration, 4))
        band_names.append(clip.name)

    frames = [[None if m is None else
               [round(m[r][c], 5) for c in range(4) for r in range(4)]
               for m in pose] for pose in frames]

    return {"name": options.name, "triangles": len(colour_index),
            "palette": palette, "positions": positions, "normals": normals,
            "colourIndex": colour_index, "groups": out_groups,
            "frames": frames, "loopSeconds": band_seconds[0],
            "bands": bands, "bandSeconds": band_seconds, "bandNames": band_names,
            "animation": band_names[0], "scale": scale,
            "height": (max(p[1] for p in raw) - floor) * scale}


def write_js(model, filename, source):
    """The other tool's emitter plus one field: how long the loop lasts.

    `loopSeconds` is on the model because the model is what knows it. The
    alternative was a table in gl-world.js pairing a model id with a duration,
    which is the same number written twice in two files that are re-generated
    on different days -- and a wrong one there does not fail, it plays the
    animation at the wrong speed, which nobody can spot by looking.
    """
    path = os.path.join(OUTPUT_DIR, filename)

    def arr(values):
        return "[" + ",".join(
            (repr(v) if isinstance(v, int) else ("%g" % v))
            for v in values) + "]"

    lines = [
        "// GENERATED by tools/glb_to_animated.py -- do not edit.",
        "// Source of truth is %s; re-run the importer." % source,
        "//",
        "// %d triangles, %d colours, %d groups, %d frames across %d clip(s):" %
        (model["triangles"], len(model["palette"]), len(model["groups"]),
         len(model["frames"]), len(model["bands"])),
        "//   " + ", ".join(
            "%s %gs x%d" % (model["bandNames"][i], model["bandSeconds"][i],
                            model["bands"][i][1])
            for i in range(len(model["bands"]))),
        "// Band 0 loops; the rest play once and end on band 0 frame 0.",
        "// Normals and colours are per TRIANGLE; positions are per vertex.",
        "// GLModels.register expands them.",
        "GLModels.register(%s, {" % json.dumps(model["name"]),
        "  unitsToPx: %g," % UNITS_TO_PX,
        "  triangles: %d," % model["triangles"],
        "  loopSeconds: %g," % model["loopSeconds"],
        "  bands: %s," % json.dumps(model["bands"]),
        "  bandSeconds: %s," % json.dumps(model["bandSeconds"]),
        "  bandNames: %s," % json.dumps(model["bandNames"]),
        "  palette: %s," % json.dumps(model["palette"]),
        "  groups: %s," % json.dumps(model["groups"]),
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


def main():
    ap = argparse.ArgumentParser(
        description="Import a .glb that carries its own looping animation.")
    ap.add_argument("source")
    ap.add_argument("--name", help="model id, e.g. farm-base")
    ap.add_argument("--idle-fps", type=float, default=8.0,
                    dest="idle_fps",
                    help="frames a second for the looping clip (band 0)")
    ap.add_argument("--action-fps", type=float, default=24.0,
                    dest="action_fps",
                    help="frames a second for one-shot clips; 24 is the "
                         "source's own rate")
    ap.add_argument("--min-frames", type=int, default=6, dest="min_frames",
                    help="floor for a very short clip")
    ap.add_argument("--size", type=float, default=None,
                    help="target height in model units; omit to keep the "
                         "source's own scale, which is what these files want")
    ap.add_argument("--exclude", action="append", default=[])
    ap.add_argument("--glow", default="emissive")
    ap.add_argument("--emit-cap", type=float, default=None)
    ap.add_argument("--preview", default=None,
                    help="write a contact sheet PNG and stop")
    ap.add_argument("--stats", action="store_true")
    options = ap.parse_args()
    options.tint = {}

    if not options.name:
        options.name = os.path.splitext(os.path.basename(options.source))[0]

    gltf = Gltf(options.source)
    model = build(gltf, options)

    if options.preview:
        preview(model, options.preview)
        print("preview -> %s" % options.preview)
        return

    if options.stats:
        print("%s: %d triangles, %d groups, %d frames, loop %g s, height %.3f"
              % (model["name"], model["triangles"], len(model["groups"]),
                 len(model["frames"]), model["loopSeconds"], model["height"]))
        for g in model["groups"]:
            print("   %-28s %5d triangles" % (g["name"] or "(static)",
                                              g["count"] // 3))
        return

    size = write_js(model, model["name"] + ".js",
                    os.path.basename(options.source))
    print("%s.js  %d triangles, %d groups, %d frames, loop %g s  (%.1f KB)"
          % (model["name"], model["triangles"], len(model["groups"]),
             len(model["frames"]), model["loopSeconds"], size / 1024.0))


if __name__ == "__main__":
    main()
