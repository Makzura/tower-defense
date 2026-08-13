// ---------------------------------------------------------------------------
// Group suppression, so a PART can be measured rather than a body.
//
// drawActor skips a group with `if (!grp.count) continue`, so zeroing `count`
// removes exactly that group and nothing else -- each group carries its own
// `first`, so the ranges never shift under one another. Restore puts the real
// counts back.
//
// Two measurements matter and they are different questions:
//   contribution -- pixels the part ADDS to the finished picture (full vs
//                   part-suppressed). This is what a viewer gains from it.
//   alone        -- pixels the part covers with everything else suppressed.
//                   This is the denominator, and it is yaw- and frame-specific.
// visible fraction = contribution / alone.
//
// NOTE, and it is juno's finding rather than mine: this fraction does NOT go to
// zero for a part that is perfectly colour-merged into the body, because the
// silhouette edge and the shading normals still change the picture. So a low
// fraction means occluded-or-merged, and only a synthetic-merge floor separates
// those two. Here it is used to compare the SAME part before and after a
// geometry change, where that ambiguity cancels.
// ---------------------------------------------------------------------------
(function () {
  "use strict";
  var TDProbe = window.TDProbe;

  function modelOf(name) {
    return GLModels.get(World3D.renderer(), name);
  }

  TDProbe.groupNames = function (name) {
    var m = modelOf(name);
    return m ? m.groups.map(function (g) { return g.name; }) : null;
  };

  TDProbe.suppress = function (name, which, invert) {
    var m = modelOf(name);
    if (!m) throw new Error("no model " + name);
    if (!m._savedCounts) {
      m._savedCounts = m.groups.map(function (g) { return g.count; });
    }
    var list = [].concat(which);
    var hit = 0;
    for (var i = 0; i < m.groups.length; i++) {
      var inList = list.indexOf(m.groups[i].name) >= 0;
      var kill = invert ? !inList : inList;
      m.groups[i].count = kill ? 0 : m._savedCounts[i];
      if (kill) hit++;
    }
    return { suppressed: hit, of: m.groups.length };
  };

  TDProbe.restoreGroups = function (name) {
    var m = modelOf(name);
    if (m && m._savedCounts) {
      for (var i = 0; i < m.groups.length; i++) m.groups[i].count = m._savedCounts[i];
    }
    return { restored: true };
  };
})();
