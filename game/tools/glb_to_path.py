#!/usr/bin/env python3
"""Convert Claude Design's full Ironwood S-path into its file:// asset.

Run from game:

    python3 tools/glb_to_path.py ../glb/ironwood_forest_path_moduleS.glb

The game cannot fetch a GLB at runtime. The S file contains four already-bent
instances of one detailed module. The original straight module supplies their
intrinsic cross/along coordinates, so the generated classic script can bend
the exact, undecimated geometry along the live GamePath.
"""

import argparse
import collections
import json
import os
import re

from glb_to_model import Gltf, collect


HERE = os.path.dirname(__file__)
DEFAULT_OUT = os.path.join(HERE, "..", "js", "gl", "ironwood-path.js")
DEFAULT_REFERENCE = os.path.join(
    HERE, "..", "..", "glb", "ironwood_forest_path_module.glb")
EXPECTED_PARTS = {
    "path_moss_shoulder_left", "path_dirt_left", "path_worn_center",
    "path_dirt_right", "path_moss_shoulder_right", "path_side_left",
    "path_side_right", "path_cap_start", "path_cap_end", "path_base",
    "stones_embedded", "moss_clumps"
}
SURFACE_PARTS = {
    "path_moss_shoulder_left", "path_dirt_left", "path_worn_center",
    "path_dirt_right", "path_moss_shoulder_right"
}
SURFACE_MID = 0.31
SURFACE_RELIEF = 0.68
SIDE_BLEND = 0.25


def split_instances(parts):
    """Return the four complete bent instances stored in the S-shaped GLB."""
    groups = collections.OrderedDict()
    for part in parts:
        match = re.match(r"^(.*)_([1-4])$", part["name"])
        if not match:
            raise ValueError("S-path part has no _1.._4 suffix: %s" %
                             part["name"])
        base, instance = match.group(1), int(match.group(2))
        groups.setdefault(instance, {})[base] = part
    if set(groups) != {1, 2, 3, 4}:
        raise ValueError("S-path must contain instances 1..4; got %s" %
                         sorted(groups))
    for instance, group in groups.items():
        if set(group) != EXPECTED_PARTS:
            raise ValueError("instance %d differs; missing=%s extra=%s" %
                             (instance, sorted(EXPECTED_PARTS - set(group)),
                              sorted(set(group) - EXPECTED_PARTS)))
    return groups


def number(value):
    rounded = round(float(value), 4)
    if abs(rounded) < 0.00005:
        rounded = 0.0
    return int(rounded) if rounded.is_integer() else rounded


def array_lines(values, indent="      ", width=112):
    tokens = [json.dumps(number(value), separators=(",", ":"))
              for value in values]
    lines = []
    line = indent
    for token in tokens:
        addition = token + ","
        if len(line) + len(addition) > width and line.strip():
            lines.append(line)
            line = indent + addition
        else:
            line += addition
    if line.strip():
        lines.append(line)
    return "\n".join(lines)


def build_asset(source, reference):
    gltf = Gltf(source)
    instances = split_instances(collect(gltf))
    reference_gltf = Gltf(reference)
    reference_parts = collect(reference_gltf)
    by_name = {part["name"]: part for part in reference_parts}
    names = set(by_name)
    missing = EXPECTED_PARTS - names
    extra = names - EXPECTED_PARTS
    if missing or extra:
        raise ValueError("straight reference differs; missing=%s extra=%s" %
                         (sorted(missing), sorted(extra)))

    # Design's S is four deformed instances of this exact module. Verify the
    # relationship before using the straight coordinates. X/Z are expected to
    # differ because those are the axes bent into the S; topology, materials,
    # triangle order and every relief height must be identical.
    for instance, group in instances.items():
        for name in EXPECTED_PARTS:
            bent = group[name]["triangles"]
            straight = by_name[name]["triangles"]
            if len(bent) != len(straight):
                raise ValueError("%s_%d triangle count differs" %
                                 (name, instance))
            for triangle_index, (bent_tri, straight_tri) in enumerate(
                    zip(bent, straight)):
                if bent_tri[1] != straight_tri[1]:
                    raise ValueError("%s_%d material differs at triangle %d" %
                                     (name, instance, triangle_index))
                for bent_point, straight_point in zip(bent_tri[0],
                                                       straight_tri[0]):
                    if abs(bent_point[1] - straight_point[1]) > 1e-6:
                        raise ValueError("%s_%d relief differs at triangle %d" %
                                         (name, instance, triangle_index))

    all_points = [point for part in reference_parts
                  for triangle, _material in part["triangles"]
                  for point in triangle]
    start = min(point[2] for point in all_points)
    end = max(point[2] for point in all_points)
    half = max(abs(point[0]) for point in all_points)
    top = max(point[1] for point in all_points)

    # Keep the authored slab and its two soil sides byte-for-byte in shape.
    # Only the noisy top bands are calmed around their ordinary bed height.
    # The outermost shoulder vertices are shared with the side meshes, so the
    # compression fades fully out before that seam rather than opening a crack.
    surface_vertices = {
        point for name in SURFACE_PARTS
        for triangle, _material in by_name[name]["triangles"]
        for point in triangle
    }
    side_vertices = {
        point for name in ("path_side_left", "path_side_right")
        for triangle, _material in by_name[name]["triangles"]
        for point in triangle
    }
    shared_side = surface_vertices & side_vertices
    if not shared_side:
        raise ValueError("top surface and side meshes no longer share a seam")
    side_seam = min(abs(point[0]) for point in shared_side)

    def calm_surface(point):
        x, y, z = point
        start_blend = side_seam - SIDE_BLEND
        edge = (abs(x) - start_blend) / SIDE_BLEND
        edge = 0.0 if edge < 0 else (1.0 if edge > 1 else edge)
        edge = edge * edge * (3.0 - 2.0 * edge)
        factor = SURFACE_RELIEF + (1.0 - SURFACE_RELIEF) * edge
        return (x, SURFACE_MID + (y - SURFACE_MID) * factor, z)

    out = []
    module_triangles = 0
    for part in reference_parts:
        module_triangles += len(part["triangles"])
        by_material = collections.OrderedDict()
        for triangle, material in part["triangles"]:
            data = by_material.setdefault(material, [])
            for point in triangle:
                adjusted = point
                if part["name"] in SURFACE_PARTS or (
                        part["name"] in ("path_cap_start", "path_cap_end") and
                        point in surface_vertices):
                    adjusted = calm_surface(point)
                data.extend(adjusted)
        for material, data in by_material.items():
            out.append({"name": part["name"], "material": material,
                        "data": data})

    materials = []
    for material in reference_gltf.json.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        base = pbr.get("baseColorFactor", [0.8, 0.8, 0.8, 1.0])
        materials.append({"name": material.get("name", "material"),
                          "color": base[:3]})

    source_triangles = sum(len(part["triangles"])
                           for group in instances.values()
                           for part in group.values())
    return {
        "parts": out, "materials": materials, "start": start, "end": end,
        "half": half, "top": top, "source_triangles": source_triangles,
        "module_triangles": module_triangles, "instances": len(instances),
        "surface_relief": SURFACE_RELIEF
    }


def write_js(asset, output, source):
    lines = [
        "// GENERATED by tools/glb_to_path.py -- do not edit.",
        "// Source of truth is %s." % os.path.basename(source),
        "// %d source triangles = %d exact bent instances of one %d-triangle module." %
        (asset["source_triangles"], asset["instances"],
         asset["module_triangles"]),
        "// No vertices or faces are simplified.",
        "// Dirt-band micro-relief is retained at %d%%; side meshes are unchanged." %
        round(asset["surface_relief"] * 100),
        "var IronwoodPath = (function () {",
        '  "use strict";',
        "",
        "  var SOURCE_START = %s;" % number(asset["start"]),
        "  var SOURCE_END = %s;" % number(asset["end"]),
        "  var SOURCE_HALF = %s;" % number(asset["half"]),
        "  var SOURCE_TOP = %s;" % number(asset["top"]),
        "  var SURFACE_RELIEF = %s;" % number(asset["surface_relief"]),
        "  var PALETTE = ["
    ]
    for material in asset["materials"]:
        color = ", ".join(str(number(c)) for c in material["color"])
        lines.append("    [%s], // %s" % (color, material["name"]))
    lines.extend(["  ];", "", "  var PARTS = ["])
    for part in asset["parts"]:
        lines.append('    { name: %s, material: %d, data: [' %
                     (json.dumps(part["name"]), part["material"]))
        lines.append(array_lines(part["data"]))
        lines.append("    ] },")
    lines.extend([
        "  ];",
        "",
        "  var lastStats = null;",
        "",
        "  function owns(map) {",
        '    return !!map && map.id === "ironwood-frontier";',
        "  }",
        "",
        "  // sourceY = 0 is the forest floor and SOURCE_TOP is the highest",
        "  // stone/moss vertex. The importer has calmed only the noisy dirt",
        "  // bands; side soil and separate stones/moss retain their full Y.",
        "  function heightOf(sourceY, lift) {",
        "    return sourceY / SOURCE_TOP * lift;",
        "  }",
        "",
        "  function liftFor(path, roadWidth) {",
        "    var scale = path && path.widthScaleAt ? path.widthScaleAt(0) : 1;",
        "    return roadWidth * scale * SOURCE_TOP / (SOURCE_HALF * 2);",
        "  }",
        "",
        "  function at(path, distance, sourceX, sourceY, roadWidth, lift) {",
        "    var d = distance < 0 ? 0 : (distance > path.length ? path.length : distance);",
        "    var point = path.pointAt(d);",
        "    var tangent = path.tangentAt(d);",
        "    var widthScale = path.widthScaleAt ? path.widthScaleAt(d) : 1;",
        "    var cross = sourceX / SOURCE_HALF * roadWidth * widthScale / 2;",
        "    var surfaceLift = typeof lift === \"function\" ? lift(d) : lift;",
        "    return [point.x - tangent.y * cross, point.y + tangent.x * cross,",
        "            heightOf(sourceY, surfaceLift)];",
        "  }",
        "",
        "  function addPart(builder, path, part, d0, d1, roadWidth, lift, reverse) {",
        "    var data = part.data;",
        "    var span = SOURCE_END - SOURCE_START;",
        "    for (var i = 0; i < data.length; i += 9) {",
        "      var points = [];",
        "      for (var corner = 0; corner < 3; corner++) {",
        "        var offset = i + corner * 3;",
        "        var fraction = (data[offset + 2] - SOURCE_START) / span;",
        "        if (reverse) fraction = 1 - fraction;",
        "        points.push(at(path, d0 + (d1 - d0) * fraction, data[offset],",
        "          data[offset + 1], roadWidth, lift));",
        "      }",
        "      if (reverse) builder.tri(points[0], points[2], points[1],",
        "        PALETTE[part.material]);",
        "      else builder.tri(points[0], points[1], points[2],",
        "        PALETTE[part.material]);",
        "    }",
        "  }",
        "",
        "  function build(builder, path, roadWidth, lift) {",
        "    if (!path || !(path.length > 0)) return null;",
        "    // Fit a whole number of COMPLETE modules to the route. The natural",
        "    // length comes from the GLB's own length/width ratio; distributing",
        "    // the sub-percent remainder equally avoids crushing one last tile.",
        "    var scale = path.widthScaleAt ? path.widthScaleAt(path.length / 2) : 1;",
        "    var natural = roadWidth * scale * (SOURCE_END - SOURCE_START) /",
        "      (SOURCE_HALF * 2);",
        "    var tileCount = Math.max(1, Math.round(path.length / natural));",
        "    var tileLength = path.length / tileCount;",
        "    var d0 = 0, tile = 0, triangles = 0;",
        "    while (tile < tileCount) {",
        "      var d1 = tile === tileCount - 1 ? path.length : d0 + tileLength;",
        "      // The last stays forward so its authored END cap closes the route.",
        "      var reverse = (tile % 2) === 1 && tile !== tileCount - 1;",
        "      for (var partIndex = 0; partIndex < PARTS.length; partIndex++) {",
        "        var part = PARTS[partIndex];",
        '        if (part.name === "path_base") continue;',
        '        if (part.name === "path_cap_start" && d0 > 0) continue;',
        '        if (part.name === "path_cap_end" && d1 < path.length) continue;',
        "        addPart(builder, path, part, d0, d1, roadWidth, lift, reverse);",
        "        triangles += part.data.length / 9;",
        "      }",
        "      d0 = d1;",
        "      tile++;",
        "    }",
        "    lastStats = { tiles: tile, triangles: triangles,",
        "      sourceTriangles: %d, moduleTriangles: %d," %
        (asset["source_triangles"], asset["module_triangles"]),
        "      surfaceRelief: SURFACE_RELIEF };",
        "    return lastStats;",
        "  }",
        "",
        "  return { build: build, owns: owns, liftFor: liftFor,",
        "    stats: function () { return lastStats; } };",
        "})();",
        ""
    ])
    with open(output, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(
        description="Convert the full Ironwood S-path to a runtime JS asset.")
    parser.add_argument("source")
    parser.add_argument("--out", default=DEFAULT_OUT)
    parser.add_argument("--reference", default=DEFAULT_REFERENCE,
                        help="straight module used to unbend the S instances")
    args = parser.parse_args()
    asset = build_asset(args.source, args.reference)
    write_js(asset, args.out, args.source)
    print("ironwood path: %d source triangles, %d exact triangles per module; wrote %s" %
          (asset["source_triangles"], asset["module_triangles"], args.out))


if __name__ == "__main__":
    main()
