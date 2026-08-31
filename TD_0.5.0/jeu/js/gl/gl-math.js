// ---------------------------------------------------------------------------
// The only maths the 3D renderer needs.
//
// Deliberately about a hundred lines rather than a library. The whole 3D path
// needs perspective, look-at, one multiply and a ray/plane intersection; a
// matrix package would be 60 kB to use four functions, and AGENTS.md's first
// hard constraint is that there is no toolchain to vendor one with.
//
// COLUMN-MAJOR, like WebGL wants it. `m[col * 4 + row]`, so the translation
// lives at m[12], m[13], m[14] and the array can be handed to uniformMatrix4fv
// with `transpose = false` -- which WebGL 1 requires to be false anyway.
//
// WORLD AXES, fixed here once and depended on everywhere else:
//
//     +X   map x, i.e. screen right on an unrotated camera
//     +Y   map y, i.e. "into" the board
//     +Z   up
//
// That is chosen so the simulation does not have to change: the game's
// positions are already (x, y) pixels on a plane, and they become (x, y, 0)
// here with no conversion. It also matches Blender's +Z-up convention, so the
// authored models drop in without a rotation fix-up.
// ---------------------------------------------------------------------------

var GLMath = (function () {
  "use strict";

  function identity(out) {
    out = out || new Float32Array(16);
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  function multiply(out, a, b) {
    // out = a * b. Written out rather than looped: this runs once per object
    // per frame and the unrolled form is both faster and easier to verify.
    var o = out || new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      var b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  }

  function perspective(out, fovYRad, aspect, near, far) {
    var f = 1 / Math.tan(fovYRad / 2);
    var nf = 1 / (near - far);
    out = out || new Float32Array(16);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }

  // Kept because the 2D game's look IS orthographic, and being able to flip
  // back to it is how a "does the 3D still look like the game" comparison gets
  // made honestly rather than from memory.
  function orthographic(out, halfHeight, aspect, near, far) {
    var hw = halfHeight * aspect;
    var nf = 1 / (near - far);
    out = out || new Float32Array(16);
    out[0] = 1 / hw; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1 / halfHeight; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = (far + near) * nf; out[15] = 1;
    return out;
  }

  function lookAt(out, eye, target, up) {
    // Right-handed, looking down -Z in view space.
    var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    var zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;

    var xx = up[1] * zz - up[2] * zy;
    var xy = up[2] * zx - up[0] * zz;
    var xz = up[0] * zy - up[1] * zx;
    var xl = Math.hypot(xx, xy, xz) || 1;
    xx /= xl; xy /= xl; xz /= xl;

    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;

    out = out || new Float32Array(16);
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }

  // A model matrix for a thing standing on the ground: spun about +Z, then
  // moved. That is every tower, every enemy and every prop in this game --
  // nothing tips over, so there is no need for a general TRS.
  function modelYaw(out, x, y, z, yaw, scale) {
    var c = Math.cos(yaw), s = Math.sin(yaw), k = scale === undefined ? 1 : scale;
    out = out || new Float32Array(16);
    out[0] = c * k; out[1] = s * k; out[2] = 0; out[3] = 0;
    out[4] = -s * k; out[5] = c * k; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = k; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
    return out;
  }

  // A LOCAL-SPACE POSE, for driving one group of a rig live.
  //
  // Rotate about a pivot, then translate -- in the group's OWN space, which is
  // the space its baked frames are already in. That ordering is what lets a
  // recoil be written as "swing the rifle 0.3 rad about the shoulder and shove
  // it 0.04 back", which is what a recoil physically is; translate-then-rotate
  // would sweep the muzzle through an arc centred on the model origin instead.
  //
  // Angles are radians about the three axes, applied Z then Y then X, which is
  // the order Blender's default Euler uses -- so a value copied off a rig here
  // means the same thing it meant there.
  function localPose(out, pivot, rx, ry, rz, tx, ty, tz) {
    out = out || new Float32Array(16);
    var cx = Math.cos(rx || 0), sx = Math.sin(rx || 0);
    var cy = Math.cos(ry || 0), sy = Math.sin(ry || 0);
    var cz = Math.cos(rz || 0), sz = Math.sin(rz || 0);
    // R = Rx * Ry * Rz, column-major.
    var m00 = cy * cz, m01 = -cy * sz, m02 = sy;
    var m10 = sx * sy * cz + cx * sz, m11 = -sx * sy * sz + cx * cz, m12 = -sx * cy;
    var m20 = -cx * sy * cz + sx * sz, m21 = cx * sy * sz + sx * cz, m22 = cx * cy;
    var px = pivot ? pivot[0] : 0, py = pivot ? pivot[1] : 0,
        pz = pivot ? pivot[2] : 0;
    out[0] = m00; out[1] = m10; out[2] = m20; out[3] = 0;
    out[4] = m01; out[5] = m11; out[6] = m21; out[7] = 0;
    out[8] = m02; out[9] = m12; out[10] = m22; out[11] = 0;
    // Bring the pivot back to where it started, then apply the offset.
    out[12] = px - (m00 * px + m01 * py + m02 * pz) + (tx || 0);
    out[13] = py - (m10 * px + m11 * py + m12 * pz) + (ty || 0);
    out[14] = pz - (m20 * px + m21 * py + m22 * pz) + (tz || 0);
    out[15] = 1;
    return out;
  }

  // WHERE ON THE GROUND IS THE CURSOR.
  //
  // This is the one piece of maths the camera cannot be good without. A pan
  // that moves the target by "some pixels times some fudge factor" always
  // drifts away from the cursor as the pitch or the zoom changes; a pan that
  // moves it so the ground point GRABBED stays under the pointer is the thing
  // that makes a camera feel attached to the world rather than to the mouse.
  //
  // Built as an explicit ray rather than by inverting the view-projection: the
  // ray is four cross products and no matrix inverse, and it cannot silently
  // degenerate the way an inverse can when the projection is near-singular.
  //
  // Returns null when the ray does not meet the plane -- looking at or above
  // the horizon -- and every caller has to handle that rather than pretend.
  function groundRay(eye, forward, right, camUp, tanHalfFovY, aspect,
                     ndcX, ndcY, planeZ) {
    var dx = forward[0] + right[0] * ndcX * tanHalfFovY * aspect +
      camUp[0] * ndcY * tanHalfFovY;
    var dy = forward[1] + right[1] * ndcX * tanHalfFovY * aspect +
      camUp[1] * ndcY * tanHalfFovY;
    var dz = forward[2] + right[2] * ndcX * tanHalfFovY * aspect +
      camUp[2] * ndcY * tanHalfFovY;

    var z = planeZ || 0;
    // Parallel (or nearly) to the plane: no honest answer exists.
    if (Math.abs(dz) < 1e-6) return null;
    var t = (z - eye[2]) / dz;
    if (t < 0) return null;                      // the plane is behind the eye
    return [eye[0] + dx * t, eye[1] + dy * t, z];
  }

  return {
    identity: identity,
    multiply: multiply,
    perspective: perspective,
    orthographic: orthographic,
    lookAt: lookAt,
    modelYaw: modelYaw,
    localPose: localPose,
    groundRay: groundRay
  };
})();
