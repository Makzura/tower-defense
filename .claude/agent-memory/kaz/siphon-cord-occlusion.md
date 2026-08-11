---
name: siphon-cord-occlusion
description: Screen-space occlusion for the Siphon's 2D cords — the base-depth comparison error, the proximity gate not to copy, and the limitation the approach cannot fix
metadata:
  type: project
---

The Siphon's cords are painted in `drawOverlays` on the 2D canvas stacked over
the WebGL canvas, which carries no depth information — so they draw over
everything by construction. The chosen fix is **screen-space capsule
occluders**, decided after a three-way comparison. Do not relitigate:

- Moving cords into the GL pass: `gl-renderer.js` is STATIC_DRAW only with no
  BLEND, so it means streaming buffers plus a blend mode, and it would still
  lose the halo and rim that keep the non-emissive states (thread, seeking)
  legible.
- Depth-buffer readback: impossible in WebGL. `readPixels` is measured at
  3.6–7.1 ms per call in `js/gl/tower-preview.js`.

**The depth-compare error — the one that matters.** `js/gl/siphon-ground.js`
(dead code, but the reference implementation everyone copies) stores each
occluder's depth from `project(t.x, t.y, 0)` — the tower's BASE — and compares
every sample against it. `gl-camera.js worldToScreen` sets `out.depth = w`, the
homogeneous divide, so **bigger is farther**; under this camera's downward pitch
a point at higher z is NEARER the eye. The base is therefore the *farthest*
point of the tower's own vertical extent. A cord sample at chest or crown height
behind a tower compares smaller, is judged "in front", and draws straight
through the body.

That is fair for a ground decal, where sample and base are both at z≈0. It is
wrong for a cord. Compare against the occluder's depth **interpolated by the
sample's screen y** between the base and the crown, using both projections.

**And it photographs as success.** A verification that samples near the feet
sits exactly where the base comparison happens to be fair, so every assertion
passes while the visible half of the defect is untouched. Sample HIGH on the
body.

**Two more things not to copy from that module:**
- Its `dx*dx + dy*dy > 4900` (70 px) proximity gate. Scoped to a decal under
  the tower's own feet; on a 180 px cord it exempts nearly every occluder the
  cord crosses, which is the whole defect.
- `top: top ? top.y : b0.y - 40` — a guessed crown that is too short
  under-occludes at the top of the body. Use `crownOf()` (gl-world.js), which
  measures from the model's own `top`.

**The limitation to state up front, in code and in any report:** this cannot
hide a cord behind the Siphon's OWN body at close range. The cord's origin sits
inside his footprint, so the caster must be exempted or every cord loses its
root.

Occlude against enemies too, not only towers — an enemy standing in front of a
cord is the more common case, and the complaint said "everything, other towers
included".

See [[visual-evidence-that-proves-nothing]] for the over-occlusion trap: the
cheapest way to stop a thing showing through is to stop drawing it, so any
occlusion claim needs the negative case (a cord genuinely in front must still
draw in full) and must check the halo and rim layers, not just the core.
