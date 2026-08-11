---
name: visual-evidence-that-proves-nothing
description: The specific shapes of visual "proof" that pass while proving nothing in this repo — over-occlusion, silent fallbacks, per-frame checks on a wrong sequence, and stale generated output
metadata:
  type: feedback
---

Reject these five shapes of visual evidence. Each one passes, looks rigorous,
and establishes nothing.

**Why:** the six suites cover simulation, not pictures, so nothing else catches
these. This repo's history has several of them already: animation frames each
individually plausible and wrong in order (`af9501a` — four of ten attack frames
wrong), a beam that was fully specced and mesh-authored and then wired to
nothing at all, and `siphon-beam-spec.js` hand-edited despite a
"GENERATED — do not edit" header.

**How to apply:** run this list against every claim from staff and against my
own, before anything goes up to the orchestrator.

1. **The absence that was never a presence.** A diff of two captures showing "the
   cord is gone here" proves nothing unless the *visible* state is asserted to
   contain the authored colour at that exact pixel. Otherwise both states are
   background and the diff is zero for the wrong reason. Always assert the
   positive case at the same coordinate.
2. **Over-occlusion photographs as success.** The cheapest way to make a thing
   stop showing through is to stop drawing it. Any occlusion claim needs the
   NEGATIVE case too: the same effect genuinely in front of the occluder must
   still be drawn in full. And check the halo/rim layers, not just the core —
   partial span handling leaves a glow bleeding through a body that the
   centreline test never samples.
3. **The silent fallback that makes a no-op look done.** A back-compatible
   fallback (`if (!spec.newTable) use the old constant`) will keep the picture
   plausible when the new data never arrived. Assert the new data is PRESENT
   and that the quantity it drives actually CHANGES — measure the travel, do
   not just confirm the thing is still in the right place.

   The sharpest instance found so far: the Siphon lot keys tiers three
   different ways in three adjacent places — `siphonGroup()` emits lowercase,
   `SiphonBeamSpec.originByTier` is uppercase, and `siphon_origins.json` is
   lowercase with no b tiers at all. A new table keyed to match its *neighbour*
   rather than its *consumer* misses every lookup, falls through to the old
   constant, and renders a beam that starts in a perfectly plausible place.
   Whenever a change adds a keyed table, verify the key convention against the
   code that will read it, and require a lookup miss to be loud.
4. **Per-frame checks on a wrong sequence.** Every frame individually correct
   says nothing about order, continuity, or the wrap from the last frame back to
   the first. Sample the whole cycle, print the frame-to-frame deltas, and
   include the wrap delta explicitly.
5. **Green build, stale artifact.** The generator's gates passing is not
   evidence the game changed. Generated output under `js/gl/models/` is ~1 MB
   per file and easy to leave unregenerated. Confirm the artifact on disk
   actually changed, and confirm the page loads that artifact.

Corollary for coordinated changes: when two call sites must agree on a value,
proving each computes it correctly in isolation does not prove they agree in a
real rendered frame. Instrument both during an actual `draw()`.

See [[rig-traps-visual-pass]] for the harness-level version of the same problem.
