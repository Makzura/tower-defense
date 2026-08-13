# ---------------------------------------------------------------------------
# Enemy type `angry` -- the Tripod. 14 hp, speed x0.7, bounty 15, sizeScale 1.25.
#
# **THIS BODY HAS THREE NAMES AND ALL THREE ARE HERE ON PURPOSE.** The build
# script is `enemy_hedger.py`, the enemy type id is `angry`, the exported model
# is `enemy-angry.js`, and what the player sees is **the Tripod**. rhea wrote a
# clause 8 ruling naming only "the Hedger" and nobody searching for `angry` or
# Tripod would have found it; she also had to check the exporter to be sure kaz
# and I were describing one body and not two with identical measurements. Any
# document about this body should carry all of the names it answers to.
#
#   blender --background --factory-startup --python tools/blender/export_mesh.py \
#           -- --only=enemy-angry
#
# WHAT THIS MACHINE IS, IN FOUR SENTENCES. A sealed drum carried at hip height on
# three legs. One tool is bolted to the drum's forward rim and works out in front
# of the machine at a fixed reach. What the machine carries is slung underneath,
# in the space three legs leave and two do not. It is the only ordinary frame the
# intelligence ever armed, and it was armed by taking the room the cargo used to
# have.
#
# THE ORDERING EVERY PART OBEYS: the tool is primary structure and the machine is
# arranged around it; the cargo hardware is what got displaced to make room. One
# part -- the hold -- exists specifically to show that ordering.
#
# EVERY PART BELOW SAYS WHAT IT IS FOR, AND THAT IS A GATE RATHER THAN A HABIT.
# The body this replaces failed it in writing: its own header argued that its arm
# "does not need to be legible as a tool", and three people read past the
# sentence. A part that cannot answer "what is it for" is decoration, and
# decoration is what that sentence was defending. Nothing from that header
# survives here.
#
# `core_red` IS A BATTERY. Diego, 2026-08-13: "Enemies do not have mana yet --
# they don't have flesh, so no mana. The red my predecessor put was just there
# for looks, but we can say it's the battery." Machine power. Not mana, not
# arcane, not corrupted energy -- do not let those words back in. (`ley` on other
# bodies is the enemy's shield and is unrelated; colour is an application, never
# an allegiance.)
#
# --- the two numbers that are load bearing ---------------------------------
#
# THE `mast` GROUP ROOT IS AT z = 0, AND THAT IS A CORRECTION TO THE BRIEF.
# mira's inventory asks for it at (0, 0, 0.80) -- the drum's own centre -- so
# that the attack override is a bare rotation with no pivot arithmetic. It
# cannot go there, and the reason is the exporter:
#
#     export_mesh.py:199-204   geometry is stored in the GROUP ROOT'S LOCAL SPACE
#     gl-models.js:120-124     model.top is max z over the raw `positions` array
#
# so an elevated root's height never enters `positions` at all. Verified on the
# body this replaces rather than reasoned: its `crank` root sat at model z 0.600
# and its stored geometry ran z [-0.582, 0.000] -- the crank's top read as ZERO.
# That file's health bar was correct only because its tallest geometry lived in a
# group whose root was at z = 0.
#
# THIS BODY'S TALLEST GEOMETRY IS THE DRUM, AND THE DRUM IS INSIDE `mast`. With
# the root at 0.80 `model.top` would have read some leg's local height and the
# health bar would have been painted through the machine, permanently, at every
# frame. **The rule, in the sharp form: the group holding the model's TALLEST
# geometry must have its root at z = 0.** Leaf roots still belong at their own
# pivots -- only the group that owns the top is constrained.
#
# The pivot is not lost, it moves to the caller: otto applies
# `GLMath.localPose(out, [0, 0, 0.80], 0, ry, 0, 0, 0, 0)`. Nothing else in the
# gesture changes, and mira's health-bar table gets MORE accurate rather than
# less -- the raw positions now carry the true 0.9200 u.
#
# THE STRIKE IS NOT BAKED AND THERE IS NO SECOND BAND. `bands` stays a single
# walk band of 12 frames. otto drives the stroke live through `drawActor`'s
# per-group `overrides`, and the moment this file exports a 13th non-walk frame
# the walking body cycles through it once per stride.
#
# --- THE LIVE-POSE SEAM IS INVISIBLE TO THIS PIPELINE IN THREE PLACES --------
#
# Read this before building any other body that uses `overrides`. Every gate
# here reads BAKED geometry, so the pose the machine spends 0.4 s in every 2.5 s
# is guarded by nothing at all. Three separate traps, and **not one of them
# raises an error or turns a gate red**:
#
# 1. **AN UNKEYED GROUP ROOT IS NOT A GROUP.** `mast` is keyed to identity on
#    every frame. That is not animation -- it is the only thing that MAKES it a
#    group. `export_mesh._group_root` walks up to the nearest ancestor holding an
#    ACTION, so an unkeyed empty is transparent to it: the drum, bill, head, core
#    and hold would have exported inside `angry_body`, and the runtime would have
#    had no `mast` group to override. The export succeeds, every count is
#    correct, the walk is right, and the attack silently does nothing. The keys
#    cost nothing else: the mast still inherits bob and roll through its parent,
#    because the exporter writes each group's `matrix_world` per frame.
#
# 2. **`model.top` IS READ FROM THE REST MESH, SO AN OVERRIDE CAN BURY THE HEALTH
#    BAR.** `gl-models.js:120-124` takes it as max z over the raw `positions` at
#    load -- before any frame pose and before any override. Anything the stroke
#    lifts above the rest silhouette eats the flat 10 board px pad, and it does
#    so once every 2.5 s, which is worse to look at than a bar simply in the
#    wrong place. Measured here: 4.10 px of the 10, leaving 5.90.
#
# 3. **`check_penetration.py` WALKS THE BAKED FRAMES AND REPORTS THIS BODY
#    CLEAN.** It is clean, over the walk. At full stroke the drum enters the hub
#    by 0.0477 u and the tool never sees it. See the posed measurements further
#    down -- they were taken by hand because nothing takes them for you.
#
# The through-line: a gate that is green about the walk is silent about the
# strike, and the strike is the only thing this body does that the others do not.
#
# --- what the gait does, and the one place the brief cannot be met ----------
#
# THREE LEG GROUPS. This is the first body in the project to use more than two,
# and it needed a fix to the shared chassis to be possible at all (`0add35e`):
# the swing phase and the support window rotated in opposite directions, which
# two groups cannot show because `+N/2 == -N/2 (mod N)`. Before it, two of these
# three legs slid 19.31 and 14.33 board px while the solver reported success.
#
# 12 FRAMES, AND THE COUNT IS NOW GATED. `frames % len(groups)` must be 0 or the
# whole-frame shifts are not thirds; 12 gives shifts 0, 4, 8 exactly.
#
# THE SWING TRAVELS lead -> other lead -> trailing, which is mira's call and is
# carried by the group ORDER below, not by the leg positions. Liftoff frames are
# 4, 8, 12 for groups 0, 1, 2.
#
# **THE ORDERING IS ARBITRARY, PINNED AND DOCUMENTED -- IT IS NOT JUSTIFIED, AND
# THAT IS THE ACCURATE DESCRIPTION RATHER THAN A GAP.** The brief originally gave
# a reason: the trailing leg "should only ever be off the ground while both
# leading legs are planted", the prop never leaving the ground between the two
# placements it braces. That is false here and no ordering can make it true. The
# shared support window is duty 0.5 -- six planted frames of twelve -- so the
# body has exactly one foot down on six frames; the trailing leg is airborne on
# frames 12, 1, 2, 3, 4, 5 and on four of those only ONE leading leg is planted.
# Every ordering is a rotation of the same cycle, so it was never an ordering
# question. mira withdrew the justification rather than replace it, on the
# grounds that a reason invented after the fact is worse than an admitted
# arbitrary choice because the next reader treats it as load bearing. **So the
# only real reason this ordering matters is the renumbering trap below.**
#
# AND DUTY 2/3 IS CLOSED, NOT PENDING. It was the one change that would have made
# the withdrawn sentence true, and it is refused on evidence order (kaz: a read
# requirement is settled by looking, and nobody had looked) and on merit (mira:
# duty 0.5 is what produces the +-0.1874 excursion, and her re-run puts the
# gesture at 7.58x at the dominant bearing against 4.21x at the duty-2/3
# excursion of 0.30). **Duty 0.5 makes the attack read BETTER.** A tripod is
# dynamically balanced at every duty in any case -- two feet is a line, not a
# support polygon -- so this was never a physics requirement. Do not reopen it
# without a capture showing the walk staggering.
#
# FOOT EXCURSION IS +-0.1874 u, and it is derived rather than chosen: one cycle
# is 0.899281 u of travel, a plant is 6 of 12 frames, so the planted sweep is
# (6-1)/12 of a cycle = 0.3747 u. That is mira's sensitivity table's 0.19 row --
# the gesture reads at 7.6x in the band it acts in.
#
# `bob` 0.015 AND `roll_deg` 1.3, half the chassis default, and it is one lever
# with three results: it gives the strike back 23% of its margin at yaw 0 because
# the body roll and the attack compete for the same visual channel; it halves the
# roll's contribution to plan extent, which grows rather than shrinks because the
# chassis rolls about a body root ON THE GROUND; and it halves the 2-against-3
# beat between bob/roll (twice a cycle) and three footfalls. Not zero -- a body
# that does not bob reads as sliding.
#
# THE 1.25 sizeScale IS NOT BAKED. The runtime applies it. Baking a second one
# would land this at 1.5625x.
#
# THE STROKE ANGLE IS THE LAST THING TO GIVE UP HEALTH-BAR PAD, NOT THE FIRST,
# AND THE FROZEN BRIEF SAYS THE OPPOSITE. Its section 8 item 2 was written before
# the duty cycle was counted; otto has since measured 1-4 attacks per body, mean
# 1.95, with the gesture occupying 2.4% of a body's time on screen. So the stroke
# spends its 4.1 board px of pad 2.4% of the time while anything standing taller
# -- a cap, a boss, an antenna -- spends it 100% of the time. Weakest claim on the
# pad by cost, therefore the strongest claim to keep it: if this body is ever
# tight on the 10 px `crownOf` pad, take it out of STANDING HEIGHT.
#
# The same number is why 34 degrees is held rather than economised: at 1.95
# attacks a player sees this gesture about twice per machine, so it has to read
# on first sight with no learning. 88% of a read you only get twice is a worse
# trade than the angle table makes it look.
#
# --- what the walk gate cannot see, measured separately ---------------------
#
# `check_penetration.py` walks the BAKED frames, and the strike is not baked --
# so nothing in this pipeline looks at the pose the machine spends 0.4 s in
# every 2.5 s. Measured by hand on the exported file, mast at 34 degrees:
#
#     bill tip                 rest x 0.524 z 0.783  ->  strike x 0.425 z 0.493
#     sign check               tip BELOW the drum centre line          OK
#     rise over rest top       4.10 board px of the health bar's 10    (brief: 4.1)
#     clearance under the bar  5.90 board px                           (brief: 5.9)
#     plan radius of the mast  0.4595 u struck against 0.5253 at rest
#
# The stroke pulls the tool INWARD, so the struck body is narrower in plan than
# the resting one and the strike cannot break the plan budget -- the brief
# predicted that and it holds.
#
# **AND ONE THING NEITHER BRIEF ANTICIPATED: THE DRUM PLOUGHS INTO THE HUB.**
# Rotating a drum of radius 0.221 about its own centre swings its bottom rim
# down by `R sin 34 = 0.123 u`, and the hub is directly beneath it -- so the
# drum's forward underside enters the hub's solid by **0.0477 u (1.9 board px)**
# at full stroke. It is structural, not a sizing miss: any hub taller than about
# 0.06 u is hit by any drum rotated this far about its own centre.
#
# **I believe it is interior and I am not treating that as settled.** The
# dipping edge stays inside the hub's own cylinder rather than breaking its
# silhouette; the part of the drum's rim that descends OUTSIDE the hub passes
# beside it, which is just the drum tipping. That is a geometric argument and
# the honest instrument is a render. With juno; the standards question of
# whether clause 8 reaches an unbaked pose is with rhea.
#
# SWEPT PER Z-SLICE AND PER PART, BECAUSE THE OBVIOUS FIXES ARE ALL WRONG:
#
#     part            depth     reaches r    at z      first contact
#     drum rim        0.0523    0.1041       0.5951    18 deg of stroke
#     hold            (abuts)   0.1282       0.5478    at rest, by design
#
# - **IT IS THE DRUM, NOT THE HOLD.** The hold's figure is its designed abutment
#   against the hub's underside, measured radially; it is not an intrusion.
# - **THE TIGHT POINT IS MID-HUB (z 0.595), NOT THE TOP**, because the rim
#   sweeps into the hub's SIDE on its way down rather than over its top face. So
#   tapering the hub's top does not reach the constraint at all -- the top slice
#   already clears at 0.1613 against a hub surface of 0.1564.
# - **A CONE THAT CLEARS HAS TO NARROW DOWNWARD TO ABOUT r 0.069**, less than
#   half the hub's radius, and it then falls away from the leg hips at 0.1564 --
#   so the legs would meet nothing. The cone seat is not the cheap lever it
#   looks like.
# - **THE ONLY LEVER IS THE STROKE ANGLE, AND IT IS CHEAPER THAN THE BRIEF
#   SAYS.** First contact is at 18 deg, so anything at or under 17 is clean by
#   construction. The brief prices 20 deg at "about a third of the read" and
#   declines it; that figure was taken before the excursion was known and never
#   measured across bearings. Re-measured at the built +-0.1874, banded:
#
#       bearing  road%   34 deg   17 deg
#          0     60.2%   7.41x    4.27x
#         45     13.4%   5.77x    3.86x
#         90      4.5%   4.24x    2.45x
#        180      6.9%   7.13x    4.13x
#        315     13.2%   2.70x    2.72x
#        270      1.7%   0.96x    0.97x   <- fails at BOTH angles
#
#   **17 deg costs no bearing.** Every bearing carrying road still reads, at
#   2.45x to 4.27x, and the road that fails is the same 1.7% that already fails
#   at 34. What it costs is 42% of the silhouette change at the dominant bearing
#   (71.7 px to 41.3) and half the tip drop (6.0 to 3.1 screen px).
#
#   Read that table DOWN a column, not ACROSS a row: the band is the mast's own
#   projected rows, so a smaller stroke shrinks the denominator with it. 315
#   appearing to improve at 17 deg is that artefact, not a gain.
#
# **RULED, 2026-08-14: THE STROKE IS 17 DEGREES, NOT 34.** rhea ruled that clause
# 8 reaches a pose that is never baked -- on the clause's own words, "in some
# pose, WHATEVER THE NUMBERS SAY", which is an instruction that a passing
# measurement does not discharge. `check_penetration.py` walks baked frames
# because those were the only poses that existed when it was written: **the
# instrument narrowed, the rule did not.** kaz took the disposition to 17 rather
# than declare an exclusion. First contact is at 18 deg, so 17 is clean by
# construction rather than by margin.
#
# The exposure that was argued over, stated correctly: `attackFlash` decays
# 1 -> 0, so time above a threshold f is `(1 - f) * T`, giving
# `0.4 * (1 - 18/34) = 0.1882 s` -- **47% of the window, 1.11% of a body's time
# on screen.** The intuitive `f * T` gives 53% and 1.25% and is wrong. It changed
# no conclusion, which is why it was worth catching.
#
# **NOTHING IN THIS FILE CHANGES FOR IT, AND THAT IS NOT AN OVERSIGHT.** The
# stroke angle is not in the mesh. It is `angle = deg * attackFlash` in otto's
# runtime override; this file exports one walk band and a `mast` group keyed to
# identity. So there is no re-export, the geometry is untouched, and every gate
# result above still stands. What this header owns is the SPEC, and the spec is
# now 17.
#
# **BUT DROPPING TO 17 IS NOT A ONE-CONSTANT CHANGE, AND THAT IS THE TRAP.** The
# geometry is one constant and a re-export. THE BRIEF IS NOT. The gesture is
# specified BY a widest-row migration, and 17 deg halves the exact quantity it is
# specified by -- measured at the built excursion, yaw 0:
#
#     stroke  0 deg    widest row =  4 of 27
#     stroke 17 deg    widest row =  7 of 27    3 rows, 11% of figure height
#     stroke 34 deg    widest row = 10 of 27    6 rows, 22% of figure height
#
# So the brief's headline -- "the machine's widest point drops to its middle and
# walks back up to its shoulder" -- stops being true at 17. mira's replacement,
# written in advance so it cannot be skipped: **"the widest row drops three rows,
# 11% of the figure height, and climbs back"**, with the tip drop 6.0 -> 3.1
# screen px. Still a real read at 2.45x to 4.27x on every bearing carrying road;
# a different and smaller one.
#
# **Whoever flips the constant owns that sentence too.** A one-line change that
# silently falsifies the document it was built from is the drift this header
# exists to prevent, and it is easy to skip precisely because the code edit looks
# trivial.

import math
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import bpy
import td_scene as td
import enemy_chassis as chassis


# --- the figure --------------------------------------------------------------
#
# F IS THE MACHINE'S STANDING HEIGHT, drum top to road. Every dimension below is
# a fraction of F, exactly as the brief states them, so a change to the figure's
# height carries the whole body with it instead of drifting part by part.
F = 0.920

WALK_FRAMES = 12

# The preview camera. Shared with the rest of the road so this body is framed
# the same way as everything it walks beside.
ORTHO_SCALE = chassis.ORTHO_SCALE

# The mast pivot the runtime rotates about. Authored here as a CONSTANT rather
# than as this group's root, for the reason in the header. otto reads it.
#
# 0.8004, NOT THE BRIEF'S 0.80, AND THE ASSERT BELOW IS WHY THIS IS WRITTEN
# DOWN. The brief gives the drum's centre as 0.87F and the pivot as 0.80; those
# are the same number only if F is 0.9195, and F is 0.920. Taking 0.80 literally
# put the drum's top face at 0.9196 and the figure's height silently 0.0004 u
# short of its own definition. The drum is authored at its briefed 0.87F and the
# pivot follows it, because the pivot's whole justification is that it IS the
# drum's centre.
#
# **otto does not need to change anything.** 0.0004 u is 0.016 board px at this
# body's sizeScale -- two hundredths of a pixel -- so `[0, 0, 0.80]` and
# `[0, 0, 0.8004]` are the same rotation on screen. This note exists so that if
# the figure height ever moves, the pivot moves with it instead of staying at a
# literal that used to be right.
MAST_PIVOT_Z = 0.870 * F

# The stance.
HIP_R = 0.170 * F                    # the hub's own radius: hips on its edge
HIP_Z = 0.670 * F                    # the hub's centre line
FOOT_R = 0.270 * F                   # foot pad centres, from the axis
THIGH_L, THIGH_W = 0.390 * F, 0.087 * F
SHIN_L, SHIN_W = 0.350 * F, 0.082 * F
FOOT_L, FOOT_W, FOOT_T = 0.160 * F, 0.160 * F, 0.065 * F

HUB_R, HUB_H = 0.170 * F, 0.150 * F

# The mass.
DRUM_R, DRUM_H = 0.240 * F, 0.260 * F
DRUM_Z = MAST_PIVOT_Z
RIM_R, RIM_H = 0.255 * F, 0.054 * F

# The tool.
BILL_L, BILL_W, BILL_T = 0.350 * F, 0.076 * F, 0.065 * F
BILL_TIP_X = 0.570 * F               # reach, from the machine's axis
HEAD_L, HEAD_W, HEAD_T = 0.098 * F, 0.110 * F, 0.110 * F
CORE_D, CORE_W, CORE_T = 0.054 * F, 0.098 * F, 0.098 * F

# The displaced part.
HOLD_L, HOLD_W, HOLD_H = 0.220 * F, 0.240 * F, 0.170 * F

# TWO LEAD, ONE TRAILS, and the arrangement is not free. The stroke comes down
# between the two leading legs into a clear gap; with one leg leading it comes
# down onto its own leg. And the trailing leg is the prop that stops the frame
# pitching forward onto its work, which is the only reason a machine that pushes
# needs a third leg.
LEG_BEARINGS = (60.0, -60.0, 180.0)

# THE GROUP ORDER IS THE FOOTFALL WAVE AND NOTHING ELSE CARRIES IT. Group 0
# lifts at frame 4, group 1 at 8, group 2 at 12, so the swing travels from one
# leading leg to the other leading leg and then to the trailing one. Renumber
# these without renumbering LEG_BEARINGS and the wave runs backwards: the body
# still walks, still plants, passes every gate, and is wrong.
GAIT_GROUPS = (("leg_0",), ("leg_1",), ("leg_2",))

BOB = 0.015
ROLL_DEG = 1.3


# THE SUPPOSED-TO-TOUCH PAIRS, WITH REASONS. `check_penetration.py` reports an
# AABB overlap per part per frame; without this table its whole list is
# undeclared and a real defect would sit in it unread.
#
# **EVERY ENTRY HERE IS EITHER A SOCKET OR A BOX, AND THE DISTINCTION MATTERS.**
# A thigh is a 0.359 u box tilted 36.5 degrees, so its axis-aligned box has a
# radial half-extent of 0.139 against the limb's own 0.040 -- **3.5x inflation**.
# That is the shin case AGENTS clause 8 warns about, and it is why the thigh
# appears to overlap the hold and the drum: at the hold's z range the thigh's
# real radius is 0.207..0.323 against the hold's corner radius of 0.150, so the
# solids are 0.06 u apart while their boxes intersect. Checked before believing
# the hit, not after.
PENETRATION_CONTACTS = (
    # Sockets: the leg is built into the hub, which is what a hub is FOR.
    ("hub", "thigh_0", "the leg is socketed into the hub -- the hip sits on the "
                       "hub's own radius, so the thigh's top end is inside it"),
    ("hub", "thigh_1", "socket, as thigh_0"),
    ("hub", "thigh_2", "socket, as thigh_0"),
    # The drum seats on the hub by construction; asserted in build().
    ("drum", "hub", "the drum seats ON the hub -- they are designed to overlap "
                    "by 0.005 u so there is no daylight under the mass"),
    ("hold", "hub", "the hold's top face abuts the hub's underside exactly; the "
                    "reported depth is the body roll inflating two AABBs"),
    # Box artefacts on a tilted limb -- see the note above.
    ("drum", "thigh_0", "AABB of a 36.5-degree tilted limb, 3.5x inflated; the "
                        "solids clear. The thigh's top does rise into the drum's "
                        "enclosed underside during swing, which is interior"),
    ("drum", "thigh_1", "as thigh_0"),
    ("drum", "thigh_2", "as thigh_0"),
    ("hold", "thigh_0", "AABB artefact: at the hold's z range the thigh sits at "
                        "radius 0.207..0.323 against the hold's 0.150 corner"),
    ("hold", "thigh_1", "as thigh_0"),
    ("hold_plate_0", "thigh_0", "as hold/thigh_0"),
    ("hold_plate_0", "thigh_1", "as hold/thigh_0"),
)


def materials():
    """The palette, with the one saturated colour named for what it is.

    Taken from the shared chassis so this body sits in the same value ladder as
    the rest of the road: `tin_dark` is the largest and darkest surface, `tin`
    the working metal, `brass` the fittings.
    """
    m = chassis.materials()
    # THE BATTERY. Same colour key as every other red on the road, correct name.
    # Emission is inert on ground enemies -- nothing drives the uniform -- so
    # this reads on value against its neighbour or it does not read at all.
    m["battery"] = td.material("battery", "core_red", emission=1.55,
                               roughness=0.28)
    return m


# --- the mass ----------------------------------------------------------------


def build_drum(m, mast):
    """The drum, its mounting ring, and the reason the drum is round.

    FOR: the machine's whole working volume and all of its mass.

    AND THE REASON IT IS ROUND IS THE TOOL. The tool is bolted to its rim, so a
    round body is one whose outline does not change shape as anything turns on
    it; a square body would flicker in outline for the same motion. 16 segments
    against the brief's floor of 12 -- a coarse drum flickers over the gait,
    which is the one thing the roundness is buying.

    THE DRUM SETS `model.top`, AND THEREFORE WHERE THE HEALTH BAR HANGS. Nothing
    may ever be stacked on it: a cap or an antenna above it raises the bar for a
    body that is mostly shorter than that, permanently, for a part that does not
    read at 17 px wide.
    """
    td.cyl("drum", DRUM_R, DRUM_H, location=(0.0, 0.0, DRUM_Z),
           mat=m["tin"], parent=mast, verts=16)

    # FOR: the mounting ring the tool bolts through, so the tool's load goes
    # into the drum's shell the whole way round rather than into one plate. It
    # is why the tool can sit anywhere on the rim, and why this frame could be
    # converted at all rather than rebuilt.
    td.cyl("rim_band", RIM_R, RIM_H, location=(0.0, 0.0, DRUM_Z),
           mat=m["brass"], parent=mast, verts=16)


def build_bill(m, mast):
    """The tool. It is what the frame was rebuilt around.

    FOR: below boss tier this is the only armed thing in the game, and this bar
    is the arming.

    HORIZONTAL AT REST IS A SPECIFICATION, NOT A DEFAULT. It is the pose the
    design was approved in, the pose the model is previewed and health-barred
    in, and what makes the strike a pure downward event with nothing to trade.

    AND IT IS WHAT KEEPS THE TOOL'S LENGTH OUT OF THE HEALTH BAR. Carried
    horizontal at drum-centre height, the tip sits below the drum's top face --
    so the DRUM sets `model.top` and the bill's length never enters the bar
    height at all. The constraint that replaces the trade is one line, asserted
    below: the rest tip must stay at or below the drum's top face.
    """
    inner_x = BILL_TIP_X - BILL_L
    td.box("bill", (BILL_L, BILL_W, BILL_T),
           location=(0.5 * (inner_x + BILL_TIP_X), 0.0, DRUM_Z),
           mat=m["tin_dark"], parent=mast)

    # FOR: the working end -- the part that actually meets the growth.
    #
    # FLUSH WITH THE BAR'S TIP, NOT PROUD, AND THE WORD IS DOING WORK. Proud
    # measures plan radius 0.547; flush measures 0.522, which is the approved
    # figure. Same head, same read, and flush gives the approved plan back for
    # free. It is also the point the eye tracks through the whole stroke, and a
    # bar this thin without a lump on the end anti-aliases into a line.
    td.box("bill_head", (HEAD_L, HEAD_W, HEAD_T),
           location=(BILL_TIP_X - 0.5 * HEAD_L, 0.0, DRUM_Z),
           mat=m["tin"], parent=mast)

    # FOR: it is the battery -- the power the tool draws, mounted on the tool's
    # side because it feeds it. Flagged honestly by the brief and repeated here
    # so nobody re-argues it: at roughly 2 x 2 screen px against low contrast on
    # the tin it sits on, this is a reward for a player who zooms, not a read at
    # game scale. It is first on the drop list if anything ever has to go.
    td.box("core", (CORE_D, CORE_W, CORE_T),
           location=(DRUM_R, 0.0, DRUM_Z - 0.5 * BILL_T - 0.5 * CORE_T),
           mat=m["battery"], parent=mast)


def build_hold(m, mast):
    """The cargo hold, slung under the drum.

    FOR: it still carries. This frame was rebuilt for the tool, and the cargo
    went where there was room left over -- underneath, in the space three legs
    leave and two do not. It is the part that shows the ordering: the tool took
    the front of the machine and the cargo went under it.

    Demoted honestly: it is inside the silhouette at every bearing, so it is
    fiction rather than signal and is not counted as one of this body's reads.

    IT MUST NOT GO ON THE REAR RIM, and that is a hard constraint rather than a
    preference. A rear-rim hold balances the tool and measures marginally better
    on top-quarter fill -- and it rides UP as the tool comes down, taking the
    strike's rise from 4.1 to 6.6 board px of the health bar's 10 px of pad. Two
    thirds of the clearance, for a part that is interior at every bearing.

    ITS HEIGHT IS LOWERED FROM THE BRIEF AND THE REASON IS THE STRIKE. Centred
    at the briefed 0.63F it overlaps the hub in both z and radius -- and the hub
    is on the BODY while the hold is on the MAST, so the two are rigid at rest
    and tear through each other the moment the mast rotates. A still frame
    cannot show it. Slung clear beneath the hub instead; measured, not assumed.
    """
    top = HIP_Z - 0.5 * HUB_H
    z = top - 0.5 * HOLD_H
    td.box("hold", (HOLD_L, HOLD_W, HOLD_H), location=(0.0, 0.0, z),
           mat=m["tin_dark"], parent=mast)
    # The two bar plates. First on the drop list after the battery: interior at
    # every bearing, roughly a pixel of internal edge.
    for i, sx in enumerate((1.0, -1.0)):
        td.box("hold_plate_%d" % i, (0.018, HOLD_W * 0.92, HOLD_H * 0.62),
               location=(sx * 0.5 * HOLD_L, 0.0, z),
               mat=m["brass"], parent=mast)


# --- the stance --------------------------------------------------------------


def build_hub(m, body):
    """The joint the three legs meet in and the seat the drum sits on.

    FOR: without it there is no shared member and the machine is three sticks
    holding a barrel.

    IT IS ON THE BODY, NOT ON THE MAST, and that is structural. The legs hang
    from it, so if it turned with the strike the leg tops would separate from
    the machine. `mast` is everything ABOVE the hub, exactly as briefed.
    """
    td.cyl("hub", HUB_R, HUB_H, location=(0.0, 0.0, HIP_Z),
           mat=m["tin_dark"], parent=body, verts=16)


def _limb(name, m, leg, bearing, r0, z0, r1, z1, width):
    """One straight limb segment, from (r0, z0) to (r1, z1) in the leg's own
    radial plane, positioned relative to the LEG ROOT at (HIP_R, HIP_Z).

    THE BOX IS TILTED, THE LEG ROOT IS NOT, and that split is the whole reason
    the gait works on a radial body. `animate_walk_grouped` keys the leg root's
    FULL euler as `(0, swing * phase, 0)`, so any rest rotation on the root is
    overwritten at frame 1 and silently lost. The bearing therefore has to live
    in the geometry, and it does: every leg root sits unrotated, so a local-Y
    swing moves all three feet along the same global travel axis -- which is
    what a walk needs, since the body travels on +x however the legs are
    arranged around it.
    """
    ang = math.radians(bearing)
    dr, dz = r1 - r0, z1 - z0
    length = math.hypot(dr, dz)
    # The tilt from straight down, as an XYZ euler: Rz(bearing) * Ry(tilt)
    # carries the box's local +z onto (sin t cos b, sin t sin b, cos t).
    tilt = math.pi - math.atan2(dr, -dz)
    mid_r, mid_z = 0.5 * (r0 + r1), 0.5 * (z0 + z1)
    td.box(name, (width, width, length),
           location=((mid_r - HIP_R) * math.cos(ang),
                     (mid_r - HIP_R) * math.sin(ang),
                     mid_z - HIP_Z),
           rotation=(0.0, tilt, ang), mat=m["tin"], parent=leg)
    return length


def _knee(r_hip, z_hip, r_foot, z_foot):
    """Where the knee lands, solved so the two briefed segment lengths are used
    exactly rather than stretched to fit.

    THE KNEE BULGES OUTWARD. The alternative root of the same triangle puts all
    three knees near the machine's own axis, where they would converge on each
    other and on the hold -- and the brief says "down and outward" for the thigh
    in any case.
    """
    dr, dz = r_foot - r_hip, z_foot - z_hip
    span = math.hypot(dr, dz)
    # Angle at the hip between hip->foot and hip->knee.
    cos_a = ((THIGH_L ** 2 + span ** 2 - SHIN_L ** 2) / (2.0 * THIGH_L * span))
    cos_a = max(-1.0, min(1.0, cos_a))
    a = math.acos(cos_a)
    # Bearing of hip->foot, measured outward from straight down.
    base = math.atan2(dr, -dz)
    out = base + a
    return r_hip + THIGH_L * math.sin(out), z_hip - THIGH_L * math.cos(out)


def build_legs(m, body):
    """Three identical legs at 120 degrees.

    FOR: IT STANDS STILL AND TAKES LOAD THROUGH THE TOOL. Two legs have to be
    balanced continuously; three are statically determinate, so this frame can
    push forward against something without walking into it. That is the mechanic
    restated as a body plan, not a styling choice.

    FOOT NAMES ARE GLOBALLY UNIQUE ON PURPOSE. `_foot_measure` and
    `gait_solve.contact_x` resolve `leg_N` -> `foot_N` through
    `bpy.data.objects`, a GLOBAL lookup, so three feet naming themselves the
    same thing would collect Blender's `.001` suffixes and the sole solver would
    measure the wrong foot on two of three -- a body standing on one leg and
    floating on the rest, with nothing raised anywhere.
    """
    legs = []
    for i, bearing in enumerate(LEG_BEARINGS):
        ang = math.radians(bearing)
        leg = td.root("leg_%d" % i)
        leg.parent = body
        leg.location = (HIP_R * math.cos(ang), HIP_R * math.sin(ang), HIP_Z)

        knee_r, knee_z = _knee(HIP_R, HIP_Z, FOOT_R, 0.5 * FOOT_T)
        _limb("thigh_%d" % i, m, leg, bearing,
              HIP_R, HIP_Z, knee_r, knee_z, THIGH_W)
        _limb("shin_%d" % i, m, leg, bearing,
              knee_r, knee_z, FOOT_R, 0.5 * FOOT_T, SHIN_W)

        # FOR: the flat pad the machine actually stands on. Flat and
        # unrotated -- the sole solver plants it at z = 0 and a rocking sole
        # would be measured at its centroid, which is not where it touches.
        td.box("foot_%d" % i, (FOOT_L, FOOT_W, FOOT_T),
               location=((FOOT_R - HIP_R) * math.cos(ang),
                         (FOOT_R - HIP_R) * math.sin(ang),
                         0.5 * FOOT_T - HIP_Z),
               mat=m["tin_dark"], parent=leg)
        legs.append(leg)
    return tuple(legs)


# --- assembly ----------------------------------------------------------------


def build():
    """Build the machine and return (root, body, parts).

    THE RIG, AND EVERY ROOT'S HEIGHT IS A DECISION:

        angry            model root, z = 0
          angry_body     z = 0   -- bob and roll are keyed here, and the chassis
                                    rolls ABOUT THIS ROOT, so on the ground
            hub          the shared member the legs hang from
            mast         z = 0   -- see the header: it owns the drum, which owns
                                    model.top, so its root cannot be elevated
            leg_0..2     at their own hips, which is where they pivot
    """
    m = materials()

    root = td.root("angry")
    body = td.root("angry_body")
    body.parent = root
    body.location = (0.0, 0.0, 0.0)

    # NOT a chassis torso, cargo cage, head or arm. There is nothing to hold:
    # the tool is bolted to the rim and the cargo is a cage, not a grip. No
    # head, no lens, no eye -- the machine does not turn to what it cuts, so a
    # sensor here would steer nothing, and a sensor that steers nothing is
    # decoration.
    mast = td.root("mast")
    mast.parent = body
    mast.location = (0.0, 0.0, 0.0)

    build_hub(m, body)
    build_drum(m, mast)
    build_bill(m, mast)
    build_hold(m, mast)
    legs = build_legs(m, body)

    # --- the checks that are cheap and would have cost an export ------------
    #
    # These are REST-POSE arithmetic and are therefore not clearances. They
    # catch a mistyped fraction, not a collision; `check_penetration.py` and the
    # posed-strike sweep are what answer the geometry.
    drum_top = DRUM_Z + 0.5 * DRUM_H
    assert abs(drum_top - F) < 1e-6, (
        "the drum's top face is the figure's height by definition: %.6f vs %.6f"
        % (drum_top, F))
    assert DRUM_Z + 0.5 * HEAD_T <= drum_top + 1e-9, (
        "the bill's rest tip must stay at or below the drum's top face, or the "
        "TOOL sets model.top and its length starts moving the health bar")
    hold_top = HIP_Z - 0.5 * HUB_H
    assert hold_top <= HIP_Z - 0.5 * HUB_H + 1e-9, (
        "the hold hangs BELOW the hub, or it tears through it during the "
        "strike -- the hold is on the mast and the hub is on the body")
    assert HOLD_H < HIP_Z - 0.5 * HUB_H, (
        "the hold must fit between the hub's underside and the road")
    assert DRUM_Z - 0.5 * DRUM_H <= HIP_Z + 0.5 * HUB_H + 1e-9, (
        "the drum must seat on the hub, not float above it")

    parts = dict(("leg_%d" % i, legs[i]) for i in range(3))
    return root, body, mast, parts


def animate_walk(body, mast, parts, frames=WALK_FRAMES):
    """The walk, and the identity keys that make `mast` a group.

    NO ARMS TO COUNTER THE LEGS -- `arms=()`. The old chassis function indexed
    `parts["arm_l"]` unconditionally and raised on an armless body.
    """
    chassis.animate_walk_grouped(body, parts, GAIT_GROUPS, frames=frames,
                                 bob=BOB, roll_deg=ROLL_DEG, arms=(),
                                 solve_swing=True)

    # `mast` IS KEYED TO IDENTITY, AND IT IS NOT ANIMATION. `_group_root` walks
    # up to the nearest ancestor holding an ACTION; an unkeyed empty is
    # transparent to it, so without these keys the drum, bill and hold would be
    # exported as part of `angry_body` and otto would have no group to override.
    # The keys are constant: the walk moves this group only through the body it
    # is parented to, which the exporter picks up because it writes each group's
    # matrix_world per frame -- so the mast inherits bob and roll for free and
    # the machine cannot come apart.
    for f in range(1, frames + 1):
        chassis.key(mast, f, location=(0.0, 0.0, 0.0),
                    rotation=(0.0, 0.0, 0.0))


def export_build():
    """The exporter contract: build, animate, return the frame count.

    ONE BAND. The strike is live, not baked -- see the header.
    """
    _root, body, mast, parts = build()
    animate_walk(body, mast, parts, WALK_FRAMES)
    return WALK_FRAMES
