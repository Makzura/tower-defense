# ---------------------------------------------------------------------------
# Enemy type `camo_normal` -- the Cooper. 4 hp, speed x1, bounty 4. First wave 14.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-camo_normal
#
# NOTE THE UNDERSCORE. The registered model name is `enemy-camo_normal`, because
# `gl-world.js::enemyModel()` looks up `"enemy-" + enemy.typeId` and the type id
# is `camo_normal`. A regex character class written as [a-z-] drops it silently
# and has already cost this project two wrong roster counts. There is no regex
# in that path -- verified by running the lookup, not by reading it -- and none
# should be added.
#
# THIS BODY IS DELIBERATELY INDISTINGUISHABLE FROM THE GLEANER, AND THAT IS THE
# DESIGN RATHER THAN A COMPROMISE. Diego's ruling: "do the camos like the
# others, just make them a bit translucent or sum." So a camo body is an
# ORDINARY body and the identifying cue is the RENDERER's -- translucency in the
# GL path. The mesh is not asked to carry the read.
#
# **"It does not separate from the Gleaner" is this model working** -- but only
# as a statement about the MESH, and the rendered pair needs its metric named or
# the sentence is worse than useless.
#
# The two meshes are near-identical by design, so a sweep run on GEOMETRY puts
# this pair at the bottom of the board and that is the intended result.
#
# THE RENDERED PAIR IS A DIFFERENT QUESTION AND IT ANSWERS BOTH WAYS. juno
# measured otto's cue in isolation -- `CAMO_ALPHA = 0.62`, forced on a real body
# against the identical body opaque, default camera, on the road, 8 frames:
#
#     body pixels                402 - 465
#     pixels that CHANGE         400 - 464   = 99.5% of the body
#     mean magnitude of change   24.8 - 26.9 of 255  = ~10% of range
#
# So a Cooper/Gleaner separation figure reads as **~100% different by
# changed-pixel count and ~10% different by magnitude, from the same two
# frames**, and both numbers are true. Either "maximally separated" or "barely
# separated" can be reported honestly. **A separation figure for this pair is
# meaningless without naming which metric produced it** -- the same failure as
# quoting a count without its threshold, arriving on a different axis.
#
# One consequence worth carrying: the cue is a REDUCTION, not a mark. Contrast
# against the ground goes 1.21 -> 1.17, so translucency makes a camo body very
# slightly harder to pick off the road while making it different from an opaque
# sibling. Thematically right; it adds contrast nowhere.
#
# WHAT IT IS. A cooper is a barrel-maker, and this one has closed its hold. The
# Gleaner's cargo weeps -- lit panes, a glowing core behind bars. The Cooper's
# is capped, blinded and sealed. Same frame, same stoop, same walk; a hold that
# has been shut.
#
# THREE THINGS DELIBERATELY NOT MODELLED, EACH FOR A MEASURED REASON:
#
#   * THE EIGHT BOLT HEADS around the gasket lid. 0.4 px each at the default
#     camera -- under the ~0.05 u floor where a feature stops existing -- and
#     this type reaches 107 bodies on screen. Eight invisible solids times a
#     hundred bodies is the most expensive kind of nothing.
#   * THE BLINDED WINDOWS. The panes are not replaced with geometry, they are
#     RECOLOURED to plain `tin` (`window_mat` on the shared cage). Blinding a
#     window is a material fact; modelling a cover for it would add solids to
#     say something the palette already says.
#   * ANY SECOND SILHOUETTE FEATURE. The lid's rim is the only outline change,
#     and it is small on purpose. There is nothing else to find here.
#
# THE GRAB HANDLE IS FICTION AND IS EXPECTED NOT TO READ. It is kept because a
# sealed cask has a handle and the model is looked at up close in previews; it
# is not expected to survive the default view and no read depends on it.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.append(os.path.dirname(__file__))

import td_scene as td
import enemy_chassis as chassis

ORTHO_SCALE = chassis.ORTHO_SCALE
WALK_FRAMES = 8

# The Gleaner's gait exactly. Same pose, same phasing, same everything -- this
# body is not separated by motion either.
SWING_DEG = 28.0
ARM_SWING_DEG = 14.0

# --- the gasket lid ---------------------------------------------------------
#
# ITS ONLY SILHOUETTE JOB IS THE RIM. The shared cage's drum (`cargo_housing`)
# has radius 0.108 and the core sits proud of it; the lid is 0.125, so it stands
# 0.017 u past the drum and squares off a profile that was round. That is the
# whole outline change and it is deliberately the only one.
#
# The depth and placement are chosen so the lid ENCLOSES the glowing core rather
# than needing the sealed cage's materials changed: the core spans cage-local x
# 0.209..0.247 and the lid spans 0.203..0.248. Nothing of the cage's
# construction moves -- only the panes' colour, which is a plating variation
# that roster Law 02 sanctions in its own words.
LID_R = 0.125
LID_DEPTH = 0.045
LID_X = 0.2255
LID_Z = 0.015


def build_lid(m, body, lift):
    """The bolted gasket lid and its handle. Two solids, no bolt heads."""
    parts = [
        td.cyl("gasket_lid", LID_R, LID_DEPTH,
               location=(LID_X, 0.0, LID_Z + lift),
               rotation=(0.0, math.radians(90.0), 0.0),
               mat=m["tin"], parent=body, verts=12),
    ]
    # The folding handle. Fiction, not a read -- see the header.
    parts.append(
        td.cyl("lid_handle", 0.014, 0.10,
               location=(LID_X - 0.02, 0.0, LID_Z + 0.128 + lift),
               rotation=(math.radians(90.0), 0.0, 0.0),
               mat=m["tin_dark"], parent=body, verts=8))
    return parts


def build():
    """Returns (root, body, parts) -- the Gleaner with its hold shut."""
    m = chassis.materials()
    body_z = 0.0
    lift = chassis.BODY_REFERENCE_Z - body_z

    root = td.root("camo_normal")
    body = td.root("camo_normal_body")
    body.parent = root
    body.location = (0.0, 0.0, body_z)

    chassis.torso_frame(m, body, lift)
    # The sealed cage, unmodified in construction. `window_mat` blinds the three
    # inspection panes to plain tin -- a plating variation, not a rebuild.
    chassis.cargo_cage(m, body, lift, window_mat="tin")
    build_lid(m, body, lift)
    chassis.head(m, body, lift, lens_segments=8, lens_rings=4)
    arm_l, arm_r = chassis.arms(m, body, lift)
    leg_l, leg_r = chassis.legs(m, body, lift)
    shield = chassis.shield_projectors(m, body, lift)

    parts = {"arm_l": arm_l, "arm_r": arm_r, "leg_l": leg_l, "leg_r": leg_r,
             "shield_parts": shield}
    chassis.set_shield_visible(parts, False)
    return root, body, parts


def animate_walk(body, parts, frames=WALK_FRAMES):
    chassis.animate_walk(body, parts, frames=frames, swing_deg=SWING_DEG,
                         arm_swing_deg=ARM_SWING_DEG)


def export_build():
    """The exporter contract: build, hide, animate, return the frame count."""
    _root, body, parts = build()
    chassis.set_shield_visible(parts, False)
    animate_walk(body, parts, WALK_FRAMES)
    return WALK_FRAMES
