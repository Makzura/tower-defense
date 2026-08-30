"""Solve a walk so the planted contact does not slide.

WHY THIS EXISTS. The walk is DISTANCE-DRIVEN. `js/gl/gl-world.js` advances the
frame index by `progress / stride`, with `stride = radiusPx * 2.6 = 28.6 *
sizeScale` board px, and `drawActor` scales the model by `unitsToPx *
sizeScale`. The two `sizeScale` terms cancel, so

    one full walk cycle = 28.6 / UNITS_TO_PX = 0.899281 MODEL UNITS of travel

for every body, at every size, at every speed. A planted contact must travel
backward along the model's local +X -- the heading axis, since `GLMath.modelYaw`
maps local +X onto `atan2(heading.y, heading.x)` -- by exactly that much over
one cycle, or the body slides along the road.

WHAT WAS WRONG WITH THE OLD GAIT. `enemy_chassis.animate_walk_grouped` authors
the plant as a fixed hip rotation, `swing_deg = 28.0`. A planted foot's backward
travel is therefore `L * (sin t + sin t/2)` where L is hip height above the
sole -- a function of LEG LENGTH and of nothing else, never once compared to the
stride. Measured with `tools/check-gait-slip.js` over the shipped roster, no
body reads zero: the Gleaner is right to 0.277 board px BY COINCIDENCE, because
28 degrees happens to solve the stride to within 1.3% for its 0.480 hip. Every
body that changed its leg length inherited the same 28 and slid by the
difference, out to 19.867 px on the Dray.

THE FIX IS TO SOLVE, NOT TO TUNE. Do not pick an angle and measure the error
afterwards; state where the contact must be and find the angle that puts it
there. That makes the authored slip zero by construction rather than small by
luck, and it keeps being zero when someone later changes the leg length -- which
is the failure this whole file exists to make impossible.

THIS MODULE STEERS ON ONE FOOT AND CERTIFIES A WHOLE BODY. READ THIS BEFORE
TRUSTING A CONVERGENCE. `enemy_chassis.animate_walk_grouped` drives its
bisection from `groups[0][0]` and measures no other contact, so what a
successful solve proves is "group 0's foot lands where it was told" -- not "this
body's gait is correct". On a biped, and on the two-group quadruped and hexapod
trots, those are the same statement because every other leg is the same leg at
another phase. **Above two groups they come apart, and the solver reports
success either way.**

It happened, on 2026-08-14, on the first body ever to pass three groups: the
solve converged while `foot_1` and `foot_2` slid **19.31 and 14.33 board px**
against `foot_0`'s 0.24. The cause was in the chassis (the swing phase and the
support window rotated in opposite directions), but the reason it could sit
there unseen is this file: **a gate that measures one member of the population
it certifies cannot fail on the others.**

**So the convergence of this module is not the gate.** `tools/check-gait-slip.js`
iterates EVERY foot and reports a worst foot; it is the instrument that answers
"is this body's gait correct", and it would have caught the above the first time
a three-group body ran. Run it on anything with more than two leg groups, and do
not let a clean solve here stand in for it. `verify_plant` below is a per-contact
re-measure and exists for the same reason -- but it too only checks the contact
you hand it, so hand it all of them.

SOLVE THE ANGLE, NOT A TRANSLATION. Translating a leg root in x would also
land the contact, and it is wrong: the leg would slide horizontally out of its
own hip. The rotation is the joint the body actually has, so the rotation is
what gets solved. `enemy_chassis._set_sole_height` may then plant the sole in z
exactly as it always has -- z and x are solved by different means and do not
fight, because the z solve translates along the leg and the x solve rotates
about its pivot.

MEASURE EVALUATED GEOMETRY, NEVER A MODEL OF IT. Same rule `_foot_measure`
follows: step the scene to the frame and ask Blender where the contact actually
is. A body roll, a parent transform, a bevel or a later change to the foot then
cannot silently invalidate the solve, and the root-find needs no analytic model
of the leg at all.

This module imports `bpy` lazily, so the arithmetic below can be imported and
tested without Blender.
"""

import math

# Identical to export_mesh.UNITS_TO_PX and td_mesh.UNITS_TO_PX. Derived, not
# typed: 20 u.l. is the Longshot's footprint and 1.529 px/u.l. comes from
# js/skins/draw-pack.js, times UNIT_LENGTH 1.04.
UNITS_TO_PX = 20.0 * 1.529 * 1.04            # 31.8032

# stride = Enemy.RADIUS_PX * 2.6 at sizeScale 1 (js/gl/gl-world.js:1328).
STRIDE_PX_AT_1 = 11.0 * 2.6                  # 28.6

# The one number this file is about.
CYCLE_UNITS = STRIDE_PX_AT_1 / UNITS_TO_PX   # 0.8992806...


def travel_per_frame(frames):
    """How far the body advances while ONE pose is held.

    `bandFrame` floors (gl-world.js:1565), so the pose is held constant across
    the whole interval while the instance matrix keeps translating. This is the
    amplitude of the quantization sawtooth -- component B -- and no rig can
    reduce it. The only lever is `frames`.
    """
    return CYCLE_UNITS / float(frames)


def contact_targets(frames, plant_frames, anchor_x=0.0):
    """Where a planted contact must sit, per frame, in the model's local +X.

    `plant_frames` is the ordered list of frame indices (0-based, in walk-band
    order) over which one leg keeps contact; it may wrap past the end of the
    cycle, and the wrap is the step an eye-authored gait almost always gets
    wrong. `anchor_x` is where the contact is placed on the first of them.

    The contact is fixed in the WORLD, so in the model's own space it must move
    backward by exactly one frame's travel per frame held.
    """
    step = travel_per_frame(frames)
    targets = {}
    for i, frame in enumerate(plant_frames):
        targets[frame] = anchor_x - i * step
    return targets


def swing_angle_for(reach, span_units):
    """A first guess at the half-swing angle, for a leg that is a pendulum.

    A contact `reach` below its pivot, swept symmetrically through +-theta,
    travels `2 * reach * sin(theta)`. Inverting it gives a starting angle for
    the root-find below -- and, more usefully, tells a brief-writer up front
    whether a proposed pivot height can reach the stride at all.

    Returns None when the geometry cannot cover the span at any angle, which is
    the honest answer for a pivot that is too low: the Dray's 0.120 hip cannot
    reach 0.337 u however far it rotates, and that is exactly why it slides.
    """
    if reach <= 0.0:
        return None
    ratio = span_units / (2.0 * reach)
    if ratio > 1.0:
        return None
    return math.asin(ratio)


def plant_span_units(frames, plant_count):
    """How far the contact must travel backward across one plant.

    `plant_count` frames held means `plant_count - 1` intervals between the
    sampled poses. Getting this off by one is the difference between a gait
    that is right and one that is a frame-step out, which is 1/N of a stride.
    """
    return (plant_count - 1) * travel_per_frame(frames)


# --- the Blender half --------------------------------------------------------


def _bpy():
    import bpy
    return bpy


def contact_x(name, corner_pick=None):
    """The world x of a part's contact, from EVALUATED geometry.

    SELECTS THE CONTACT IN **LOCAL** Z AND MEASURES IT IN WORLD X. That split
    is the whole correctness of this function and it is not a detail.

    An earlier version of this selected in WORLD z -- "the corners currently
    nearest the ground", which is the obvious definition and is wrong. A foot
    on a rotating hip ROLLS, so the world-lowest corners are the heel edge at
    one end of the plant and the toe edge at the other: the function silently
    changes WHICH MATERIAL POINT it tracks half way through the solve. The two
    edges differ by `half_length * cos(theta)`, which is EVEN in theta, so no
    swing angle can cancel it -- the solver would converge, report success, and
    have solved the wrong quantity.

    That is the same artefact that made three people measure the Gleaner's
    planted sweep as 44.6%, 55.3% and 98.6% of requirement on the same file.
    See the header of `tools/check-gait-slip.js`, which selects its sole from
    REST positions for exactly this reason.

    Selecting in local z picks a fixed set of material points once, whatever
    the pose. Averaging their world x then tracks the sole CENTRE -- which is
    the same quantity `check-gait-slip.js` reports, so the pre-export solve and
    the post-export gate measure the same thing rather than two things that
    happen to be close.

    Found by the Vanguard build, which hit it in a real rig; the synthetic
    legs this module was first tested on had a contact box 0.08 u long, far too
    short for the roll to show. A negative control that cannot fail on an axis
    is not a control on that axis.

    `corner_pick` overrides the default mean -- pass `min` or `max` for a part
    that must plant one specific edge. It receives a list of world x values.
    """
    bpy = _bpy()
    from mathutils import Vector
    bpy.context.view_layer.update()
    obj = bpy.data.objects[name]
    local = [Vector(c) for c in obj.bound_box]
    lowest_local_z = min(c.z for c in local)
    # A FIXED material set, chosen in the part's own space, so it names the
    # same vertices at every frame of the cycle.
    sole = [c for c in local if c.z <= lowest_local_z + 1e-6]
    xs = [(obj.matrix_world @ c).x for c in sole]
    if corner_pick is not None:
        return corner_pick(xs)
    return sum(xs) / len(xs)


def solve_contact_x(leg, contact_name, frame, target_x, axis=1,
                    bracket=(-1.2, 1.2), tol=1e-5, max_iter=60,
                    corner_pick=min):
    """Rotate `leg` about `axis` until its contact reaches `target_x`.

    A bisection on evaluated geometry: no analytic model of the leg, so it
    stays correct across any reshaping of the part. `axis` is the index into
    `rotation_euler` (1 = Y, the swing axis for a body facing +X).

    Bisection rather than a secant deliberately -- the contact of a real part
    is piecewise linear in the angle, because WHICH corner touches the ground
    changes as the leg rolls, and a secant step across one of those corners
    diverges. Bisection only needs monotonicity and cannot.

    Raises rather than returning a best effort. A gait that silently failed to
    solve is exactly the class of defect this module exists to end; a build
    that stops is cheap next to a boss that ships sliding.
    """
    bpy = _bpy()
    bpy.context.scene.frame_set(frame)
    lo, hi = bracket

    def at(angle):
        rot = list(leg.rotation_euler)
        rot[axis] = angle
        leg.rotation_euler = rot
        bpy.context.view_layer.update()
        return contact_x(contact_name, corner_pick)

    x_lo, x_hi = at(lo), at(hi)
    if (x_lo - target_x) * (x_hi - target_x) > 0.0:
        raise ValueError(
            "contact cannot reach x=%.5f at frame %d: the bracket [%.3f, %.3f] "
            "spans x %.5f..%.5f. The pivot is too low or the leg too short -- "
            "this is the Dray's defect and no angle fixes it; change the "
            "geometry or the plant schedule." % (
                target_x, frame, lo, hi, min(x_lo, x_hi), max(x_lo, x_hi)))

    for _ in range(max_iter):
        mid = 0.5 * (lo + hi)
        x_mid = at(mid)
        if abs(x_mid - target_x) < tol:
            break
        if (x_lo - target_x) * (x_mid - target_x) <= 0.0:
            hi, x_hi = mid, x_mid
        else:
            lo, x_lo = mid, x_mid
    else:
        raise ValueError("contact x solve did not converge at frame %d" % frame)

    rot = list(leg.rotation_euler)
    rot[axis] = mid
    leg.rotation_euler = rot
    leg.keyframe_insert("rotation_euler", frame=frame)
    bpy.context.scene.frame_set(frame)
    return mid


def verify_plant(contact_name, frames, plant_frames, tol_units=1e-4,
                 corner_pick=min):
    """Re-measure a solved plant and return its residual, in model units.

    Separate from the solver ON PURPOSE. The solver's own convergence check is
    not evidence -- it can only report that it hit the target it was given, not
    that the target was right. This walks the finished keyframes the way the
    renderer will and includes the wrap from the last cycle frame back to the
    first, which the solver never sees.

    Returns (peak_to_peak, per_frame_residuals). Compare against
    `tools/check-gait-slip.js` run on the EXPORTED file: agreement between a
    pre-export solve and a post-export measurement is the check that matters,
    because only the second one reads what actually ships.
    """
    bpy = _bpy()
    step = travel_per_frame(frames)
    track = []
    for i, frame in enumerate(plant_frames):
        bpy.context.scene.frame_set(1 + frame)
        track.append(contact_x(contact_name, corner_pick) + i * step)
    peak = max(track) - min(track)
    if peak > tol_units:
        raise AssertionError(
            "planted contact %s slides %.6f u (%.3f board px at sizeScale 1) "
            "across frames %s -- target is 0" % (
                contact_name, peak, peak * UNITS_TO_PX, list(plant_frames)))
    return peak, track
