import io
src = r"C:/Users/Superuser/Downloads/TD_0.5.1/TD_0.5.0/js/gl/gl-world.js"
dst = r"C:/Users/Superuser/Downloads/TD_0.5.1/visual-pass/tmp/gl-world-hp.js"
lines = io.open(src, encoding="utf-8").read().split("\n")
out, hits = [], {"size":0,"yaw":0,"tz":0,"draw":0,"reset":0}
for ln in lines:
    st = ln.strip()
    if st == "var size = m.unitsToPx * (scale || 1);":
        out += ['    var uni = (typeof scale === "number" || !scale) ? (scale || 1) : 0;',
                '    var size  = m.unitsToPx * (uni || scale.xy || 1);',
                '    var sizeZ = m.unitsToPx * (uni || scale.z  || 1);']
        hits["size"] += 1; continue
    if st.startswith("GLMath.modelYaw(") and ("fixedMat" in st or "instanceMat" in st):
        ind = ln[:len(ln)-len(ln.lstrip())]
        mat = "fixedMat" if "fixedMat" in st else "instanceMat"
        out += [ln, ind + mat + "[10] = sizeZ;"]
        hits["yaw"] += 1; continue
    if st == "var tz = groundHeightAt(t.x, t.y);":
        out += [ln, "        var bscale = 1;"]
        hits["tz"] += 1; continue
    if st == "drawActor(model, t.x + kx, t.y + ky, drawYaw, 1, tz, frame);":
        out += ['        if (t.isSummon && typeof BlubFXHealth !== "undefined") {',
                '          var bp = BlubFXHealth.pose(t, state.now);',
                '          kx += bp.dx; ky += bp.dy; drawYaw += bp.dyaw;',
                '          bscale = bp;',
                '        }',
                '        drawActor(model, t.x + kx, t.y + ky, drawYaw, bscale, tz, frame);']
        hits["draw"] += 1; continue
    if st == 'if (typeof BlubFXCircles !== "undefined") BlubFXCircles.reset();':
        out += [ln, '    if (typeof BlubFXHealth !== "undefined") BlubFXHealth.reset();']
        hits["reset"] += 1; continue
    out.append(ln)
assert hits == {"size":1,"yaw":3,"tz":1,"draw":1,"reset":1}, hits
io.open(dst, "w", encoding="utf-8").write("\n".join(out))
print("OK", hits, "added", len(out)-len(lines), "lines")
