# ---------------------------------------------------------------------------
# The Siphon -- the harvester.
#
#   python tools/blender/tower_siphon.py
#
# Builds siphon-base / a3 / a5 / b3 / b5 straight into js/gl/models/. No Blender:
# this authors against td_mesh, which speaks td_scene's primitive vocabulary and
# emits export_mesh's exact file contract.
#
# WHY THIS TOWER IS THE WIZARD. The owner asked for the old magician read to
# survive somewhere in a project that is otherwise arcane TECH, and the model
# contract caps it on the Warbringer by name ("this must never become a
# wizard" -- he is a smith). The Sniper is a martyr and the Rifleman a gangster.
# That leaves the Siphon, and it is the right one on mechanics alone: it does no
# ballistics at all. It holds a continuous beam on a body, drains it, banks the
# drain as gold (charge-gold), heals off it (lifesteal), and at B5 refuses a
# death outright. That is not a gunner. It is a robed figure with a focus,
# pulling something out of the enemy along a thread.
#
# So: a hooded robe, a focus ring held out at arm's length, and a reservoir he
# cradles that visibly FILLS. No face -- two ley points under the hood. He is the
# only tower in the game with no weapon on him anywhere.
#
# WHAT THE TIERS SAY, from beam.config.js rather than invented:
#   base  one focus, one reservoir
#   a3    ramp and charge-gold: a second reservoir on the back, brass gutter
#   a5    the harvest rig: three intake arms feeding one enlarged core
#   b3    lifesteal: a return line from the focus INTO his chest
#   b5    death denial and the healing pool: a heart-vessel, running bright
#
# GEOMETRY IS AUTHORED IN WORLD SPACE (see td_mesh.build). `parent` selects the
# animated/world-fixed group; it is not a second transform. Every number below
# is a real position on the finished model.
#
# NO ANIMATION FRAMES. The Siphon's whole tell is its beam, which the runtime
# draws, and its emissive core, which `uGlow` drives off the live charge. A
# baked idle loop would fight both. Same choice sniper-a3 upward makes.
# ---------------------------------------------------------------------------

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import td_mesh as td                                          # noqa: E402


# --- palette ----------------------------------------------------------------
# A VALUE LADDER. The robe is by far the largest surface, so it takes the
# darkest value; the mantle sits one step up so the shoulders read; brass is the
# payoff colour (this tower turns damage into money) and ley is the drain. Only
# the core, the fill line and the eyes emit.
PALETTE = {
    "robe":       ("#2B2A38", 0.0),
    "robe_lit":   ("#3A3849", 0.0),
    "mantle":     ("#474357", 0.0),
    "hood_void":  ("#131219", 0.0),
    "iron":       ("#3A3F4A", 0.0),
    "iron_dark":  ("#23272F", 0.0),
    "steel":      ("#59606E", 0.0),
    "brass":      ("#9A7B3C", 0.0),
    "brass_lit":  ("#C9A227", 0.0),
    "skin":       ("#B08155", 0.0),
    "ley":        ("#4FE3D2", 1.0),
    "ley_dim":    ("#2E8C86", 0.45),
    "ley_core":   ("#8CF6EA", 1.0),
}

# Where the focus sits, in the model's own space. The runtime reads this back
# out of the printed table to anchor the beam on the ring rather than on a
# percentage of a generic barrel -- the rule the sniper pack already follows.
FOCUS = (0.17, 0.64, 1.00)
RESERVOIR = (-0.12, 0.28, 0.72)


def _foundation(s, fixed, tier):
    """The dais. Bolted to the tile, so it must NOT turn with the aim."""
    td.frustum(s, "dais", 0.62, 0.55, 0.10, (0, 0, 0.05), "iron_dark", fixed, 12)
    td.frustum(s, "dais_step", 0.50, 0.46, 0.06, (0, 0, 0.13), "iron", fixed, 12)
    # A collection gutter: this tower banks what it drains, so the money colour
    # belongs on the thing that catches it.
    td.torus(s, "gutter", 0.545, 0.038, (0, 0, 0.105), (0, 0, 0), "brass", fixed,
             16, 6)
    td.torus(s, "sigil", 0.40, 0.022, (0, 0, 0.163), (0, 0, 0), "ley_dim", fixed,
             16, 5)
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        td.cyl(s, "stud%d" % i, 0.045, 0.09,
               (math.cos(a) * 0.545, math.sin(a) * 0.545, 0.145), (0, 0, 0),
               "brass", fixed, 6)
    if tier in ("a5",):
        # The harvest rig stands ON the dais, so its posts are map-fixed too.
        for i in range(3):
            a = math.tau * i / 3 + math.pi / 2
            px, py = math.cos(a) * 0.46, math.sin(a) * 0.46
            td.frustum(s, "post%d" % i, 0.055, 0.035, 0.62, (px, py, 0.47),
                       "iron", fixed, 6)
            td.ball(s, "post_lamp%d" % i, 0.045, (px, py, 0.80), "ley", fixed,
                    8, 5)


def _figure(s, body, tier):
    """The robed man. Turns to face what he is draining."""
    # The robe IS the silhouette: one long taper, no legs visible. Largest
    # surface, darkest value.
    td.frustum(s, "robe", 0.345, 0.20, 1.00, (0, 0, 0.66), "robe", body, 10)
    td.frustum(s, "hem", 0.365, 0.345, 0.07, (0, 0, 0.195), "robe_lit", body, 10)
    td.torus(s, "hem_band", 0.352, 0.020, (0, 0, 0.235), (0, 0, 0), "brass",
             body, 14, 5)
    # Mantle over the shoulders, one value up so the shoulder line reads.
    td.frustum(s, "mantle", 0.185, 0.275, 0.20, (0, 0, 1.12), "mantle", body, 10)
    td.torus(s, "clasp", 0.10, 0.028, (0, 0.16, 1.19), (math.pi / 2, 0, 0),
             "brass_lit", body, 10, 5)
    # Hood: a tapered cowl with a genuinely empty face. The void is a separate
    # near-black solid rather than an absence, so it reads at 55 px.
    td.frustum(s, "hood", 0.175, 0.115, 0.30, (0, -0.01, 1.34), "robe_lit",
               body, 8)
    td.frustum(s, "hood_brow", 0.150, 0.170, 0.07, (0, 0.02, 1.29), "robe",
               body, 8)
    td.ellipsoid(s, "face_void", (0.19, 0.13, 0.20), (0, 0.075, 1.335),
                 "hood_void", body, (0, 0, 0), 10, 5)
    for sx in (-1, 1):
        td.ball(s, "eye%d" % sx, 0.026, (0.048 * sx, 0.135, 1.345), "ley", body,
                8, 5)

    # Right arm, held OUT. The focus is at the end of it and the beam leaves
    # from there, so the arm has to actually reach the ring.
    sh_r = (0.215, 0.02, 1.16)
    el_r = (0.295, 0.30, 1.06)
    wr_r = (0.215, 0.545, 1.00)
    td.ball(s, "shoulder_r", 0.095, sh_r, "mantle", body, 8, 5)
    td.tube(s, "upper_r", 0.062, sh_r, el_r, "robe_lit", body, 8)
    td.tube(s, "fore_r", 0.052, el_r, wr_r, "robe_lit", body, 8)
    td.ball(s, "hand_r", 0.052, wr_r, "skin", body, 8, 5)

    # THE FOCUS. No weapon anywhere on this tower -- this ring is the whole of
    # its armament, and the emissive core is what uGlow drives while it channels.
    fx, fy, fz = FOCUS
    core_r = {"base": 0.055, "a3": 0.062, "a5": 0.082, "b3": 0.058, "b5": 0.070}[tier]
    td.torus(s, "focus_outer", 0.150, 0.032, (fx, fy, fz), (math.pi / 2, 0, 0),
             "brass", body, 14, 6)
    td.torus(s, "focus_inner", 0.095, 0.020, (fx, fy, fz), (math.pi / 2, 0, 0),
             "iron", body, 12, 5)
    td.ball(s, "focus_core", core_r, (fx, fy, fz), "ley_core", body, 10, 6)
    for i in range(3):
        a = math.tau * i / 3 + math.pi / 6
        td.tube(s, "prong%d" % i, 0.018,
                (fx + math.cos(a) * 0.095, fy, fz + math.sin(a) * 0.095),
                (fx + math.cos(a) * 0.150, fy, fz + math.sin(a) * 0.150),
                "steel", body, 6)

    # Left arm, cradling the reservoir against the hip.
    sh_l = (-0.215, 0.02, 1.16)
    el_l = (-0.295, 0.16, 0.92)
    wr_l = (-0.165, 0.30, 0.82)
    td.ball(s, "shoulder_l", 0.095, sh_l, "mantle", body, 8, 5)
    td.tube(s, "upper_l", 0.062, sh_l, el_l, "robe_lit", body, 8)
    td.tube(s, "fore_l", 0.052, el_l, wr_l, "robe_lit", body, 8)
    td.ball(s, "hand_l", 0.050, wr_l, "skin", body, 8, 5)

    # THE RESERVOIR, and it visibly holds something.
    rx, ry, rz = RESERVOIR
    fill = {"base": 0.13, "a3": 0.19, "a5": 0.22, "b3": 0.15, "b5": 0.25}[tier]
    td.frustum(s, "vessel", 0.165, 0.125, 0.30, (rx, ry, rz), "brass", body, 10)
    td.cyl(s, "vessel_fill", 0.128, fill, (rx, ry, rz - 0.15 + fill / 2),
           (0, 0, 0), "ley_dim", body, 10)
    td.torus(s, "vessel_collar", 0.135, 0.026, (rx, ry, rz + 0.15), (0, 0, 0),
             "brass_lit", body, 12, 5)

    # The siphon line: focus -> reservoir. This is the tower's own plumbing and
    # the reason the two objects read as one machine rather than two props.
    td.tube(s, "line", 0.022, (fx - 0.02, fy - 0.10, fz - 0.10),
            (rx + 0.02, ry + 0.02, rz + 0.16), "ley_dim", body, 6)


def _tier_extras(s, body, fixed, tier):
    """What each tier adds, from what that tier actually does."""
    fx, fy, fz = FOCUS
    rx, ry, rz = RESERVOIR

    if tier == "a3":
        # Ramp + charge-gold: he starts carrying a second vessel on his back.
        td.frustum(s, "pack", 0.145, 0.115, 0.26, (0, -0.235, 0.95), "brass",
                   body, 8)
        td.torus(s, "pack_collar", 0.120, 0.022, (0, -0.235, 1.08), (0, 0, 0),
                 "brass_lit", body, 10, 5)
        td.tube(s, "pack_line", 0.020, (0, -0.20, 1.06), (rx, ry - 0.08, rz + 0.14),
                "ley_dim", body, 6)

    if tier == "a5":
        # The harvest rig: three intakes feeding one enlarged core.
        for i in range(3):
            a = math.tau * i / 3 + math.pi / 2
            px, py = math.cos(a) * 0.46, math.sin(a) * 0.46
            td.tube(s, "intake%d" % i, 0.026, (px, py, 0.80),
                    (fx * 0.45, fy * 0.45 + 0.06, 1.16), "ley_dim", body, 6)
        td.torus(s, "focus_halo", 0.215, 0.022, (fx, fy, fz), (math.pi / 2, 0, 0),
                 "ley", body, 16, 5)

    if tier == "b3":
        # Lifesteal: the drain comes BACK, into him.
        td.tube(s, "feed", 0.024, (fx - 0.06, fy - 0.16, fz - 0.04),
                (0.0, 0.16, 1.10), "ley_dim", body, 6)
        td.torus(s, "chest_port", 0.075, 0.024, (0, 0.165, 1.09),
                 (math.pi / 2, 0, 0), "brass", body, 10, 5)
        td.ball(s, "chest_core", 0.048, (0, 0.168, 1.09), "ley", body, 8, 5)

    if tier == "b5":
        # Death denial and the healing pool: he is carrying a heart now, and it
        # is the brightest thing on the model because it is what keeps him up.
        td.ellipsoid(s, "heart", (0.24, 0.18, 0.26), (0, 0.155, 1.06),
                     "brass", body, (0, 0, 0), 10, 6)
        td.ellipsoid(s, "heart_core", (0.15, 0.11, 0.17), (0, 0.185, 1.06),
                     "ley_core", body, (0, 0, 0), 10, 6)
        for sx in (-1, 1):
            td.tube(s, "rib%d" % sx, 0.020, (0.11 * sx, 0.16, 1.19),
                    (0.055 * sx, 0.16, 0.93), "brass_lit", body, 6)
        td.tube(s, "feed", 0.026, (fx - 0.06, fy - 0.16, fz - 0.04),
                (0.05, 0.22, 1.10), "ley", body, 6)


def build(tier):
    s = td.Scene(PALETTE)
    root = s.node("root")
    fixed = s.node("world_fixed", parent=root, world_fixed=True)
    body = s.node("body", parent=root)
    _foundation(s, fixed, tier)
    _figure(s, body, tier)
    _tier_extras(s, body, fixed, tier)
    return td.build(s, "siphon-" + tier)


def main():
    for tier in ("base", "a3", "a5", "b3", "b5"):
        model = build(tier)
        td.write_js(model, "siphon-%s.js" % tier)
        print("siphon-%-4s %5d tris" % (tier, model["triangles"]))
    print("focus anchor (model space): %.3f %.3f %.3f" % FOCUS)


if __name__ == "__main__":
    main()
