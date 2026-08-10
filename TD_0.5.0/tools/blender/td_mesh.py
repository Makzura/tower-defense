# ---------------------------------------------------------------------------
# td_mesh -- the same primitive vocabulary as td_scene, WITHOUT Blender.
#
# WHY THIS EXISTS. td_scene.py builds real Blender scenes and export_mesh.py
# reads them back, which is the right pipeline and stays the source of truth for
# anything that also needs a rendered sprite sheet. But the 3D build does not
# need Blender at all: it needs triangles, per-triangle normals and colours, and
# one matrix per animated group per frame. That is a few hundred lines of
# ordinary geometry, and having it here means a model can be authored, exported
# and played on a machine with no Blender installed -- which is the machine this
# was written on.
#
# THE CONTRACT IS EXPORT_MESH'S, EXACTLY. Same grouping rule (nearest animated
# ancestor wins, `world_fixed` beats everything above it), same group-local
# storage at frame 1, same column-major per-frame matrices, same file header.
# A model built here and a model built through Blender are interchangeable to
# the runtime, and gl-models.js cannot tell them apart.
#
# WHAT IS DELIBERATELY MISSING: bevels. td_scene bevels its boxes so their edges
# catch the key light. Everything here is flat-shaded low-poly and reads fine
# without them, and adding a bevel modifier by hand is a lot of code for an
# effect the 3D lighting mostly does not show. If a model ever needs one, it
# should be built through Blender instead of grown here.
# ---------------------------------------------------------------------------

import json
import math
import os

UNITS_TO_PX = 20.0 * 1.529 * 1.04           # matches export_mesh.py exactly
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))), "js", "gl", "models")

WORLD_FIXED_GROUP = "world_fixed"


# --- small matrix helpers ---------------------------------------------------
# Row-major 4x4 as nested tuples while building; emitted column-major.

def identity():
    return [[1.0, 0, 0, 0], [0, 1.0, 0, 0], [0, 0, 1.0, 0], [0, 0, 0, 1.0]]


def mat_mul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)]
            for r in range(4)]


def trs(location, rotation):
    """Translate * Rz * Ry * Rx -- Blender's default XYZ Euler order, so a
    number copied off a td_scene call means the same thing here."""
    rx, ry, rz = rotation
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    m = [
        [cy * cz, cz * sx * sy - cx * sz, cx * cz * sy + sx * sz, location[0]],
        [cy * sz, cx * cz + sx * sy * sz, -cz * sx + cx * sy * sz, location[1]],
        [-sy, cy * sx, cx * cy, location[2]],
        [0, 0, 0, 1.0],
    ]
    return m


def apply(m, p):
    return (m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + m[0][3],
            m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + m[1][3],
            m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + m[2][3])


def invert_rigid(m):
    """Inverse of a translate*rotate matrix. Everything here is rigid -- size is
    baked into vertices, never carried as object scale -- so this is exact and a
    general inverse is not needed."""
    r = [[m[i][j] for j in range(3)] for i in range(3)]
    t = [m[i][3] for i in range(3)]
    inv = [[r[j][i] for j in range(3)] + [0.0] for i in range(3)]
    for i in range(3):
        inv[i][3] = -sum(inv[i][k] * t[k] for k in range(3))
    inv.append([0, 0, 0, 1.0])
    return inv


# --- the scene --------------------------------------------------------------

class Node(object):
    """An empty. Yaw on the root is how the model is aimed; anything marked
    `animated` becomes its own export group with a matrix per frame."""

    def __init__(self, name, parent=None, location=(0, 0, 0),
                 rotation=(0, 0, 0), animated=False, world_fixed=False):
        self.name = name
        self.parent = parent
        self.location = list(location)
        self.rotation = list(rotation)
        self.animated = animated
        self.world_fixed = world_fixed

    def matrix_world(self):
        m = trs(self.location, self.rotation)
        node = self.parent
        while node is not None:
            m = mat_mul(trs(node.location, node.rotation), m)
            node = node.parent
        return m


class Mesh(object):
    def __init__(self, name, verts, faces, mat, parent):
        self.name = name
        self.verts = verts            # local coordinates
        self.faces = faces            # tuples of vertex indices, any length
        self.mat = mat                # material key
        self.parent = parent
        self.face_mats = None         # optional per-face override


class Scene(object):
    def __init__(self, palette):
        self.palette = palette        # name -> (hex, emission)
        self.meshes = []
        self.nodes = []

    def node(self, name, parent=None, location=(0, 0, 0), rotation=(0, 0, 0),
             animated=False, world_fixed=False):
        n = Node(name, parent, location, rotation, animated, world_fixed)
        self.nodes.append(n)
        return n

    def add(self, mesh):
        self.meshes.append(mesh)
        return mesh


# --- primitives -------------------------------------------------------------
# Each returns a Mesh in LOCAL space, already offset by `location` and turned by
# `rotation`, exactly as td_scene's `_attach` does.

def _place(verts, location, rotation):
    m = trs(location, rotation)
    return [apply(m, v) for v in verts]


def box(scene, name, size, location=(0, 0, 0), rotation=(0, 0, 0), mat=None,
        parent=None):
    hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
    v = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
         (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
         (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return scene.add(Mesh(name, _place(v, location, rotation), f, mat, parent))


def cyl(scene, name, radius, depth, location=(0, 0, 0), rotation=(0, 0, 0),
        mat=None, parent=None, verts=12):
    h = depth * 0.5
    v, f = [], []
    for i in range(verts):
        a = math.tau * i / verts
        v.append((math.cos(a) * radius, math.sin(a) * radius, -h))
    for i in range(verts):
        a = math.tau * i / verts
        v.append((math.cos(a) * radius, math.sin(a) * radius, h))
    for i in range(verts):
        j = (i + 1) % verts
        f.append((i, j, verts + j, verts + i))
    f.append(tuple(range(verts - 1, -1, -1)))
    f.append(tuple(range(verts, verts * 2)))
    return scene.add(Mesh(name, _place(v, location, rotation), f, mat, parent))


def ball(scene, name, radius, location=(0, 0, 0), mat=None, parent=None,
         segments=12, rings=6):
    v, f = [], []
    v.append((0, 0, radius))
    for r in range(1, rings):
        phi = math.pi * r / rings
        for s in range(segments):
            th = math.tau * s / segments
            v.append((math.sin(phi) * math.cos(th) * radius,
                      math.sin(phi) * math.sin(th) * radius,
                      math.cos(phi) * radius))
    v.append((0, 0, -radius))
    # WOUND OUTWARD. Every one of these three loops used to run the other way,
    # so a ball's normals all pointed at its own centre -- and with
    # CULL_FACE/BACK enabled in GLRenderer the front of every sphere was culled
    # and you saw the inside of the far wall instead. Every head, shoulder, eye,
    # ball joint and glow orb in the game was inside out.
    #
    # Audited rather than eyeballed: for a convex solid the outward normal must
    # satisfy dot(n, face_centre - centroid) > 0. Before this change ball and
    # ellipsoid scored 0 outward / 120 inward; box, cyl, frustum and tube were
    # already correct, which is why only the round parts looked wrong.
    top, bottom = 0, len(v) - 1
    for s in range(segments):
        f.append((top, 1 + s, 1 + (s + 1) % segments))
    for r in range(rings - 2):
        base = 1 + r * segments
        for s in range(segments):
            a = base + s
            b = base + (s + 1) % segments
            f.append((a, a + segments, b + segments, b))
    base = 1 + (rings - 2) * segments
    for s in range(segments):
        f.append((bottom, base + (s + 1) % segments, base + s))
    return scene.add(Mesh(name, _place(v, location, rotation=(0, 0, 0)),
                          f, mat, parent))


def ellipsoid(scene, name, size, location, mat, parent, rotation=(0, 0, 0),
              segments=12, rings=6):
    m = ball(scene, name, 1.0, (0, 0, 0), mat, parent, segments, rings)
    sx, sy, sz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
    m.verts = _place([(v[0] * sx, v[1] * sy, v[2] * sz) for v in m.verts],
                     location, rotation)
    return m


def frustum(scene, name, lower_radius, upper_radius, height, location, mat,
            parent, verts=8, rotation=(0, 0, 0), alternate_mat=None):
    h = height * 0.5
    v, f = [], []
    for i in range(verts):
        a = math.tau * i / verts
        v.append((math.cos(a) * lower_radius, math.sin(a) * lower_radius, -h))
    for i in range(verts):
        a = math.tau * i / verts
        v.append((math.cos(a) * upper_radius, math.sin(a) * upper_radius, h))
    mats = []
    for i in range(verts):
        j = (i + 1) % verts
        f.append((i, j, verts + j, verts + i))
        mats.append(alternate_mat if (alternate_mat and i % 2) else mat)
    f.append(tuple(range(verts - 1, -1, -1)))
    mats.append(mat)
    f.append(tuple(range(verts, verts * 2)))
    mats.append(mat)
    m = scene.add(Mesh(name, _place(v, location, rotation), f, mat, parent))
    if alternate_mat:
        m.face_mats = mats
    return m


def tube(scene, name, radius, start, end, mat, parent, verts=8):
    """A capped cylinder between two points -- limbs, struts, cage bars."""
    dx, dy, dz = (end[0] - start[0], end[1] - start[1], end[2] - start[2])
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
    # Build along +Z, then rotate onto the segment.
    yaw = math.atan2(dy, dx)
    pitch = math.acos(max(-1.0, min(1.0, dz / length)))
    mid = ((start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5,
           (start[2] + end[2]) * 0.5)
    return cyl(scene, name, radius, length, mid, (0.0, pitch, yaw), mat,
               parent, verts)


def torus(scene, name, major_radius, minor_radius, location, rotation, mat,
          parent, major_segments=12, minor_segments=6):
    v, f = [], []
    for i in range(major_segments):
        a = math.tau * i / major_segments
        cx, cy = math.cos(a) * major_radius, math.sin(a) * major_radius
        for j in range(minor_segments):
            b = math.tau * j / minor_segments
            r = major_radius + math.cos(b) * minor_radius
            v.append((math.cos(a) * r, math.sin(a) * r,
                      math.sin(b) * minor_radius))
    for i in range(major_segments):
        ni = (i + 1) % major_segments
        for j in range(minor_segments):
            nj = (j + 1) % minor_segments
            f.append((i * minor_segments + j, ni * minor_segments + j,
                      ni * minor_segments + nj, i * minor_segments + nj))
    return scene.add(Mesh(name, _place(v, location, rotation), f, mat, parent))


# --- export -----------------------------------------------------------------

def _srgb(hex_string):
    h = hex_string.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def _group_of(node):
    """The animated ancestor a mesh rides on. Same rule as export_mesh."""
    while node is not None:
        if node.world_fixed:
            return WORLD_FIXED_GROUP
        if node.animated:
            return node
        node = node.parent
    return None


def _round(v):
    return round(v, 4)


def build(scene, name, frames=0, pose=None):
    """Flatten to the exporter's dict. `pose(frame)` sets node transforms."""
    if frames and pose:
        pose(0)

    buckets = {}
    for mesh in scene.meshes:
        g = _group_of(mesh.parent)
        if g is WORLD_FIXED_GROUP or g == WORLD_FIXED_GROUP:
            key = WORLD_FIXED_GROUP
        elif frames and g is not None:
            key = g.name
        else:
            key = ""
        buckets.setdefault(key, []).append(mesh)

    group_names = sorted(buckets.keys())
    group_nodes = {}
    for n in scene.nodes:
        if n.name in group_names and n.animated:
            group_nodes[n.name] = n

    positions, normals, colour_index, palette = [], [], [], []
    lookup = {}
    groups = []

    for gname in group_names:
        first = len(colour_index) * 3
        to_local = (invert_rigid(group_nodes[gname].matrix_world())
                    if gname in group_nodes else None)
        for mesh in buckets[gname]:
            # GEOMETRY IS AUTHORED IN WORLD SPACE, and `parent` selects which
            # animated group a mesh belongs to -- it is NOT a second transform.
            #
            # The primitives above bake `location` and `rotation` straight into
            # their vertices, which is what makes a build script readable: every
            # number in it is a real position on the finished model. Applying
            # the parent chain on top of that transformed everything twice, and
            # a hammer authored at the hands ended up a metre above the head.
            #
            # This differs from Blender, where an object carries its own
            # transform and parenting composes. Both are consistent; only this
            # one lets `_hands_on` put a fist on the haft by naming the point.
            world = mesh.verts
            if to_local is not None:
                world = [apply(to_local, v) for v in mesh.verts]
            for fi, face in enumerate(mesh.faces):
                key = mesh.mat
                if mesh.face_mats:
                    key = mesh.face_mats[fi]
                hexcol, emission = scene.palette[key]
                rgba = _srgb(hexcol) + (emission,)
                pk = tuple(round(x, 4) for x in rgba)
                if pk not in lookup:
                    lookup[pk] = len(palette)
                    palette.append([_round(rgba[0]), _round(rgba[1]),
                                    _round(rgba[2]), round(rgba[3], 2)])
                idx = lookup[pk]
                # Fan-triangulate; every face here is planar and convex.
                for t in range(1, len(face) - 1):
                    tri = (world[face[0]], world[face[t]], world[face[t + 1]])
                    ux = (tri[1][0] - tri[0][0], tri[1][1] - tri[0][1],
                          tri[1][2] - tri[0][2])
                    vx = (tri[2][0] - tri[0][0], tri[2][1] - tri[0][1],
                          tri[2][2] - tri[0][2])
                    nx = ux[1] * vx[2] - ux[2] * vx[1]
                    ny = ux[2] * vx[0] - ux[0] * vx[2]
                    nz = ux[0] * vx[1] - ux[1] * vx[0]
                    ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
                    normals.extend([_round(nx / ln), _round(ny / ln),
                                    _round(nz / ln)])
                    colour_index.append(idx)
                    for p in tri:
                        positions.extend([_round(p[0]), _round(p[1]),
                                          _round(p[2])])
        groups.append({"name": gname, "first": first,
                       "count": len(colour_index) * 3 - first})

    pose_frames = []
    if frames and pose:
        for f in range(frames):
            pose(f)
            row = []
            for g in groups:
                if g["name"] in group_nodes:
                    m = group_nodes[g["name"]].matrix_world()
                    row.append([round(m[r][c], 5)
                                for c in range(4) for r in range(4)])
                else:
                    row.append(None)
            pose_frames.append(row)
        pose(0)

    return {"name": name, "triangles": len(colour_index), "palette": palette,
            "positions": positions, "normals": normals,
            "colourIndex": colour_index, "groups": groups,
            "frames": pose_frames}


def world_aabb(mesh, matrix):
    """One mesh's axis-aligned bounds, in whatever space `matrix` maps into."""
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for v in mesh.verts:
        w = apply(matrix, v) if matrix else v
        for i in range(3):
            if w[i] < lo[i]:
                lo[i] = w[i]
            if w[i] > hi[i]:
                hi[i] = w[i]
    return lo, hi


def overlap(a, b, slack=0.0):
    """How deep two AABBs interpenetrate on their shallowest axis.

    Negative or zero means they are apart. Positive is a real overlap, and the
    number is how far one would have to move to separate them -- which is the
    figure a modeller actually wants when a haft is inside a torso.
    """
    depth = 1e9
    for i in range(3):
        d = min(a[1][i], b[1][i]) - max(a[0][i], b[0][i]) - slack
        if d <= 0:
            return 0.0
        depth = min(depth, d)
    return depth


def write_js(model, filename):
    if not os.path.isdir(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    def arr(values):
        return "[" + ",".join(
            (repr(v) if isinstance(v, int) else ("%g" % v)) for v in values) + "]"

    lines = [
        "// GENERATED by tools/blender/td_mesh.py -- do not edit.",
        "// Source of truth is the build script beside it; re-run that.",
        "//",
        "// %d triangles, %d colours. Normals and colours are per TRIANGLE;" %
        (model["triangles"], len(model["palette"])),
        "// positions are per vertex. GLModels.register expands them.",
        "GLModels.register(%s, {" % json.dumps(model["name"]),
        "  unitsToPx: %g," % UNITS_TO_PX,
        "  triangles: %d," % model["triangles"],
        "  palette: %s," % json.dumps(model["palette"]),
        "  groups: %s," % json.dumps(model["groups"]),
        "  frames: %s," % json.dumps(model["frames"]),
        "  colourIndex: %s," % arr(model["colourIndex"]),
        "  normals: %s," % arr(model["normals"]),
        "  positions: %s" % arr(model["positions"]),
        "});",
        "",
    ]
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))
    return path
