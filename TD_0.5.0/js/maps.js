// ---------------------------------------------------------------------------
// Maps
//
// Authored and seeded routes, and the MEASUREMENT that decides which
// difficulty each one is. The difficulty label on a map is derived from its
// geometry, never typed in by hand -- redraw or regenerate a route and its
// label follows.
//
// What actually makes a map hard, in this game specifically:
//
//   The reference tower's reach (100 u.l.) and the closest it may legally
//   stand to the road (22.1875 u.l.) are both fixed. So "how much road one
//   tower can shoot" is a property of the map alone. On a plain straight
//   road it is 2 * sqrt(range^2 - clearance^2) = 195 u.l., whatever else is
//   going on.
//
//   A route that folds back on itself puts SEVERAL lanes of road inside one
//   tower's circle, and that tower's output multiplies. This is why loops make
//   a map much easier -- it is not a feeling, it is the same tower doing two or
//   three times the work.
//
//   Corners help only on their INSIDE. A 90-degree corner is worth about 240
//   u.l. to a tower tucked into it and 151 to one on the outside -- which average
//   out to almost exactly the straight-road figure. So turn COUNT on its own is
//   nearly neutral; where the turns are, and how close they bring the road to
//   itself, is what moves the number. Hence the measure looks at the good spots
//   (the top decile), not at every spot: players build in the corners.
//
//   Length matters for a different reason and a weaker one. Every enemy walks
//   past every tower whatever the route length, so length does not change how
//   much damage one tower deals. What it changes is WHEN the first leak lands:
//   a normal enemy walks 50 u.l./s, so a 1150 u.l. route starts hurting the
//   base at 23 s and a 2400 u.l. one at 48 s. A short map gives the economy
//   less time to get going before the base starts taking hits.
//
// Both terms are ratios against the reference map, so a map that matches it
// scores 1.0 on that term. Coverage is squared because it scales every tower's
// output for the whole run, where length only shifts when the pressure starts.
// ---------------------------------------------------------------------------

var Maps = {};

// --- the routes -------------------------------------------------------------
//
// Points are in pixels, on the 1280x720 canvas. Routes start and end off-screen
// so enemies walk in and out of view.
//
// One route is flagged `reference`. Under the old meters system it was DEFINED
// to be a fixed length and that fixed the scale for everything. Under u.l.
// (js/units.js) the scale is fixed by UNIT_LENGTH instead, so the reference map
// no longer defines anything -- it is simply the route every other map's LENGTH
// is scored against, which is all `graceRatio` ever used it for.
//
// The reasoning behind one route being the yardstick still applies, so it is
// kept here in its u.l. form: every route is DRAWN in pixels and divided by
// AUTHORED_AT_PX_PER_UL, so all of them share one scale. Do not give a map its
// own declared length or its own authoring scale -- that would mean the road
// drawn a different width on each route, with towers changing size as you
// switch maps.

Maps.LIST = [
  {
    id: "rune-circuit",
    name: "Rune Circuit",
    reference: true,
    blurb: ["The proving lattice. Four square",
            "etchings, one long open trace."],
    decorations: [
      { kind: "rune", x: 125, y: 355, size: 30, color: "91,183,232" },
      { kind: "rune", x: 520, y: 285, size: 24, color: "91,183,232" },
      { kind: "crystal", x: 930, y: 390, size: 24, color: "112,216,244" },
      { kind: "rune", x: 1140, y: 430, size: 34, color: "91,183,232" },
      { kind: "crystal", x: 520, y: 610, size: 18, color: "112,216,244" }
    ],
    points: [
      { x: -60,  y: 160 },
      { x: 300,  y: 160 },
      { x: 300,  y: 460 },
      { x: 760,  y: 460 },
      { x: 760,  y: 220 },
      { x: 1060, y: 220 },
      { x: 1340, y: 220 }
    ]
  },

  {
    id: "mana-coil",
    name: "Mana Coil",
    blurb: ["Four windings folded tight. One",
            "glyphsmith answers three lanes."],
    decorations: [
      { kind: "coil", x: 75, y: 245, size: 22, color: "153,112,255" },
      { kind: "coil", x: 470, y: 245, size: 25, color: "153,112,255" },
      { kind: "coil", x: 790, y: 355, size: 24, color: "176,125,255" },
      { kind: "coil", x: 430, y: 465, size: 22, color: "153,112,255" },
      { kind: "crystal", x: 1215, y: 350, size: 25, color: "194,139,255" },
      { kind: "crystal", x: 70, y: 600, size: 18, color: "194,139,255" }
    ],
    points: [
      { x: -60,  y: 190 },
      { x: 1120, y: 190 },
      { x: 1120, y: 300 },
      { x: 160,  y: 300 },
      { x: 160,  y: 410 },
      { x: 1120, y: 410 },
      { x: 1120, y: 520 },
      { x: 1340, y: 520 }
    ]
  },

  {
    id: "sigil-lattice",
    name: "Sigil Lattice",
    blurb: ["Six wide switchbacks, none of them",
            "close enough to cover each other."],
    decorations: [
      { kind: "sigil", x: 110, y: 390, size: 30, color: "120,208,179" },
      { kind: "obelisk", x: 465, y: 255, size: 25, color: "117,197,170" },
      { kind: "sigil", x: 685, y: 350, size: 34, color: "120,208,179" },
      { kind: "obelisk", x: 1010, y: 360, size: 29, color: "117,197,170" },
      { kind: "sigil", x: 1180, y: 95, size: 23, color: "120,208,179" }
    ],
    // Deliberately kept far enough apart at the closest that
    // Maps.foldsBack() reads false for this route -- unlike Mana Coil, where
    // it reads true -- so the switchbacks give you their corners and nothing
    // more, never one tower covering two lanes.
    // Pull them together and this becomes a second Mana Coil.
    points: [
      { x: -60,  y: 165 },
      { x: 160,  y: 165 },
      { x: 380,  y: 565 },
      { x: 600,  y: 565 },
      { x: 820,  y: 165 },
      { x: 1040, y: 165 },
      { x: 1230, y: 520 },
      { x: 1340, y: 560 }
    ]
  },

  {
    id: "null-meridian",
    name: "Null Meridian",
    blurb: ["One long ley-line. Nothing doubles",
            "back, so nothing helps you."],
    decorations: [
      { kind: "void", x: 125, y: 150, size: 34, color: "105,94,148" },
      { kind: "obelisk", x: 355, y: 300, size: 25, color: "89,82,128" },
      { kind: "void", x: 650, y: 150, size: 40, color: "105,94,148" },
      { kind: "void", x: 940, y: 485, size: 32, color: "105,94,148" },
      { kind: "obelisk", x: 1160, y: 580, size: 30, color: "89,82,128" },
      { kind: "void", x: 1210, y: 330, size: 22, color: "105,94,148" }
    ],
    // Every bend is shallow and every part of the route stays 15 m clear of
    // every other, so no tower ever sees more than one lane. That leaves the
    // good spots at 16.3 m -- barely above the 15.6 m a plain straight gives --
    // and the route is short, so leaks start at 19 s instead of 47.
    points: [
      { x: -60,  y: 580 },
      { x: 220,  y: 565 },
      { x: 520,  y: 480 },
      { x: 760,  y: 350 },
      { x: 900,  y: 220 },
      { x: 1130, y: 160 },
      { x: 1340, y: 150 }
    ]
  }
];

// A map is always consumed as an array of routes. The four authored maps keep
// their historical `points` field and normalize to one route here; generated
// maps write `routes` directly. That keeps old content and tests compatible
// while making the runtime structurally multi-route.
Maps.routesOf = function (map) {
  if (map.routes && map.routes.length) return map.routes;
  return [{ id: "main", points: map.points }];
};

Maps.primaryPoints = function (map) {
  return Maps.routesOf(map)[0].points;
};

// --- deterministic generation ---------------------------------------------
//
// Seeds are strings so they can later come from a daily challenge, a save, or
// a share code without changing the generator API. Gameplay never touches
// Math.random: the same (version, kind, seed) always produces the same map.
Maps.Generator = (function () {
  var VERSION = 1;

  function hashSeed(seed) {
    var h = 2166136261;
    var text = String(seed);
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function random(seed) {
    var state = hashSeed(seed) || 1;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function between(rng, min, max) {
    return min + (max - min) * rng();
  }

  function generatePolyline(seed) {
    var rng = random("polyline:" + VERSION + ":" + seed);
    var points = [{ x: -60, y: Math.round(between(rng, 150, 560)) }];
    var xs = [170, 390, 620, 850, 1080];
    var lastY = points[0].y;

    for (var i = 0; i < xs.length; i++) {
      var y = Math.round(between(rng, 120, 590));
      // A generated route should visibly turn. Deterministically push a
      // near-flat sample away rather than retrying with an unbounded loop.
      if (Math.abs(y - lastY) < 105) {
        y += y < 355 ? 135 : -135;
      }
      y = Math.max(100, Math.min(610, y));
      points.push({ x: xs[i], y: y });
      lastY = y;
    }
    points.push({ x: 1340, y: lastY });
    return [{ id: "main", points: points }];
  }

  function generateDual(seed) {
    var rng = random("dual:" + VERSION + ":" + seed);
    var joinY = Math.round(between(rng, 300, 420));
    var join = { x: 850, y: joinY };
    var common = [
      join,
      { x: 1080, y: Math.round(between(rng, 180, 540)) },
      { x: 1340, y: Math.round(between(rng, 240, 480)) }
    ];

    function route(id, startY, side) {
      return {
        id: id,
        points: [
          { x: -60, y: startY },
          { x: 210, y: Math.round(between(rng,
            side < 0 ? 100 : 430, side < 0 ? 250 : 610)) },
          { x: 500, y: Math.round(between(rng,
            side < 0 ? 150 : 390, side < 0 ? 310 : 570)) },
          { x: join.x, y: join.y },
          { x: common[1].x, y: common[1].y },
          { x: common[2].x, y: common[2].y }
        ]
      };
    }

    return [route("north", 105, -1), route("south", 615, 1)];
  }

  function generate(spec) {
    var routes = spec.kind === "dual"
      ? generateDual(spec.seed)
      : generatePolyline(spec.seed);
    return {
      id: spec.id,
      name: spec.name,
      blurb: spec.blurb,
      decorations: spec.decorations || [],
      generated: true,
      generation: { version: VERSION, kind: spec.kind, seed: String(spec.seed) },
      routes: routes
    };
  }

  return {
    VERSION: VERSION,
    random: random,
    generatePolyline: generatePolyline,
    generateDual: generateDual,
    generate: generate
  };
})();

Maps.LIST.push(Maps.Generator.generate({
  id: "shifting-ley",
  name: "Shifting Ley",
  kind: "polyline",
  seed: "campaign-shifting-ley",
  blurb: ["A seeded ley-line: new machinery,",
          "fixed shape for this map pool."],
  decorations: [
    { kind: "motes", x: 135, y: 115, size: 30, color: "103,204,255" },
    { kind: "crystal", x: 330, y: 590, size: 23, color: "94,222,235" },
    { kind: "motes", x: 540, y: 170, size: 34, color: "103,204,255" },
    { kind: "crystal", x: 760, y: 585, size: 20, color: "94,222,235" },
    { kind: "motes", x: 960, y: 115, size: 28, color: "103,204,255" },
    { kind: "crystal", x: 1180, y: 570, size: 25, color: "94,222,235" }
  ]
}));

Maps.LIST.push(Maps.Generator.generate({
  id: "twin-confluence",
  name: "Twin Confluence",
  kind: "dual",
  seed: "campaign-twin-confluence",
  blurb: ["Two gates mirror every scheduled spawn.",
          "Both roads converge on one shared base."],
  decorations: [
    { kind: "gate", x: 90, y: 105, size: 27, color: "235,185,102" },
    { kind: "gate", x: 90, y: 615, size: 27, color: "235,185,102" },
    { kind: "shrine", x: 850, y: 360, size: 35, color: "245,206,125" },
    { kind: "sigil", x: 600, y: 345, size: 23, color: "235,185,102" },
    { kind: "gate", x: 1160, y: 360, size: 24, color: "235,185,102" }
  ]
}));

// THE ONE BOARD THAT IS NOT A FACILITY.
//
// Authored, not generated, and pushed here rather than written into the LIST
// literal above so the four original routes stay together as the set the
// difficulty measure was calibrated against.
//
// The route walks in from the treeline on the left, switchbacks twice through
// the forest and turns down the last straight INTO the camp -- so the barricades
// on the right are the last thing between the road and the base, which is what
// they are for. Nothing about the scenery is read by the measurement: the camp
// is a picture, and the route would score the same drawn across bare floor.
Maps.LIST.push({
  id: "test",
  name: "Test",
  blurb: ["Black dirt and dead stems. The fog",
          "stops at the camp's barricades."],
  decorations: [
    { kind: "bones", x: 250, y: 545, size: 22, color: "173,166,149" },
    { kind: "husk", x: 620, y: 148, size: 26, color: "86,82,66" },
    { kind: "bones", x: 878, y: 302, size: 18, color: "173,166,149" },
    { kind: "husk", x: 150, y: 430, size: 30, color: "86,82,66" },
    { kind: "bones", x: 1122, y: 662, size: 20, color: "173,166,149" },
    { kind: "husk", x: 1012, y: 132, size: 24, color: "86,82,66" }
  ],
  points: [
    { x: -60,  y: 175 },
    { x: 300,  y: 175 },
    { x: 300,  y: 470 },
    { x: 690,  y: 470 },
    { x: 690,  y: 235 },
    { x: 960,  y: 235 },
    { x: 960,  y: 545 },
    { x: 1340, y: 545 }
  ]
});

// --- sci-fi environments --------------------------------------------------
//
// Routes decide gameplay; environments decide presentation. Keeping the two
// data sets beside each other but separate is deliberate: a reactor can look
// enormous without becoming an invisible placement blocker, and recolouring a
// deck can never move a tower spot or alter a route score.
//
// Colours are authored per map instead of filtered at draw time. That makes
// the six battlefields read as different facilities in the same sci-fi world:
// cyan command deck, violet capacitor foundry, green research array, red null
// containment, blue phase laboratory and amber transit nexus.
Maps.ENVIRONMENTS = {
  "rune-circuit": {
    theme: {
      background: "#071722", floor: "#0c2633", panel: "#123848",
      panelDark: "#081d29", panelLine: "56,126,151", accent: "74,218,255",
      accent2: "111,154,255", metal: "#263f4c", metalDark: "#132733",
      roadOuter: "#0a1922", roadInner: "#274553",
      roadEdge: "74,218,255", roadCenter: "117,226,255"
    },
    zones: [
      { kind: "deck", x: 22, y: 28, w: 244, h: 105 },
      { kind: "deck", x: 365, y: 238, w: 287, h: 152 },
      { kind: "bay", x: 825, y: 286, w: 407, h: 172 },
      { kind: "hazard", x: 33, y: 526, w: 325, h: 142 }
    ],
    models: [
      { kind: "antenna", x: 104, y: 82, size: 42, rotation: -0.25 },
      { kind: "server", x: 215, y: 82, size: 39, rotation: 0 },
      { kind: "reactor", x: 490, y: 315, size: 59, rotation: 0.18 },
      { kind: "console", x: 620, y: 325, size: 43, rotation: -0.18 },
      { kind: "pylon", x: 884, y: 360, size: 50, rotation: 0.1 },
      { kind: "tank", x: 1035, y: 365, size: 51, rotation: 0.05 },
      { kind: "vent", x: 1175, y: 370, size: 43, rotation: 0 },
      { kind: "holo", x: 155, y: 600, size: 47, rotation: -0.1 },
      { kind: "battery", x: 285, y: 590, size: 43, rotation: 0.06 }
    ]
  },
  "mana-coil": {
    theme: {
      background: "#160c28", floor: "#26113b", panel: "#38184d",
      panelDark: "#130a22", panelLine: "105,58,139", accent: "210,91,255",
      accent2: "126,102,255", metal: "#493055", metalDark: "#25142f",
      roadOuter: "#170d25", roadInner: "#50305d",
      roadEdge: "217,89,255", roadCenter: "244,152,255"
    },
    zones: [
      { kind: "bay", x: 20, y: 28, w: 360, h: 118 },
      { kind: "hazard", x: 425, y: 38, w: 405, h: 112 },
      { kind: "deck", x: 270, y: 535, w: 420, h: 142 },
      { kind: "bay", x: 845, y: 545, w: 390, h: 132 }
    ],
    models: [
      { kind: "coil", x: 96, y: 78, size: 56, rotation: 0 },
      { kind: "battery", x: 236, y: 82, size: 44, rotation: -0.08 },
      { kind: "coil", x: 510, y: 91, size: 52, rotation: 0.16 },
      { kind: "reactor", x: 730, y: 88, size: 50, rotation: 0 },
      { kind: "pylon", x: 340, y: 610, size: 49, rotation: 0.08 },
      { kind: "coil", x: 510, y: 610, size: 55, rotation: -0.18 },
      { kind: "console", x: 630, y: 610, size: 40, rotation: 0.13 },
      { kind: "tank", x: 920, y: 608, size: 50, rotation: 0 },
      { kind: "server", x: 1085, y: 608, size: 43, rotation: -0.06 }
    ]
  },
  "sigil-lattice": {
    theme: {
      background: "#071d1b", floor: "#0d302c", panel: "#17443c",
      panelDark: "#071f1c", panelLine: "51,126,108", accent: "77,233,179",
      accent2: "113,203,255", metal: "#284a43", metalDark: "#102c28",
      roadOuter: "#081e1c", roadInner: "#31594f",
      roadEdge: "82,227,177", roadCenter: "151,255,218"
    },
    zones: [
      { kind: "deck", x: 26, y: 282, w: 260, h: 352 },
      { kind: "bay", x: 397, y: 28, w: 320, h: 176 },
      { kind: "hazard", x: 715, y: 466, w: 270, h: 202 },
      { kind: "deck", x: 1050, y: 34, w: 185, h: 395 }
    ],
    models: [
      { kind: "antenna", x: 105, y: 355, size: 51, rotation: -0.35 },
      { kind: "holo", x: 225, y: 475, size: 48, rotation: 0.12 },
      { kind: "server", x: 120, y: 575, size: 41, rotation: 0.05 },
      { kind: "reactor", x: 480, y: 105, size: 54, rotation: 0 },
      { kind: "console", x: 635, y: 105, size: 42, rotation: -0.18 },
      { kind: "vent", x: 775, y: 570, size: 48, rotation: 0 },
      { kind: "antenna", x: 925, y: 565, size: 46, rotation: 0.3 },
      { kind: "pylon", x: 1125, y: 95, size: 48, rotation: 0.1 },
      { kind: "tank", x: 1160, y: 340, size: 51, rotation: -0.08 }
    ]
  },
  "null-meridian": {
    theme: {
      background: "#13090e", floor: "#241018", panel: "#34151e",
      panelDark: "#0e080c", panelLine: "113,48,64", accent: "255,70,104",
      accent2: "166,87,255", metal: "#47303a", metalDark: "#21131a",
      roadOuter: "#10090d", roadInner: "#54303c",
      roadEdge: "255,71,105", roadCenter: "205,122,255"
    },
    zones: [
      { kind: "hazard", x: 22, y: 35, w: 342, h: 240 },
      { kind: "bay", x: 414, y: 44, w: 342, h: 216 },
      { kind: "hazard", x: 795, y: 414, w: 440, h: 265 },
      { kind: "deck", x: 1048, y: 35, w: 190, h: 200 }
    ],
    models: [
      { kind: "reactor", x: 120, y: 138, size: 62, rotation: 0 },
      { kind: "pylon", x: 285, y: 135, size: 51, rotation: 0.15 },
      { kind: "server", x: 485, y: 120, size: 43, rotation: -0.05 },
      { kind: "holo", x: 660, y: 145, size: 52, rotation: 0.2 },
      { kind: "vent", x: 875, y: 535, size: 52, rotation: 0 },
      { kind: "battery", x: 1018, y: 570, size: 47, rotation: -0.09 },
      { kind: "reactor", x: 1160, y: 575, size: 57, rotation: 0.2 },
      { kind: "antenna", x: 1110, y: 118, size: 44, rotation: -0.32 },
      { kind: "console", x: 1200, y: 185, size: 37, rotation: 0.12 }
    ]
  },
  "shifting-ley": {
    theme: {
      background: "#071827", floor: "#0b2c43", panel: "#123e59",
      panelDark: "#071d2d", panelLine: "42,111,153", accent: "58,204,255",
      accent2: "77,255,222", metal: "#244b60", metalDark: "#102b3b",
      roadOuter: "#071b29", roadInner: "#285970",
      roadEdge: "57,206,255", roadCenter: "105,255,229"
    },
    zones: [
      { kind: "deck", x: 20, y: 25, w: 290, h: 162 },
      { kind: "bay", x: 355, y: 480, w: 295, h: 196 },
      { kind: "hazard", x: 720, y: 28, w: 270, h: 175 },
      { kind: "deck", x: 1015, y: 458, w: 220, h: 216 }
    ],
    models: [
      { kind: "holo", x: 105, y: 95, size: 53, rotation: -0.12 },
      { kind: "antenna", x: 250, y: 105, size: 44, rotation: 0.25 },
      { kind: "tank", x: 430, y: 575, size: 52, rotation: 0.08 },
      { kind: "reactor", x: 575, y: 582, size: 58, rotation: 0 },
      { kind: "coil", x: 790, y: 105, size: 51, rotation: -0.2 },
      { kind: "pylon", x: 925, y: 115, size: 47, rotation: 0.1 },
      { kind: "server", x: 1080, y: 550, size: 43, rotation: -0.08 },
      { kind: "console", x: 1180, y: 590, size: 39, rotation: 0.15 },
      { kind: "vent", x: 930, y: 640, size: 39, rotation: 0 }
    ]
  },
  "twin-confluence": {
    theme: {
      background: "#211306", floor: "#38230c", panel: "#503416",
      panelDark: "#1c1107", panelLine: "139,94,38", accent: "255,181,64",
      accent2: "255,224,125", metal: "#5a4930", metalDark: "#2c210f",
      roadOuter: "#201507", roadInner: "#655033",
      roadEdge: "255,179,58", roadCenter: "255,230,140"
    },
    zones: [
      { kind: "bay", x: 20, y: 25, w: 280, h: 214 },
      { kind: "bay", x: 20, y: 481, w: 280, h: 214 },
      { kind: "deck", x: 500, y: 245, w: 390, h: 235 },
      { kind: "hazard", x: 965, y: 70, w: 270, h: 580 }
    ],
    models: [
      { kind: "gate", x: 92, y: 96, size: 57, rotation: 0 },
      { kind: "gate", x: 92, y: 624, size: 57, rotation: Math.PI },
      { kind: "battery", x: 230, y: 150, size: 43, rotation: 0.08 },
      { kind: "battery", x: 230, y: 570, size: 43, rotation: -0.08 },
      { kind: "reactor", x: 700, y: 360, size: 69, rotation: 0 },
      { kind: "console", x: 830, y: 360, size: 42, rotation: 0 },
      { kind: "pylon", x: 1035, y: 170, size: 51, rotation: 0.12 },
      { kind: "pylon", x: 1035, y: 550, size: 51, rotation: -0.12 },
      { kind: "gate", x: 1180, y: 360, size: 54, rotation: Math.PI / 2 }
    ]
  },

  // THE FOREST. Everything above this line is a facility; this is what is left
  // of one. The palette is the whole argument: the biggest surface on the board
  // is black dirt, the timber is grey because it was never treated, the bark is
  // darker than the dirt, and the ONE saturated colour in the theme is an ember
  // -- the fire in the camp's barrels and the lamp on its watchtower. There is
  // no ley line here, so there is nothing else for a colour to be.
  //
  // `wild` turns off the two things that say "manufactured floor": the ruled
  // panel grid under everything and the circuit trunks strung between props.
  // Both are correct on a deck and absurd across a forest.
  //
  // `fog` is read by the 3D board (js/gl/gl-world.js) and washed over the 2D
  // one. Its height is the reason the fog reads as WEATHER rather than as a
  // dimmer: at 52 the mist buries a barricade and lets the tops of the stems
  // stand out of it, which is the whole picture the board is after.
  "test": {
    theme: {
      background: "#0a0b09", floor: "#1a1913", panel: "#2f2a1c",
      // A HAIR DARKER THAN THE FLOOR, DELIBERATELY. `panelDark` is what the
      // bare-earth patches are painted in, and at the first value it was six
      // stops under the floor -- which on a board with no seams and no grid
      // did not read as ground at all, it read as three rectangular PITS cut
      // into the forest. Ground variation is the effect; a hole is not.
      panelDark: "#171610", panelLine: "64,60,46", accent: "255,138,52",
      accent2: "198,206,180", metal: "#4a4336", metalDark: "#1c1812",
      roadOuter: "#100f0b", roadInner: "#332c1f",
      roadEdge: "104,94,68", roadCenter: "142,130,96",
      wild: true,
      // MEASURED OFF THE FRAMEBUFFER, not guessed. The first pass ran at
      // 0.00048 and the board came back at (41,43,37) against a (43,46,39)
      // mist -- eighty-eight per cent fogged, which is not weather, it is a
      // white sheet with a road printed on it. The view depth across this
      // board is about 3 000 units, so the density here puts the near edge
      // near a fifth fogged and the far edge near a third: a gradient you can
      // see, over dirt that stays black.
      fog: { color: "#2b2e27", density: 0.00019, height: 52 }
    },
    // Three of these are PATCHES, not platforms -- bare earth and standing
    // water scraped through the leaf litter, at the floor's own height, so
    // they can never turn into a no-build ring. See ZONE_HEIGHT in
    // js/gl/gl-world.js for why that distinction had to be built.
    // The other two are the camp: an earth bank thrown up short of the road
    // and a plank floor inside the wire.
    zones: [
      { kind: "dirt", x: 330, y: 205, w: 300, h: 200 },
      { kind: "dirt", x: 60, y: 250, w: 200, h: 230 },
      { kind: "dirt", x: 700, y: 270, w: 230, h: 240 },
      { kind: "bay", x: 1000, y: 610, w: 250, h: 80 },
      { kind: "deck", x: 1100, y: 428, w: 150, h: 62 }
    ],
    // THE TREELINE IS THE FRAME AND THE CAMP IS THE SUBJECT. Full-height stems
    // are banked along the top, the left edge and the bottom, where they can
    // never stand between the camera and a tower; everything inside the route's
    // pockets is knee-high -- stumps, fallen logs, dead bramble -- because
    // those pockets are where the player builds and a tree in one would hide
    // the thing it was hiding behind.
    models: [
      // THE TREELINE, and half of it stands OUTSIDE the 1280x720 play area.
      // The 3D board is built 120 units proud of the view on every side (see
      // buildMapMesh), so there is real ground out there for a wall of stems
      // to stand on -- and a prop out there can never hide a tower, an enemy
      // or a build spot, because none of those can be there. It is the one
      // place a forest can actually be DENSE.
      { kind: "tree", x: -70, y: -40, size: 50, rotation: 1.1 },
      { kind: "tree", x: -60, y: 150, size: 44, rotation: 3.4 },
      { kind: "tree", x: -75, y: 330, size: 48, rotation: 0.2 },
      { kind: "tree", x: -55, y: 520, size: 42, rotation: 2.6 },
      { kind: "tree", x: -70, y: 700, size: 46, rotation: 4.7 },
      { kind: "tree", x: 120, y: -60, size: 43, rotation: 2.1 },
      { kind: "tree", x: 320, y: -55, size: 47, rotation: 0.8 },
      { kind: "tree", x: 520, y: -70, size: 41, rotation: 3.7 },
      { kind: "tree", x: 720, y: -50, size: 45, rotation: 1.4 },
      { kind: "tree", x: 920, y: -65, size: 49, rotation: 5.1 },
      { kind: "tree", x: 1120, y: -55, size: 42, rotation: 2.3 },
      { kind: "tree", x: 1330, y: -40, size: 46, rotation: 0.5 },
      { kind: "tree", x: 1345, y: 140, size: 44, rotation: 3.1 },
      { kind: "tree", x: 1350, y: 690, size: 45, rotation: 1.8 },
      { kind: "tree", x: 210, y: 760, size: 44, rotation: 4.2 },
      { kind: "tree", x: 430, y: 775, size: 48, rotation: 0.9 },
      { kind: "tree", x: 650, y: 765, size: 42, rotation: 2.5 },
      { kind: "tree", x: 880, y: 780, size: 46, rotation: 5.3 },
      { kind: "tree", x: 1120, y: 770, size: 43, rotation: 1.0 },

      { kind: "tree", x: 55, y: 70, size: 46, rotation: 0.3 },
      { kind: "tree", x: 140, y: 45, size: 38, rotation: 1.9 },
      { kind: "tree", x: 215, y: 100, size: 42, rotation: 3.2 },
      { kind: "tree", x: 380, y: 60, size: 48, rotation: 0.7 },
      { kind: "tree", x: 455, y: 110, size: 36, rotation: 2.4 },
      { kind: "tree", x: 545, y: 55, size: 44, rotation: 4.1 },
      { kind: "tree", x: 640, y: 105, size: 40, rotation: 1.2 },
      { kind: "tree", x: 735, y: 60, size: 46, rotation: 5.0 },
      { kind: "tree", x: 830, y: 110, size: 38, rotation: 2.8 },
      { kind: "tree", x: 925, y: 55, size: 43, rotation: 0.4 },
      { kind: "tree", x: 1030, y: 105, size: 45, rotation: 3.6 },
      { kind: "tree", x: 1130, y: 50, size: 39, rotation: 1.5 },
      { kind: "tree", x: 1235, y: 100, size: 47, rotation: 4.8 },
      { kind: "tree", x: 45, y: 262, size: 40, rotation: 2.2 },
      { kind: "tree", x: 62, y: 382, size: 44, rotation: 0.9 },
      { kind: "tree", x: 40, y: 502, size: 37, rotation: 3.9 },
      { kind: "tree", x: 110, y: 612, size: 46, rotation: 1.6 },
      { kind: "tree", x: 205, y: 560, size: 41, rotation: 5.2 },
      { kind: "tree", x: 300, y: 662, size: 43, rotation: 0.6 },
      { kind: "tree", x: 420, y: 620, size: 38, rotation: 2.7 },
      { kind: "tree", x: 530, y: 670, size: 45, rotation: 4.3 },
      { kind: "tree", x: 650, y: 615, size: 40, rotation: 1.1 },
      { kind: "tree", x: 762, y: 665, size: 42, rotation: 3.3 },
      { kind: "tree", x: 872, y: 620, size: 39, rotation: 5.5 },
      { kind: "snag", x: 410, y: 300, size: 34, rotation: 0.5 },
      { kind: "snag", x: 600, y: 380, size: 30, rotation: 2.0 },
      { kind: "snag", x: 175, y: 168, size: 32, rotation: 4.4 },
      { kind: "stump", x: 500, y: 250, size: 26, rotation: 1.0 },
      { kind: "stump", x: 820, y: 420, size: 24, rotation: 3.0 },
      { kind: "stump", x: 620, y: 520, size: 25, rotation: 0.2 },
      { kind: "log", x: 350, y: 560, size: 34, rotation: 0.4 },
      { kind: "log", x: 890, y: 640, size: 32, rotation: 2.2 },
      { kind: "log", x: 128, y: 470, size: 30, rotation: 1.4 },
      { kind: "brush", x: 480, y: 420, size: 26, rotation: 1.3 },
      { kind: "brush", x: 758, y: 322, size: 24, rotation: 0.8 },
      { kind: "brush", x: 170, y: 300, size: 28, rotation: 2.9 },
      { kind: "brush", x: 1000, y: 662, size: 26, rotation: 1.7 },

      // The camp. It is built along the INSIDE of the last two legs of the
      // road, so every wall faces something that is coming.
      { kind: "barricade", x: 1010, y: 340, size: 44, rotation: Math.PI / 2 },
      { kind: "barricade", x: 1010, y: 452, size: 44, rotation: Math.PI / 2 },
      { kind: "barricade", x: 1150, y: 602, size: 42, rotation: 0 },
      { kind: "spikes", x: 1002, y: 252, size: 38, rotation: Math.PI / 2 },
      { kind: "spikes", x: 1292, y: 600, size: 36, rotation: 0 },
      { kind: "sandbags", x: 1082, y: 505, size: 40, rotation: 0 },
      { kind: "sandbags", x: 1232, y: 505, size: 40, rotation: 0 },
      { kind: "fence", x: 1120, y: 250, size: 44, rotation: 0 },
      { kind: "fence", x: 1252, y: 250, size: 44, rotation: 0 },
      { kind: "wreck", x: 1180, y: 302, size: 46, rotation: 0.5 },
      { kind: "watchtower", x: 1150, y: 392, size: 52, rotation: 0.3 },
      { kind: "barrel", x: 1075, y: 445, size: 30, rotation: 0 },
      { kind: "barrel", x: 1265, y: 378, size: 28, rotation: 0 }
    ]
  }
};

for (var environmentIndex = 0; environmentIndex < Maps.LIST.length;
    environmentIndex++) {
  var environmentMap = Maps.LIST[environmentIndex];
  var environment = Maps.ENVIRONMENTS[environmentMap.id];
  if (!environment) {
    throw new Error("Maps: missing environment for '" + environmentMap.id + "'");
  }
  environmentMap.theme = environment.theme;
  environmentMap.zones = environment.zones;
  environmentMap.models = environment.models;
}

Maps.DEFAULT_ID = "rune-circuit";

// Throws on an unknown id rather than falling back to the default: the only way
// to get one is a typo in code, and silently handing back another map would
// show up later as an unexplainable balance drift instead of a stack trace.
// Same reasoning as Enemy.typeOf.
Maps.byId = function (id) {
  for (var i = 0; i < Maps.LIST.length; i++) {
    if (Maps.LIST[i].id === id) return Maps.LIST[i];
  }
  throw new Error("Maps: no such map '" + id + "'");
};

// The route every other map's LENGTH is scored against. Exactly one is flagged.
// It no longer defines the scale -- UNIT_LENGTH does that now (js/units.js) --
// but something still has to be the yardstick for `graceRatio`.
Maps.reference = function () {
  for (var i = 0; i < Maps.LIST.length; i++) {
    if (Maps.LIST[i].reference) return Maps.LIST[i];
  }
  throw new Error("Maps: no map is flagged as the reference");
};


// The route every other map's length is compared against, in u.l. Derived from
// its own drawing like everything else -- nothing declares a length.
//
// Cached: it is asked for once per map analysed and never changes within a run.
Maps._referenceLengthUl = null;

Maps.referenceLengthUl = function () {
  if (Maps._referenceLengthUl !== null) return Maps._referenceLengthUl;

  // Maps.reference() already picks it, so there is one definition of which
  // route is the yardstick rather than two that could disagree.
  var reference = Maps.reference() || Maps.LIST[0];

  Maps._referenceLengthUl =
    new GamePath(Maps.toWorld(Maps.primaryPoints(reference))).length / UNIT_LENGTH;
  return Maps._referenceLengthUl;
};

// A map's polyline is authored in the PIXELS it was drawn at, like the original
// single route was. This turns it into world coordinates the same way game.js
// does: divide by the scale it was drawn at, then back through ul(). Identity
// while the two match, and correct if UNIT_LENGTH is ever retuned away from it.
Maps.toWorld = function (points) {
  return points.map(function (p) {
    return {
      x: ul(p.x / AUTHORED_AT_PX_PER_UL),
      y: ul(p.y / AUTHORED_AT_PX_PER_UL)
    };
  });
};

// --- sci-fi environment rendering -----------------------------------------
//
// All scenery is deliberately part of map CONTENT but not map GAMEPLAY. It
// draws under the road and never enters build clearance, route analysis or
// targeting. Authored pixel coordinates use the same conversion as the roads,
// so retuning UNIT_LENGTH keeps every deck and machine attached to its map.

function decorationRgba(decoration, alpha) {
  return "rgba(" + decoration.color + "," + alpha.toFixed(3) + ")";
}

function drawDecoration(ctx, decoration) {
  var size = decoration.size;
  var i;

  ctx.save();
  ctx.translate(decoration.x, decoration.y);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (decoration.kind === "rune") {
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = decorationRgba(decoration, 0.42);
    ctx.stroke();
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-size * 0.48, -size * 0.48, size * 0.96, size * 0.96);
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, 0);
    ctx.lineTo(size * 0.6, 0);
    ctx.moveTo(0, -size * 0.6);
    ctx.lineTo(0, size * 0.6);
    ctx.stroke();
  } else if (decoration.kind === "coil") {
    for (i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, size * (0.35 + i * 0.3),
        -Math.PI * 0.78 + i * 0.45, Math.PI * 0.78 + i * 0.45);
      ctx.lineWidth = 2.8 - i * 0.55;
      ctx.strokeStyle = decorationRgba(decoration, 0.38 - i * 0.06);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = decorationRgba(decoration, 0.58);
    ctx.fill();
  } else if (decoration.kind === "sigil") {
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.strokeStyle = decorationRgba(decoration, 0.34);
    ctx.lineWidth = 1.7;
    ctx.stroke();
    ctx.beginPath();
    for (i = 0; i < 8; i++) {
      var angle = -Math.PI / 2 + i * Math.PI / 4;
      var radius = (i % 2 === 0) ? size * 0.78 : size * 0.34;
      var x = Math.cos(angle) * radius;
      var y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = decorationRgba(decoration, 0.48);
    ctx.stroke();
  } else if (decoration.kind === "crystal") {
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.52, size * 0.2);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.52, size * 0.2);
    ctx.closePath();
    ctx.fillStyle = decorationRgba(decoration, 0.16);
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = decorationRgba(decoration, 0.58);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.moveTo(-size * 0.52, size * 0.2);
    ctx.lineTo(size * 0.52, size * 0.2);
    ctx.strokeStyle = decorationRgba(decoration, 0.28);
    ctx.stroke();
  } else if (decoration.kind === "obelisk") {
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.42, -size * 0.55);
    ctx.lineTo(size * 0.32, size * 0.75);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.32, size * 0.75);
    ctx.lineTo(-size * 0.42, -size * 0.55);
    ctx.closePath();
    ctx.fillStyle = "rgba(18,21,29,0.34)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = decorationRgba(decoration, 0.52);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.strokeStyle = decorationRgba(decoration, 0.22);
    ctx.stroke();
  } else if (decoration.kind === "void") {
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(6,7,12,0.48)";
    ctx.beginPath();
    ctx.moveTo(-size, -size * 0.25);
    ctx.lineTo(-size * 0.35, -size * 0.08);
    ctx.lineTo(0, -size * 0.48);
    ctx.lineTo(size * 0.28, size * 0.12);
    ctx.lineTo(size, size * 0.35);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = decorationRgba(decoration, 0.48);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.48);
    ctx.lineTo(-size * 0.18, -size);
    ctx.moveTo(size * 0.28, size * 0.12);
    ctx.lineTo(size * 0.1, size * 0.88);
    ctx.stroke();
  } else if (decoration.kind === "motes") {
    for (i = 0; i < 7; i++) {
      var moteAngle = i * Math.PI * 2 / 7 + size * 0.013;
      var moteRadius = size * (0.35 + (i % 3) * 0.22);
      ctx.beginPath();
      ctx.arc(Math.cos(moteAngle) * moteRadius,
        Math.sin(moteAngle) * moteRadius,
        1.8 + (i % 2), 0, Math.PI * 2);
      ctx.fillStyle = decorationRgba(decoration, 0.34 + (i % 3) * 0.1);
      ctx.fill();
    }
  } else if (decoration.kind === "gate") {
    ctx.fillStyle = "rgba(24,25,31,0.38)";
    ctx.fillRect(-size, -size * 0.58, size * 0.28, size * 1.16);
    ctx.fillRect(size * 0.72, -size * 0.58, size * 0.28, size * 1.16);
    ctx.strokeStyle = decorationRgba(decoration, 0.58);
    ctx.lineWidth = 2.2;
    ctx.strokeRect(-size, -size * 0.58, size * 0.28, size * 1.16);
    ctx.strokeRect(size * 0.72, -size * 0.58, size * 0.28, size * 1.16);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.82, Math.PI, Math.PI * 2);
    ctx.stroke();
  } else if (decoration.kind === "shrine") {
    ctx.rotate(Math.PI / 4);
    for (i = 0; i < 3; i++) {
      var inset = size * i * 0.22;
      ctx.strokeStyle = decorationRgba(decoration, 0.48 - i * 0.1);
      ctx.lineWidth = 2 - i * 0.35;
      ctx.strokeRect(-size + inset, -size + inset,
        (size - inset) * 2, (size - inset) * 2);
    }
    ctx.fillStyle = decorationRgba(decoration, 0.32);
    ctx.fillRect(-3, -3, 6, 6);
  } else if (decoration.kind === "bones") {
    // A rib cage in the dirt, seen from above. The forest board's decals are
    // the only place anything on it is legibly a REMAINS rather than a ruin,
    // and they are deliberately small: found, not staged.
    ctx.strokeStyle = decorationRgba(decoration, 0.5);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, 0);
    ctx.lineTo(size * 0.55, 0);
    ctx.stroke();
    for (i = 0; i < 5; i++) {
      var rib = -size * 0.36 + i * size * 0.2;
      var span = size * (0.30 - Math.abs(i - 2) * 0.05);
      ctx.beginPath();
      ctx.moveTo(rib, -span);
      ctx.lineTo(rib, span);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(size * 0.68, 0, size * 0.16, 0, Math.PI * 2);
    ctx.strokeStyle = decorationRgba(decoration, 0.62);
    ctx.stroke();
  } else if (decoration.kind === "husk") {
    // A dead shrub: spokes with nothing on them.
    ctx.strokeStyle = decorationRgba(decoration, 0.55);
    for (i = 0; i < 9; i++) {
      var spoke = i * Math.PI * 2 / 9 + size * 0.01;
      var reach = size * (0.5 + (i % 3) * 0.2);
      ctx.lineWidth = 1.7 - (i % 3) * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(spoke) * reach, Math.sin(spoke) * reach * 0.86);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function themeRgba(theme, key, alpha) {
  return "rgba(" + theme[key] + "," + alpha.toFixed(3) + ")";
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (var i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
}

function hexagon(ctx, radius, squash) {
  var points = [];
  for (var i = 0; i < 6; i++) {
    var angle = Math.PI / 6 + i * Math.PI / 3;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius * squash]);
  }
  polygon(ctx, points);
}

function drawZone(ctx, zone, theme) {
  ctx.save();
  ctx.translate(zone.x, zone.y);

  // A PATCH OF GROUND IS NOT A DECK. `dirt` is bare earth scraped through the
  // litter -- no drop shadow, no bevel, no inset rail and no seams, because
  // every one of those says "this was manufactured and set down here". The 3D
  // board makes the same distinction and for a harder reason: a patch stamps
  // no height, so it can never turn into a no-build ring (js/gl/gl-world.js,
  // ZONE_HEIGHT).
  if (zone.kind === "dirt") {
    ctx.fillStyle = theme.panelDark;
    ctx.fillRect(0, 0, zone.w, zone.h);
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.22);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, zone.w - 1, zone.h - 1);
    ctx.restore();
    return;
  }

  ctx.fillStyle = "rgba(2,7,10,0.46)";
  ctx.fillRect(7, 9, zone.w, zone.h);
  ctx.fillStyle = zone.kind === "hazard"
    ? themeRgba(theme, "accent", 0.075)
    : (zone.kind === "bay" ? theme.panelDark : theme.panel);
  ctx.fillRect(0, 0, zone.w, zone.h);
  ctx.strokeStyle = themeRgba(theme, "panelLine", 0.72);
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, zone.w, zone.h);

  // Bevel and inset rails turn a coloured rectangle into a manufactured deck.
  ctx.strokeStyle = themeRgba(theme, "accent", 0.18);
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, zone.w - 16, zone.h - 16);
  ctx.beginPath();
  ctx.moveTo(0, 18); ctx.lineTo(18, 0);
  ctx.moveTo(zone.w - 18, 0); ctx.lineTo(zone.w, 18);
  ctx.moveTo(zone.w, zone.h - 18); ctx.lineTo(zone.w - 18, zone.h);
  ctx.moveTo(18, zone.h); ctx.lineTo(0, zone.h - 18);
  ctx.stroke();

  if (zone.kind === "hazard") {
    ctx.save();
    ctx.beginPath();
    ctx.rect(9, 9, zone.w - 18, zone.h - 18);
    ctx.clip();
    ctx.strokeStyle = themeRgba(theme, "accent", 0.15);
    ctx.lineWidth = 7;
    for (var x = -zone.h; x < zone.w + zone.h; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, zone.h);
      ctx.lineTo(x + zone.h, 0);
      ctx.stroke();
    }
    ctx.restore();
  } else {
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.33);
    for (var seam = 72; seam < zone.w; seam += 72) {
      ctx.beginPath();
      ctx.moveTo(seam, 9);
      ctx.lineTo(seam, zone.h - 9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMachineShadow(ctx, size) {
  ctx.beginPath();
  ctx.ellipse(size * 0.1, size * 0.26, size * 0.82, size * 0.45,
    0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.fill();
}

function drawModel(ctx, model, theme) {
  var size = model.size;
  var i;

  ctx.save();
  ctx.translate(model.x, model.y);
  ctx.rotate(model.rotation || 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  drawMachineShadow(ctx, size);

  if (model.kind === "reactor") {
    for (i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 4);
      ctx.fillStyle = theme.metalDark;
      ctx.fillRect(size * 0.44, -size * 0.12, size * 0.45, size * 0.24);
      ctx.strokeStyle = themeRgba(theme, "accent", 0.55);
      ctx.strokeRect(size * 0.44, -size * 0.12, size * 0.45, size * 0.24);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.64, 0, Math.PI * 2);
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.lineWidth = size * 0.15;
    ctx.strokeStyle = theme.metalDark;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent", 0.23);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = themeRgba(theme, "accent", 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-size * 0.08, -size * 0.09, size * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent2", 0.92);
    ctx.fill();
  } else if (model.kind === "pylon") {
    hexagon(ctx, size * 0.72, 0.72);
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.stroke();
    hexagon(ctx, size * 0.48, 0.62);
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.strokeStyle = themeRgba(theme, "accent", 0.75);
    ctx.stroke();
    ctx.fillStyle = theme.metalDark;
    ctx.fillRect(-size * 0.13, -size * 0.48, size * 0.26, size * 0.72);
    ctx.strokeStyle = themeRgba(theme, "accent", 0.88);
    ctx.strokeRect(-size * 0.13, -size * 0.48, size * 0.26, size * 0.72);
    ctx.beginPath();
    ctx.arc(0, -size * 0.52, size * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent2", 0.9);
    ctx.fill();
  } else if (model.kind === "console") {
    polygon(ctx, [
      [-size * 0.72, -size * 0.42], [size * 0.58, -size * 0.42],
      [size * 0.72, size * 0.35], [-size * 0.58, size * 0.35]
    ]);
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.stroke();
    polygon(ctx, [
      [-size * 0.5, -size * 0.27], [size * 0.35, -size * 0.27],
      [size * 0.45, size * 0.06], [-size * 0.43, size * 0.06]
    ]);
    ctx.fillStyle = themeRgba(theme, "accent", 0.36);
    ctx.fill();
    ctx.strokeStyle = themeRgba(theme, "accent", 0.95);
    ctx.stroke();
    for (i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-size * 0.29 + i * size * 0.19, size * 0.21,
        size * 0.045, 0, Math.PI * 2);
      ctx.fillStyle = i === 3
        ? themeRgba(theme, "accent2", 0.9)
        : themeRgba(theme, "accent", 0.65);
      ctx.fill();
    }
  } else if (model.kind === "server" || model.kind === "battery") {
    var columns = model.kind === "server" ? 3 : 2;
    for (i = 0; i < columns; i++) {
      var bx = (i - (columns - 1) / 2) * size * 0.5;
      ctx.fillStyle = theme.metalDark;
      ctx.fillRect(bx - size * 0.2, -size * 0.54, size * 0.4, size * 1.05);
      ctx.strokeStyle = themeRgba(theme, "panelLine", 0.85);
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - size * 0.2, -size * 0.54, size * 0.4, size * 1.05);
      ctx.fillStyle = themeRgba(theme, i % 2 ? "accent2" : "accent", 0.7);
      ctx.fillRect(bx - size * 0.11, -size * 0.36, size * 0.22, size * 0.12);
      ctx.fillRect(bx - size * 0.11, -size * 0.08, size * 0.22, size * 0.05);
      ctx.fillRect(bx - size * 0.11, size * 0.08, size * 0.22, size * 0.05);
    }
  } else if (model.kind === "vent") {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = theme.metal;
    ctx.stroke();
    for (i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 4);
      polygon(ctx, [
        [size * 0.09, -size * 0.08], [size * 0.53, -size * 0.19],
        [size * 0.4, size * 0.1], [size * 0.13, size * 0.14]
      ]);
      ctx.fillStyle = themeRgba(theme, "panelLine", 0.76);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent", 0.88);
    ctx.fill();
  } else if (model.kind === "antenna") {
    hexagon(ctx, size * 0.64, 0.7);
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.82);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = theme.metal;
    ctx.fillRect(-size * 0.08, -size * 0.18, size * 0.16, size * 0.63);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.27, size * 0.5, size * 0.24,
      -0.25, 0, Math.PI * 2);
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.strokeStyle = themeRgba(theme, "accent", 0.83);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.28);
    ctx.lineTo(size * 0.28, -size * 0.65);
    ctx.strokeStyle = themeRgba(theme, "accent2", 0.92);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 0.3, -size * 0.68, size * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent2", 0.96);
    ctx.fill();
  } else if (model.kind === "tank") {
    ctx.fillStyle = theme.metalDark;
    ctx.fillRect(-size * 0.52, -size * 0.42, size * 1.04, size * 0.84);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.42, size * 0.52, size * 0.25,
      0, 0, Math.PI * 2);
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.85);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, size * 0.42, size * 0.52, size * 0.25,
      0, 0, Math.PI);
    ctx.stroke();
    ctx.fillStyle = themeRgba(theme, "accent", 0.28);
    ctx.fillRect(-size * 0.43, -size * 0.18, size * 0.86, size * 0.21);
    ctx.strokeStyle = themeRgba(theme, "accent", 0.7);
    ctx.strokeRect(-size * 0.43, -size * 0.18, size * 0.86, size * 0.21);
  } else if (model.kind === "holo") {
    hexagon(ctx, size * 0.63, 0.65);
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.33, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent", 0.38);
    ctx.fill();
    polygon(ctx, [
      [0, -size * 0.82], [size * 0.38, -size * 0.2],
      [0, size * 0.18], [-size * 0.38, -size * 0.2]
    ]);
    ctx.fillStyle = themeRgba(theme, "accent2", 0.16);
    ctx.fill();
    ctx.strokeStyle = themeRgba(theme, "accent2", 0.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.82);
    ctx.lineTo(0, size * 0.18);
    ctx.moveTo(-size * 0.38, -size * 0.2);
    ctx.lineTo(size * 0.38, -size * 0.2);
    ctx.strokeStyle = themeRgba(theme, "accent2", 0.42);
    ctx.stroke();
  } else if (model.kind === "coil") {
    hexagon(ctx, size * 0.68, 0.68);
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.84);
    ctx.lineWidth = 2;
    ctx.stroke();
    for (i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, size * (0.22 + i * 0.12),
        -Math.PI * 0.82 + i * 0.3, Math.PI * 0.82 + i * 0.3);
      ctx.lineWidth = 4 - i * 0.55;
      ctx.strokeStyle = themeRgba(theme, i % 2 ? "accent2" : "accent",
        0.9 - i * 0.1);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent2", 0.95);
    ctx.fill();
  } else if (model.kind === "gate") {
    ctx.fillStyle = theme.metalDark;
    ctx.fillRect(-size * 0.75, -size * 0.58, size * 0.3, size * 1.16);
    ctx.fillRect(size * 0.45, -size * 0.58, size * 0.3, size * 1.16);
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.lineWidth = 2;
    ctx.strokeRect(-size * 0.75, -size * 0.58, size * 0.3, size * 1.16);
    ctx.strokeRect(size * 0.45, -size * 0.58, size * 0.3, size * 1.16);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.62, Math.PI, Math.PI * 2);
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = theme.metal;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = themeRgba(theme, "accent", 0.95);
    ctx.stroke();
    ctx.fillStyle = themeRgba(theme, "accent2", 0.95);
    ctx.fillRect(-size * 0.62, -size * 0.08, size * 0.17, size * 0.16);
    ctx.fillRect(size * 0.45, -size * 0.08, size * 0.17, size * 0.16);

  // --- the forest board's own props, seen from above --------------------
  //
  // These exist so the map CARD shows the map. `drawMapThumbnail` renders a
  // route through this exact function, so a prop the 3D board builds and this
  // one does not is a prop that is in the game and not on the card -- which is
  // the state every piece of scenery was in before the 3D board learned to
  // build any of them. From this angle a dead stem is a trunk and the shadow
  // of its limbs, and a barricade is a row of boards: no elevation is visible,
  // so nothing here tries to imply one.
  } else if (model.kind === "tree" || model.kind === "snag") {
    var stem = model.kind === "tree" ? 1 : 0.66;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.5);
    for (i = 0; i < 6; i++) {
      var limb = i * Math.PI * 2 / 6 + size * 0.02;
      var out = size * stem * (0.42 + (i % 3) * 0.22);
      ctx.lineWidth = 2.6 - (i % 3) * 0.7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(limb) * out, Math.sin(limb) * out);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.17 * stem, 0, Math.PI * 2);
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.8);
    ctx.stroke();
  } else if (model.kind === "stump") {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = theme.panel;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-size * 0.26, -size * 0.08);
    ctx.lineTo(size * 0.24, size * 0.12);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.7);
    ctx.stroke();
  } else if (model.kind === "log") {
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, 0);
    ctx.lineTo(size * 0.6, 0);
    ctx.lineWidth = size * 0.38;
    ctx.strokeStyle = theme.metalDark;
    ctx.stroke();
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.7);
    ctx.stroke();
  } else if (model.kind === "brush") {
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.62);
    for (i = 0; i < 5; i++) {
      var stick = i * Math.PI / 5 + 0.3;
      var half = size * (0.3 + (i % 2) * 0.18);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(stick) * half, -Math.sin(stick) * half);
      ctx.lineTo(Math.cos(stick) * half * 0.8, Math.sin(stick) * half * 0.8);
      ctx.stroke();
    }
  } else if (model.kind === "barricade" || model.kind === "fence") {
    var run = size * (model.kind === "fence" ? 1.6 : 1.5);
    var boards = model.kind === "fence" ? 3 : 7;
    ctx.fillStyle = theme.metal;
    ctx.fillRect(-run / 2, -size * 0.09, run, size * 0.18);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.strokeRect(-run / 2, -size * 0.09, run, size * 0.18);
    ctx.strokeStyle = theme.metalDark;
    ctx.lineWidth = 2.4;
    for (i = 0; i < boards; i++) {
      var post = -run / 2 + run * i / (boards - 1);
      ctx.beginPath();
      ctx.moveTo(post, -size * 0.15);
      ctx.lineTo(post, size * 0.15);
      ctx.stroke();
    }
  } else if (model.kind === "spikes") {
    ctx.strokeStyle = theme.metal;
    ctx.lineWidth = 2.4;
    for (i = 0; i < 3; i++) {
      var at = (i - 1) * size * 0.52;
      ctx.beginPath();
      ctx.moveTo(at - size * 0.16, -size * 0.32);
      ctx.lineTo(at + size * 0.16, size * 0.32);
      ctx.moveTo(at + size * 0.16, -size * 0.32);
      ctx.lineTo(at - size * 0.16, size * 0.32);
      ctx.stroke();
    }
  } else if (model.kind === "sandbags") {
    for (i = 0; i < 6; i++) {
      var bag = (i - 2.5) * size * 0.26;
      ctx.fillStyle = i % 2 ? theme.panel : theme.metal;
      ctx.fillRect(bag - size * 0.12, -size * 0.16, size * 0.24, size * 0.32);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = themeRgba(theme, "panelLine", 0.8);
      ctx.strokeRect(bag - size * 0.12, -size * 0.16, size * 0.24, size * 0.32);
    }
  } else if (model.kind === "watchtower") {
    ctx.fillStyle = theme.metalDark;
    ctx.fillRect(-size * 0.42, -size * 0.42, size * 0.84, size * 0.84);
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.strokeRect(-size * 0.42, -size * 0.42, size * 0.84, size * 0.84);
    ctx.beginPath();
    ctx.moveTo(-size * 0.42, -size * 0.42);
    ctx.lineTo(size * 0.42, size * 0.42);
    ctx.moveTo(size * 0.42, -size * 0.42);
    ctx.lineTo(-size * 0.42, size * 0.42);
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.55);
    ctx.stroke();
    // The lamp, and the only lit thing in the forest.
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent", 0.95);
    ctx.fill();
  } else if (model.kind === "wreck") {
    ctx.fillStyle = theme.metalDark;
    ctx.fillRect(-size * 0.6, -size * 0.3, size * 1.2, size * 0.6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.85);
    ctx.strokeRect(-size * 0.6, -size * 0.3, size * 1.2, size * 0.6);
    ctx.fillStyle = theme.metal;
    ctx.fillRect(-size * 0.34, -size * 0.24, size * 0.5, size * 0.48);
    ctx.strokeRect(-size * 0.34, -size * 0.24, size * 0.5, size * 0.48);
    for (i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc((i & 1 ? 1 : -1) * size * 0.42, (i & 2 ? 1 : -1) * size * 0.3,
        size * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = theme.metalDark;
      ctx.fill();
      ctx.stroke();
    }
  } else if (model.kind === "barrel") {
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent", 0.92);
    ctx.fill();
  }
  ctx.restore();
}

Maps.themeOf = function (map) {
  if (map && map.theme) return map.theme;
  return Maps.LIST[0].theme;
};

Maps.backgroundColor = function (map) {
  return Maps.themeOf(map).background;
};

Maps.drawEnvironment = function (ctx, map) {
  if (!map) return;

  var scale = UNIT_LENGTH / AUTHORED_AT_PX_PER_UL;
  var theme = Maps.themeOf(map);
  ctx.save();
  ctx.scale(scale, scale);

  // Overscan by a little more than the earthquake camera offset, so shaking
  // never exposes the generic canvas colour at an edge.
  ctx.fillStyle = theme.floor;
  ctx.fillRect(-30, -30, VIEW_WIDTH / scale + 60, VIEW_HEIGHT / scale + 60);

  // A manufactured panel grid unifies the whole floor before the larger
  // coloured decks and models establish each facility's silhouette. A board
  // that declares itself `wild` has no manufactured floor to unify -- ruled
  // lines across a forest would say exactly the wrong thing about it -- so it
  // gets the bare ground and lets its own props carry the picture. The 3D
  // board drops the same grid on the same flag.
  if (!theme.wild) {
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.18);
    ctx.lineWidth = 1;
    for (var x = 0; x <= VIEW_WIDTH / scale; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, VIEW_HEIGHT / scale);
      ctx.stroke();
    }
    for (var y = 0; y <= VIEW_HEIGHT / scale; y += 72) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(VIEW_WIDTH / scale, y);
      ctx.stroke();
    }
  }

  for (var zoneIndex = 0; zoneIndex < map.zones.length; zoneIndex++) {
    drawZone(ctx, map.zones[zoneIndex], theme);
  }

  // Circuit trunks visually connect separate machines without changing any
  // route or collision data. Nothing cables a tree to another tree, so a wild
  // board draws none -- and on this one they would be forty-seven ember lines
  // strung between the stems, which is the single loudest thing that could
  // possibly be on a board whose whole point is that the lights went out.
  if (!theme.wild) {
    ctx.strokeStyle = themeRgba(theme, "accent", 0.19);
    ctx.lineWidth = 3;
    for (var trunk = 0; trunk < map.models.length - 1; trunk += 2) {
      var from = map.models[trunk];
      var to = map.models[trunk + 1];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.fillStyle = themeRgba(theme, "accent2", 0.62);
      ctx.fillRect(to.x - 3, to.y - 3, 6, 6);
    }
  }

  for (var modelIndex = 0; modelIndex < map.models.length; modelIndex++) {
    drawModel(ctx, map.models[modelIndex], theme);
  }

  // The old motifs remain as a final fine-detail decal pass. They no longer
  // carry the environment by themselves; the full decks and machinery do.
  for (var decorationIndex = 0;
      decorationIndex < map.decorations.length; decorationIndex++) {
    drawDecoration(ctx, map.decorations[decorationIndex]);
  }

  // WEATHER, LAST, OVER EVERYTHING THE BOARD JUST DREW.
  //
  // The 3D board fogs by DISTANCE, which is a thing a top-down 2D pass has no
  // access to -- there is no camera and every pixel is the same distance away.
  // So this is not the same effect and does not pretend to be: it is a bank of
  // mist lying across the board, thickest at the edges and thinnest where the
  // road is, which is what the fog LOOKS like from above. Drawn here rather
  // than in the play renderer so the map card and the battlefield agree, which
  // is the whole contract `drawMapThumbnail` relies on.
  if (theme.fog) drawFogBank(ctx, theme, scale);
  ctx.restore();
};

// The mist, in the authored pixel space the rest of the environment uses.
// Deterministic: same board, same banks, every frame and every card.
//
// GRADIENTS ARE ASKED FOR, NOT ASSUMED. The test harness's canvas accepts every
// call and returns nothing from all of them, so `createRadialGradient` hands
// back undefined there and calling `addColorStop` on it throws -- which would
// take out "a full frame draws without throwing" and every card that renders
// this board. Where there is no gradient the mist falls back to a flat wash:
// the same colour at the same weight, without the shape.
function fogRgba(theme, alpha) {
  var hex = String(theme.fog.color).replace("#", "");
  return "rgba(" + parseInt(hex.substr(0, 2), 16) + "," +
    parseInt(hex.substr(2, 2), 16) + "," +
    parseInt(hex.substr(4, 2), 16) + "," + alpha + ")";
}

function drawFogBank(ctx, theme, scale) {
  var w = VIEW_WIDTH / scale, h = VIEW_HEIGHT / scale;
  var i;

  ctx.save();

  // A vignette of mist around the edges. The centre is left alone, because a
  // wash over the whole board is not fog -- it is a lowered contrast slider,
  // and it takes the road down with it.
  var edge = ctx.createRadialGradient(w / 2, h / 2, h * 0.28,
    w / 2, h / 2, h * 0.95);
  if (edge && edge.addColorStop) {
    edge.addColorStop(0, fogRgba(theme, 0));
    edge.addColorStop(1, fogRgba(theme, 0.42));
    ctx.fillStyle = edge;
  } else {
    ctx.fillStyle = fogRgba(theme, 0.16);
  }
  ctx.fillRect(0, 0, w, h);

  // Four banks drifting across it, so the mist has a shape rather than being
  // an even film. Authored, not random: a card that redraws differently every
  // frame reads as flicker.
  var banks = [[0.18, 0.14, 0.34], [0.62, 0.08, 0.28],
               [0.30, 0.86, 0.32], [0.82, 0.72, 0.30]];
  for (i = 0; i < banks.length; i++) {
    var bx = banks[i][0] * w, by = banks[i][1] * h, br = banks[i][2] * h;
    var blob = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    if (!blob || !blob.addColorStop) break;
    blob.addColorStop(0, fogRgba(theme, 0.26));
    blob.addColorStop(1, fogRgba(theme, 0));
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.ellipse(bx, by, br * 1.7, br, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}


// Compatibility for older tools that asked only for the old decal layer.
Maps.drawDecorations = Maps.drawEnvironment;


// --- the measurement --------------------------------------------------------

// How finely the road is sampled when measuring, and how far apart candidate
// build spots are placed along it. Both in u.l., so they mean the same thing
// on every map.
Maps.ROAD_STEP_UL = 6.25;
Maps.SPOT_STEP_UL = 12.5;

// Players build in the good spots, not the average ones, so the score reads the
// top decile of candidate positions rather than the mean of all of them.
Maps.GOOD_FRACTION = 0.10;

// A vertex counts as a "turn" once the route deviates by more than this. Below
// it the road reads as straight to the eye and to a tower's circle alike.
Maps.TURN_THRESHOLD_DEG = 12;

// The fold detector, in multiples of the reference tower's range.
//
// Two bits of road only count as a fold if they are far apart ALONG the route:
// four ranges, which is far enough that ordinary curvature cannot bring them
// close. (Two was not: on a gently bending road, points two ranges apart along
// the path are slightly less than that apart in space, and a shallow sweep read
// as a fold.)
//
// They are FOLDED once they come within two ranges of each other, because that
// is exactly when one tower standing between them can cover both.
Maps.FOLD_SEPARATION_RANGES = 4;
Maps.FOLD_REACH_RANGES = 2;

// Difficulty bands. Anchored to the straight-road figure: a map whose good
// spots are plain straight road and which is exactly reference length scores
// 1.00, which is as hard as this geometry gets.
Maps.TIER_EASY_BELOW = 0.65;
Maps.TIER_NORMAL_BELOW = 0.93;

// The tower every route is measured with. The 0.4.9 base deleted the gunner,
// so its identical 100 u.l. / footprint reference is the Rifleman.
// Kept behind one function so map generation never reintroduces the deleted
// tower as gameplay content.
Maps.REFERENCE_TOWER = function () { return Soldier; };

// u.l. of road the reference tower covers standing at minimum legal clearance
// beside a plain straight stretch. Derived from that tower's own range and the
// game's own build rule, so it cannot disagree with actual placement/reach.
Maps.straightCoverageUl = function () {
  var Reference = Maps.REFERENCE_TOWER();
  var rangeUl = Reference.BASE_RANGE_UL;
  var clearanceUl = ((buildClearancePx(Reference)) / UNIT_LENGTH);
  return 2 * Math.sqrt(rangeUl * rangeUl - clearanceUl * clearanceUl);
};

// Is (x, y) somewhere a tower could actually be placed on an empty board?
// Uses the game's own clearance rule and its own interface geometry, so the
// measurement can never count a spot the player is not allowed to use.
Maps.buildableSpot = function (gamePaths, x, y, clearancePx) {
  if (!Array.isArray(gamePaths)) gamePaths = [gamePaths];
  for (var i = 0; i < gamePaths.length; i++) {
    if (gamePaths[i].distanceToPoint(x, y) < clearancePx) return false;
  }
  if (x < 0 || y < 0 || x > VIEW_WIDTH || y > VIEW_HEIGHT) return false;
  return slotAt(x, y) < 0;            // the build bar eats clicks beneath it
};

// Full geometric report for a map. Cached on the map object: the sampling is
// O(spots x samples) and the map select screen redraws every frame.
//
// Everything here is derived from the points plus the game's own constants.
// Nothing about a map's difficulty is typed in.
Maps.analyse = function (map) {
  if (map.analysis) return map.analysis;

  var definitions = Maps.routesOf(map);
  var gamePaths = definitions.map(function (route) {
    return new GamePath(Maps.toWorld(route.points));
  });
  var Reference = Maps.REFERENCE_TOWER();
  var rangePx = ul(Reference.BASE_RANGE_UL);
  var clearancePx = buildClearancePx(Reference);
  var roadStepPx = ul(Maps.ROAD_STEP_UL);
  var spotEvery = Math.max(1, Math.round(Maps.SPOT_STEP_UL / Maps.ROAD_STEP_UL));

  // Sample every route once and reuse the union for every spot. Coverage over
  // that union is exactly what makes a tower beside the confluence valuable.
  var samples = [];
  var samplesByRoute = [];
  for (var routeIndex = 0; routeIndex < gamePaths.length; routeIndex++) {
    var gamePath = gamePaths[routeIndex];
    var routeSamples = [];
    for (var d = 0; d <= gamePath.length; d += roadStepPx) {
      var sample = gamePath.pointAt(d);
      sample.routeIndex = routeIndex;
      sample.progress = d;
      routeSamples.push(sample);
      samples.push(sample);
    }
    samplesByRoute.push(routeSamples);
  }

  var spots = [];
  for (routeIndex = 0; routeIndex < samplesByRoute.length; routeIndex++) {
    var along = samplesByRoute[routeIndex];
    for (var i = 0; i < along.length; i += spotEvery) {
      var a = along[Math.max(0, i - 1)];
      var b = along[Math.min(along.length - 1, i + 1)];
      var tx = b.x - a.x;
      var ty = b.y - a.y;
      var tlen = Math.sqrt(tx * tx + ty * ty);
      if (tlen === 0) continue;

      // Step off the road perpendicularly, on both sides. A shade past the
      // legal clearance keeps floating point from rounding it back inside.
      var offset = clearancePx * 1.02;
      for (var side = -1; side <= 1; side += 2) {
        var x = along[i].x + (-ty / tlen) * side * offset;
        var y = along[i].y + (tx / tlen) * side * offset;
        if (!Maps.buildableSpot(gamePaths, x, y, clearancePx)) continue;
        spots.push({
          x: x,
          y: y,
          routeIndex: routeIndex,
          progress: along[i].progress,
          coverageUl: Maps.coverageAt(samples, x, y, rangePx)
        });
      }
    }
  }

  var sorted = spots.slice().sort(function (p, q) {
    return q.coverageUl - p.coverageUl;
  });
  var take = Math.max(1, Math.round(sorted.length * Maps.GOOD_FRACTION));

  var goodCoverageUl = 0;
  for (i = 0; i < take; i++) goodCoverageUl += sorted[i].coverageUl;
  goodCoverageUl = goodCoverageUl / take;

  var meanCoverageUl = 0;
  for (i = 0; i < sorted.length; i++) meanCoverageUl += sorted[i].coverageUl;
  meanCoverageUl = sorted.length ? meanCoverageUl / sorted.length : 0;

  var totalLengthUl = 0;
  var shortestLengthUl = Infinity;
  var bends = { count: 0, degrees: 0 };
  for (routeIndex = 0; routeIndex < gamePaths.length; routeIndex++) {
    var routeLengthUl = gamePaths[routeIndex].length / UNIT_LENGTH;
    totalLengthUl += routeLengthUl;
    shortestLengthUl = Math.min(shortestLengthUl, routeLengthUl);
    var routeBends = Maps.turns(definitions[routeIndex].points);
    bends.count += routeBends.count;
    bends.degrees += routeBends.degrees;
  }
  // `lengthUl` remains the primary route's length for compatibility with the
  // HUD and the authored-map contract. Multi-route reports also expose total
  // and shortest length explicitly.
  var lengthUl = gamePaths[0].length / UNIT_LENGTH;

  // Coverage is squared: it scales every tower's output for the entire run,
  // where length only decides how long you get before the first leak. Route
  // count is pressure: scheduled bodies are mirrored onto every route.
  var coverageRatio = Maps.straightCoverageUl() / goodCoverageUl;
  var graceRatio = Maps.referenceLengthUl() / shortestLengthUl;
  var score = Math.pow(
    coverageRatio * coverageRatio * graceRatio * gamePaths.length, 1 / 3);

  map.analysis = {
    lengthUl: lengthUl,
    totalLengthUl: totalLengthUl,
    shortestLengthUl: shortestLengthUl,
    crossingSeconds: shortestLengthUl / Enemy.BASE_SPEED_ULPS,
    routeCount: gamePaths.length,
    turns: bends.count,
    totalTurnDegrees: bends.degrees,
    foldGapUl: Maps.tightestFold(samples),
    spots: sorted,
    meanCoverageUl: meanCoverageUl,
    goodCoverageUl: goodCoverageUl,
    coverageRatio: coverageRatio,
    graceRatio: graceRatio,
    score: score,
    tier: Maps.tierFor(score)
  };
  return map.analysis;
};

// u.l. of road within rangePx of (x, y).
Maps.coverageAt = function (samples, x, y, rangePx) {
  var rangeSq = rangePx * rangePx;
  var hits = 0;
  for (var i = 0; i < samples.length; i++) {
    var dx = samples[i].x - x;
    var dy = samples[i].y - y;
    if (dx * dx + dy * dy <= rangeSq) hits++;
  }
  return hits * Maps.ROAD_STEP_UL;
};

// How many times the route bends, and by how much in total.
Maps.turns = function (points) {
  var count = 0;
  var degrees = 0;

  for (var i = 1; i < points.length - 1; i++) {
    var ax = points[i].x - points[i - 1].x;
    var ay = points[i].y - points[i - 1].y;
    var bx = points[i + 1].x - points[i].x;
    var by = points[i + 1].y - points[i].y;

    var deviation = Math.abs(Math.atan2(
      ax * by - ay * bx,
      ax * bx + ay * by
    )) * 180 / Math.PI;

    degrees += deviation;
    if (deviation >= Maps.TURN_THRESHOLD_DEG) count++;
  }
  return { count: count, degrees: degrees };
};

// The closest two parts of the route come to each other, ignoring pairs that
// are near each other simply because they are the same stretch of road. This is
// the loop detector, and it is what separates a map with corners from a map
// with coils.
//
// Note it BOTTOMS OUT at the separation distance and cannot report more: the
// pairs it compares are already that far apart along the road, so on a straight
// line they are exactly that far apart in space too. Infinity only for a route
// too short to have any such pair at all.
Maps.tightestFold = function (samples) {
  var separationPx = ul(Maps.FOLD_SEPARATION_RANGES * Tower.BASE_RANGE_UL);
  var best = Infinity;

  for (var i = 0; i < samples.length; i++) {
    for (var j = i + 1; j < samples.length; j++) {
      if (samples[i].routeIndex === samples[j].routeIndex &&
          Math.abs(samples[i].progress - samples[j].progress) < separationPx) {
        continue;
      }
      var dx = samples[i].x - samples[j].x;
      var dy = samples[i].y - samples[j].y;
      var d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
  }
  return best === Infinity ? Infinity : ((Math.sqrt(best)) / UNIT_LENGTH);
};

// Does the route ever come back close enough to itself that ONE tower could
// cover both lanes? The one question the fold measurement is actually asked,
// answered in one place so the card and any test read it the same way.
Maps.foldsBack = function (analysis) {
  return analysis.foldGapUl < Maps.FOLD_REACH_RANGES * Tower.BASE_RANGE_UL;
};

Maps.tierFor = function (score) {
  if (score < Maps.TIER_EASY_BELOW) return "easy";
  if (score < Maps.TIER_NORMAL_BELOW) return "normal";
  return "hard";
};

// The best `count` build spots, strongest first, SPREAD ALONG THE ROUTE. Used
// by the tests to defend each map with a comparable set of towers, so "this map
// is harder" can be measured through the real game loop rather than only
// asserted by the score.
//
// Spreading is the whole point, and taking the top N by coverage alone gets it
// badly wrong: those all sit in the same corner, so the towers cover one
// stretch of road between them and idle together the rest of the time. That
// flattered whichever map had its good spots most scattered and made a map with
// one excellent corner look worse than it plays. Requiring each tower to own
// its own stretch of road -- a straight-road coverage apart, measured ALONG the
// path -- is both closer to how anyone actually builds and comparable between
// maps.
Maps.bestSpots = function (map, count) {
  var spots = Maps.analyse(map).spots;
  var gapPx = ul(Tower.FOOTPRINT_RADIUS_UL * 2);
  var apartPx = ul(Maps.straightCoverageUl());
  var chosen = [];

  for (var pass = 0; pass < 2 && chosen.length < count; pass++) {
    for (var i = 0; i < spots.length && chosen.length < count; i++) {
      var spot = spots[i];
      var ok = true;
      for (var j = 0; j < chosen.length; j++) {
        var dx = chosen[j].x - spot.x;
        var dy = chosen[j].y - spot.y;
        if (dx * dx + dy * dy < gapPx * gapPx) { ok = false; break; }
        // Second pass drops the spreading rule, so a short route can still be
        // filled once every stretch already has a tower.
        if (pass === 0 && chosen[j].routeIndex === spot.routeIndex &&
            Math.abs(chosen[j].progress - spot.progress) < apartPx) {
          ok = false;
          break;
        }
      }
      if (ok) chosen.push(spot);
    }
  }
  return chosen;
};

// Bounding box of a route, for drawing a scaled preview of it.
Maps.bounds = function (map) {
  var b = {
    minX: Infinity, minY: Infinity,
    maxX: -Infinity, maxY: -Infinity
  };
  var routes = Maps.routesOf(map);
  for (var r = 0; r < routes.length; r++) {
    for (var i = 0; i < routes[r].points.length; i++) {
      b.minX = Math.min(b.minX, routes[r].points[i].x);
      b.minY = Math.min(b.minY, routes[r].points[i].y);
      b.maxX = Math.max(b.maxX, routes[r].points[i].x);
      b.maxY = Math.max(b.maxY, routes[r].points[i].y);
    }
  }
  return b;
};
