---
name: gl-overlay-occlusion-facts
description: Measured camera/depth facts for masking 2D-overlay effects against GL bodies, and the two mistakes that pass a naive pixel test
metadata:
  type: reference
---

The 2D canvas (`#game`) is stacked over the WebGL canvas (`#gl`) and carries no
depth, so anything `drawOverlays` paints is over the whole board unless it masks
itself. The only depth available is `out.depth = w` from
`OrbitCamera.worldToScreen` (`gl-camera.js:252`).

**Sign convention, measured on the live camera at one footing** (yaw -pi/2,
pitch 0.60): z = 0 -> 175.24, z = 30 -> 158.30, z = 60 -> 141.36. Bigger `w` is
FARTHER, and a HIGHER point is NEARER. A standing body's feet are the farthest
point of its own vertical extent.

**Depth is affine in world position** (`w = vp[3]x + vp[7]y + vp[11]z + vp[15]`),
so depth along a vertical axis is exactly linear in z: `175.24 - 0.5647*z`
reproduced all three numbers. Two projections give the slope; no interpolation
needed. Interpolating by SCREEN Y instead is out by 5% at mid-body.

**Two mistakes that produce a convincing but wrong pass:**

- *Comparing every sample against the occluder's BASE depth* (what
  `siphon-ground.js:818` does — correct there, it masks a ground decal). A
  chest-height sample behind a tower compares against the feet, comes out
  smaller, reads as "in front", and draws through. **A test that samples near
  the feet passes while the visible half of the bug is live.** Sample high on
  the body.
- *Rounded capsule caps.* Clamping the axis parameter to [0,1] before measuring
  distance puts a dome of one full radius above the head. Measured: a Smasher at
  37 px screen radius hid a cord passing 26 px clear of its crown. It
  photographs as success — the cord does vanish behind a tower. Use flat caps:
  reject t outside [0,1], measure to the infinite line.

**Useful helpers:** `gl-world.js crownOf()` measures from the model's own `top`
but adds 10 px of readout headroom; `towerTop`/`enemyTop` (added 2026-08-12)
are the same measurement without it and are on `BLUB_FX_API`.

Do NOT copy `siphon-ground.js`'s `dx*dx + dy*dy > 4900` proximity gate: it is
right for a decal under a tower's feet and exempts nearly every occluder a
180 px cord crosses.

Related: [[visual-proof-that-proved-nothing]], [[siphon-origin-plumbing]].
