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
// THE WALKED ROUTE IS THE DRAWN ROUTE.
//
// It was not, and the owner caught it: the ribbon was smoothed for presentation
// only, so enemies cut every corner the picture had rounded and visibly walked
// beside their own road. A road you can see and a road that is walked being
// different lines is the same lie as a rock you can see and a rock you collide
// with being different shapes.
//
// So the spline is applied ONCE, here, and everything downstream -- pathing,
// build clearance, the difficulty sampler, both renderers -- measures the same
// line. The authored points are still the source: the curve passes through
// every one of them, and the sharp corners among them stay sharp.
// OPT-IN PER MAP, and that is not a nicety. The first version curved EVERY
// route, which includes Rune Circuit -- the reference map, whose length fixes
// the u.l. scale for the entire game. Its route grew, the reference length grew
// with it, and a hundred and two tests went red at once because every balance
// figure in the campaign is measured against that number.
//
// The six older boards are decks inside facilities and their roads are supposed
// to be ruled lines. A map asks for a curved road by saying so.
Maps.walkablePoints = function (map, points) {
  if (!map || !map.curvedRoad) return points;
  return Maps.smoothRoad(points, 12);
};

Maps.routesOf = function (map) {
  if (map.routes && map.routes.length) return map.routes;
  // `width` and `pace` ride along with the points because they are properties
  // of THE ROUTE, not of the map: a two-entrance board could narrow one road
  // and not the other. An authored single-route map declares them at the top
  // level for the same reason it declares `points` there.
  return [{ id: "main", points: map.points,
            width: map.width || null, pace: map.pace || null }];
};

// What the road DOES along this route, in the shape GamePath takes, or null
// when it does nothing -- which is six of the seven boards. One function, so
// the three places that build a GamePath cannot disagree about where a
// profile lives. See the profile block at the bottom of js/path.js.
Maps.profileOf = function (route) {
  if (!route || (!route.width && !route.pace)) return null;
  return { width: route.width || null, pace: route.pace || null };
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

// THE ONE BOARD THAT IS NOT A FACILITY, and the only one whose ROAD is not one
// width the whole way.
//
// Authored, not generated, and pushed here rather than written into the LIST
// literal above so the four original routes stay together as the set the
// difficulty measure was calibrated against.
//
// WHAT THE ROUTE DOES, in order, because every one of these is a place the
// player has to make a different decision:
//
//   the gate      bodies walk out of a lit arch and into a MUSTER YARD -- the
//                 road at nearly twice width, open ground, nothing to shoot
//                 from close. A wide space before a tight one, so the wave is
//                 visible as a crowd before it is a queue.
//   the notch     the descent, squeezed to two thirds of a road (0.68) between
//                 the west mound and the mire. The road pulls its edges in, so
//                 a tower may stand CLOSER here than anywhere before it.
//   the crossing  the mire opens out again, then narrows onto the bridge --
//                 the one place the river may be crossed, and a second queue.
//   the switchbacks  two U-turns around two islands, 190 and 170 units apart.
//                 This is where towers double their work: one gun in the
//                 middle of a fold covers the lane going out and the lane
//                 coming back.
//   the basin     the road opens to nearly three times width around the top
//                 corner. A wave stops being a column here and spreads, which
//                 is what a boss needs and what a Rifleman on the rim hates:
//                 the tarmac pushes every tower back off it.
//   the wire gate the tightest thing on the board (0.62) and the start of the
//                 FINAL GAUNTLET -- the last fifth of the route, where the
//                 pace profile puts bodies at half again their speed and the
//                 camp is the only thing left between them and the base.
//
// Nothing about the scenery is read by the measurement: the camp is a picture,
// and the route would score the same drawn across bare floor.
Maps.LIST.push({
  id: "test",
  name: "Test",
  blurb: ["A dead relay on black dirt. Gate,",
          "notch, crossing, basin, wire."],
  decorations: [
    { kind: "bones", x: 250, y: 640, size: 22, color: "173,166,149" },
    { kind: "husk", x: 620, y: 92, size: 26, color: "86,82,66" },
    { kind: "crystal", x: 905, y: 108, size: 20, color: "120,214,255" },
    { kind: "husk", x: 120, y: 470, size: 30, color: "86,82,66" },
    { kind: "bones", x: 1122, y: 662, size: 20, color: "173,166,149" },
    { kind: "motes", x: 596, y: 425, size: 30, color: "120,214,255" },
    { kind: "motes", x: 232, y: 300, size: 26, color: "120,214,255" },
    { kind: "crystal", x: 1012, y: 622, size: 18, color: "120,214,255" }
  ],
  // THE ROAD'S WIDTH, ALONG THE ROAD. Anchors are fractions of the route's own
  // length and the value ramps between them -- see the profile block at the
  // bottom of js/path.js, and `buildClearanceOn` in js/game.js for what it
  // does to placement.
  //
  // The numbers are bounded by the game at both ends and neither bound is
  // taste:
  //
  //   NARROW. A body is 22 px across (Enemy.RADIUS_PX) and the nominal road is
  //   22.75. 0.62 is 14.1 px, so the wire gate is narrower than the things
  //   going through it and every one of them overhangs the kerb -- which is the
  //   picture that stretch is for, and is the same overhang AGENTS.md already
  //   accepts on open road at full lane spread. Below about 0.55 the road stops
  //   reading as a road at all.
  //
  //   WIDE. A Rifleman reaches 100 u.l. and must stand clear of the tarmac, so
  //   the basin at 2.95 (67.1 px of road) puts a gun 45.3 px off the centre
  //   line against 27.1 on this board's open road and 18.8 at the wire gate.
  //   Through the reference tower's own reach that is 179.5 u.l. of road
  //   covered in the basin, 193.1 on open road and 196.7 at the gate -- so a
  //   plaza is a real cost and a chokepoint is a real reward, both of them
  //   falling out of one derived placement rule rather than a bonus.
  //
  // Measured off Maps.analyse for the whole board: good spots cover 276.3 u.l.
  // against 260.2 for the straight-legged route this replaced, and the score
  // lands at 0.78 against 0.79. The board is as hard as it was; what changed is
  // what the player is looking at and what they have to decide.
  width: [
    { at: 0.000, scale: 1.10 },   // the gate mouth
    { at: 0.030, scale: 1.90 },   // THE MUSTER YARD
    { at: 0.075, scale: 1.90 },
    { at: 0.110, scale: 1.35 },   // open road, this board's own normal
    { at: 0.125, scale: 0.68 },   // THE NOTCH
    { at: 0.160, scale: 0.68 },
    { at: 0.185, scale: 1.35 },
    { at: 0.225, scale: 1.60 },   // the mire, a breath before the crossing
    { at: 0.255, scale: 1.60 },
    { at: 0.280, scale: 0.90 },   // THE BRIDGE
    { at: 0.305, scale: 0.90 },
    { at: 0.340, scale: 1.35 },
    { at: 0.470, scale: 1.35 },
    { at: 0.520, scale: 1.15 },   // held in around the switchbacks
    { at: 0.580, scale: 1.15 },
    { at: 0.640, scale: 2.95 },   // THE BASIN
    { at: 0.760, scale: 2.95 },
    { at: 0.800, scale: 1.35 },
    { at: 0.835, scale: 0.62 },   // THE WIRE GATE
    { at: 0.870, scale: 0.62 },
    { at: 0.900, scale: 1.00 },   // the run in to the base
    { at: 1.000, scale: 1.00 }
  ],
  // AND HOW FAST THE ROAD IS WALKED. Same shape, same anchors, and it exists
  // because of a complaint about the old route rather than for its own sake:
  // six right angles at one speed took 43.1 s to cross and read as a trudge.
  //
  // This route is LONGER -- 2 451 u.l. against 2 154 -- and is crossed in
  // 39.8 s, because the stretches where nothing is happening are walked
  // quickly and the ones where something is are not. Measured through
  // Maps.walkSeconds, which integrates this profile rather than dividing by a
  // speed the road no longer has.
  //
  // 1.55 over the last fifth is the FINAL GAUNTLET, and it is the one number
  // here that is a mechanic rather than a pace: a body that clears the wire
  // gate is at half again its speed with the camp still to run, so the towers
  // that were comfortable at the basin get a third less time each.
  pace: [
    { at: 0.000, scale: 1.00 },   // out of the gate, still shambling
    { at: 0.060, scale: 1.35 },
    { at: 0.185, scale: 1.35 },
    { at: 0.240, scale: 1.10 },   // the crossing is walked, not run
    { at: 0.330, scale: 1.35 },
    { at: 0.480, scale: 1.35 },
    { at: 0.560, scale: 0.95 },   // the basin holds them
    { at: 0.780, scale: 0.95 },
    { at: 0.830, scale: 1.75 },   // THE GAUNTLET
    { at: 1.000, scale: 1.75 }
  ],
  points: [
    { x: -60,  y: 190 },
    { x: 180,  y: 190 },
    { x: 180,  y: 410 },
    { x: 300,  y: 520 },
    { x: 660,  y: 520 },
    { x: 660,  y: 330 },
    { x: 510,  y: 330 },
    { x: 510,  y: 160 },
    { x: 830,  y: 160 },
    { x: 830,  y: 380 },
    { x: 1040, y: 380 },
    { x: 1340, y: 440 }
  ]
});

// --- Ironwood Frontier -----------------------------------------------------
//
// THE FIRST MAP WITH GAMEPLAY GEOMETRY OF ITS OWN. Every other route in this
// file is a polyline drawn across an empty floor: the scenery is a picture, and
// the same route would score identically on bare ground. This one has rocks you
// cannot build on and cannot shoot through, stumps that are the best ground on
// the board, and two landmarks that are solid objects rather than backdrops.
//
// Three lists, kept apart because they answer different questions:
//
//   landmarks   big solid objects -- the depot and the settlement. Non-buildable
//               and sight-blocking, and they are where the route begins and ends.
//   platforms   raised stumps. Premium PLACEMENT, never a stat: a tower on a
//               stump has exactly the range, damage and accuracy it has on dirt.
//               What it buys is a clean spot in a forest that has few of them.
//   blockers    rocks, a fallen trunk, two old tree clusters. They stop building,
//               they stop sight, and they stop bullets.
//
// DECORATIVE FOLIAGE IS NOT IN ANY OF THEM, and that separation is the whole
// design. The forest border is dense on purpose, and if its sprites decided
// what could be built or seen, the map would be unplayable and unpredictable in
// the same stroke -- a player cannot read a placement rule off a tree canopy.
// Gameplay geometry is authored, listed here, and drawn to match. The picture
// follows the rule, never the other way round.
//
// Authored in the same 1280x720 pixel space as every other map and converted
// through AUTHORED_AT_PX_PER_UL exactly once, in Maps.geometryOf below.
Maps.LIST.push({
  id: "ironwood-frontier",
  name: "Ironwood Frontier",
  // A LOGGING TRACK BENDS. The authored points are the shape; the walked and
  // drawn line is a spline through them. No vertex on this route is marked
  // `sharp`, so every one of them is rounded -- see Maps.smoothRoad, where the
  // hard-corner opt-in lives for the boards that will want it.
  curvedRoad: true,
  blurb: ["A logging road through old ironwood.",
          "The depot rolled in overnight."],

  // Fine-detail decals, the last pass over the floor. On the sci-fi boards
  // these are runes and sigils; here they are what a working forest leaves
  // behind -- pollen in the light shafts, a deer skull at the treeline, the
  // husk of a stump that rotted out years before the road was cut.
  decorations: [
    { kind: "motes", x: 520, y: 300, size: 30, color: "196,214,150" },
    { kind: "motes", x: 880, y: 470, size: 26, color: "196,214,150" },
    { kind: "husk",  x: 300, y: 190, size: 24, color: "94,84,60" },
    { kind: "husk",  x: 1060, y: 520, size: 26, color: "94,84,60" },
    { kind: "bones", x: 690, y: 610, size: 18, color: "168,162,142" },
    { kind: "motes", x: 210, y: 430, size: 22, color: "255,186,110" },
    { kind: "bones", x: 1140, y: 350, size: 16, color: "168,162,142" }
  ],

  // East to west: out of the depot's freight door, three switchbacks through
  // the trees, and in at the settlement gate. The first and last points are not
  // arbitrary -- they are the door and the gate, and the landmarks are placed
  // around them rather than the other way round.
  points: [
    { x: 1110, y: 180 }, { x: 980,  y: 180 }, { x: 870,  y: 245 },
    { x: 840,  y: 350 }, { x: 910,  y: 440 }, { x: 820,  y: 520 },
    { x: 665,  y: 515 }, { x: 560,  y: 445 }, { x: 575,  y: 335 },
    { x: 655,  y: 270 }, { x: 610,  y: 190 }, { x: 480,  y: 175 },
    { x: 375,  y: 235 }, { x: 395,  y: 345 }, { x: 470,  y: 415 },
    { x: 410,  y: 480 }, { x: 320,  y: 465 }, { x: 300,  y: 410 },
    { x: 288,  y: 362 }
  ],
  // THE LAST TWO POINTS MOVED, and this is the only place the authored spec was
  // departed from. It asked for (265, 400) then (280, 360) -- and both of those
  // are INSIDE the settlement's octagon, whose east wall stands at x = 285. The
  // road therefore ran THROUGH the village and stopped behind the gate, so
  // enemies walked past the houses to attack the door from the wrong side.
  //
  // (300, 410) and (288, 362) approach the same gate from OUTSIDE and stop on
  // its outer face, inside the authored 330-390 opening. Twelve and twenty
  // authored pixels of movement, which is inside the tolerance the brief allows,
  // and the composition is unchanged: same switchback, same final approach.

  landmarks: [
    {
      id: "enemy-depot",
      shape: "polygon",
      blocksSight: true,
      // Nothing on this board sees over a transport this size, and that is the
      // point of parking it across the road's mouth.
      height: 120,
      points: [[1080, 70], [1235, 88], [1270, 132], [1270, 250],
               [1228, 280], [1110, 285], [1045, 235], [1045, 135]]
    },
    {
      id: "human-settlement",
      shape: "polygon",
      // THE FENCE DOES NOT BLOCK SIGHT. It is mesh and wire, and a rifle shoots
      // through mesh -- so the settlement refuses building without also making
      // its own defenders blind, which is what a solid hull here would do.
      blocksSight: false,
      height: 90,
      points: [[70, 225], [220, 225], [285, 290], [285, 430],
               [220, 505], [70, 505], [20, 430], [20, 290]]
    }
  ],

  // Radii are the STUMP TOP, and every tower in the game fits centred on the
  // smallest of them -- see the platform test in tests/run.js, which measures
  // it against the live catalogue rather than trusting this comment.
  // `height` IS DECLARED HERE, not derived in the renderer, and that is what
  // makes a tower stand ON a stump instead of inside it. The 3D prop and the
  // height field that decides where an actor's feet go both read this number;
  // when the renderer invented its own, the two disagreed and every tower sank.
  //
  // Radii and heights are all different on purpose. Six stumps of one size and
  // one height read as stamped-out furniture; a wood has big old cuts and small
  // young ones. The smallest is still 29, which every tower fits on -- a test
  // measures that against the live catalogue rather than trusting this note.
  platforms: [
    { id: "stump-p1", x: 560,  y: 250, radius: 40, height: 20 },
    { id: "stump-p2", x: 640,  y: 410, radius: 33, height: 13 },
    { id: "stump-p3", x: 820,  y: 430, radius: 36, height: 25 },
    { id: "stump-p4", x: 920,  y: 300, radius: 30, height: 11 },
    { id: "stump-p5", x: 1000, y: 230, radius: 29, height: 17 },
    { id: "stump-p6", x: 320,  y: 330, radius: 34, height: 15 }
  ],

  // EVERY BLOCKER HAS A HEIGHT, and it is a gameplay number before it is a
  // drawing one: a tower standing higher than an obstacle SEES OVER IT. So the
  // five of them are a ladder rather than five equal walls -- the low shelf is
  // cleared from any stump on the board, the fallen log from the two tallest,
  // and the high outcrop and both boulders are cover from everywhere. Stump
  // tops run 11 to 25.
  //
  // THE ROCK IS DRAWN FROM THIS SHAPE. There is no scenery prop beside it with
  // its own size any more -- there was, and the two numbers were about a factor
  // of two apart, so every rock wore an invisible skirt of hitbox. See
  // GLGeometry.solid.
  blockers: [
    { id: "blocker-o1", shape: "circle", x: 365, y: 405, radius: 48, height: 44 },
    { id: "blocker-o2", shape: "polygon", height: 30,
      points: [[428, 280], [455, 260], [495, 274],
               [512, 310], [482, 335], [440, 323]] },
    // A CAPSULE'S HEIGHT IS TWICE ITS RADIUS, always: it is a log lying on the
    // ground with a circular cross-section, so its crown is one diameter up.
    // Test 22 pins that, because any other pairing draws a log that is not the
    // shape a shot collides with.
    { id: "blocker-o3", shape: "capsule", height: 18,
      a: { x: 686, y: 402 }, b: { x: 794, y: 368 }, radius: 9 },
    { id: "blocker-o4", shape: "circle", x: 1010, y: 340, radius: 46, height: 38 },
    { id: "blocker-o5", shape: "polygon", height: 10,
      points: [[725, 245], [744, 216], [780, 218],
               [798, 247], [780, 278], [743, 282], [720, 262]] }
  ],

  // Stable ids for the settlement's buildings. Destruction is a LATER task and
  // deliberately not implemented here -- what this list buys now is that when
  // it arrives, it has something to address. A prop that has to be given an id
  // at the same time it is given hit points is a prop whose id ends up being
  // its array index.
  settlementProps: [
    { id: "settlement-gate",   x: 285, y: 360, w: 14, h: 60, kind: "palisade-gate" },
    { id: "townhall",          x: 150, y: 362, w: 78, h: 62, kind: "townhall" },
    { id: "house-northwest",   x: 78,  y: 268, w: 52, h: 40, kind: "house" },
    { id: "house-north",       x: 160, y: 258, w: 58, h: 38, kind: "house" },
    { id: "house-west",        x: 52,  y: 350, w: 44, h: 46, kind: "house" },
    { id: "house-southwest",   x: 82,  y: 448, w: 56, h: 40, kind: "house" },
    { id: "storehouse-south",  x: 178, y: 458, w: 68, h: 44, kind: "storehouse" },
    { id: "workshop-east",     x: 232, y: 300, w: 46, h: 44, kind: "workshop" }
  ]
});

// --- compiled map geometry -------------------------------------------------
//
// The authored lists above are in PIXELS. Everything that asks a question about
// them -- placement, sight, bullets, the difficulty sampler, both renderers --
// works in WORLD coordinates, and the conversion has to happen exactly once or
// the map quietly changes size depending on who asked.
//
// So it happens here, on first use, and the result is cached. The cache key
// carries UNIT_LENGTH as well as the map id, because retuning the unit rescales
// the whole board and a stale cache would leave the rocks behind while the road
// moved -- which is precisely the class of bug the u.l. system exists to stop.
//
// A MAP WITH NO GEOMETRY GETS THE SAME FROZEN EMPTY OBJECT every time. Six of
// the seven maps are in that case, and it is what makes them pay nothing: every
// consumer starts with a `.length` test that is false on a shared empty array,
// so there is no per-frame allocation and no per-shape loop for them at all.
var EMPTY_GEOMETRY = {
  blockers: [], sightBlockers: [], noBuild: [], platforms: [], any: false
};

var geometryCache = null;

function scalePoint(p) {
  return { x: ul(p.x / AUTHORED_AT_PX_PER_UL), y: ul(p.y / AUTHORED_AT_PX_PER_UL) };
}

function scaleShape(shape) {
  var out = { id: shape.id, shape: shape.shape };
  // How high it stands, in the same world units as everything else. A shape
  // with no height declared is treated as tall enough that nothing clears it,
  // which is what the six older boards want: they have no elevation at all.
  out.height = shape.height === undefined
    ? Infinity : ul(shape.height / AUTHORED_AT_PX_PER_UL);
  if (shape.shape === "circle") {
    out.x = ul(shape.x / AUTHORED_AT_PX_PER_UL);
    out.y = ul(shape.y / AUTHORED_AT_PX_PER_UL);
    out.radius = ul(shape.radius / AUTHORED_AT_PX_PER_UL);
  } else if (shape.shape === "capsule") {
    out.a = scalePoint(shape.a);
    out.b = scalePoint(shape.b);
    out.radius = ul(shape.radius / AUTHORED_AT_PX_PER_UL);
  } else if (shape.shape === "polygon") {
    out.points = shape.points.map(function (pt) {
      return [ul(pt[0] / AUTHORED_AT_PX_PER_UL), ul(pt[1] / AUTHORED_AT_PX_PER_UL)];
    });
  }
  return out;
}

// The world-space geometry for a map, built once and kept.
Maps.geometryOf = function (map) {
  if (!map) return EMPTY_GEOMETRY;
  var hasAny = (map.blockers && map.blockers.length) ||
               (map.landmarks && map.landmarks.length) ||
               (map.platforms && map.platforms.length);
  if (!hasAny) return EMPTY_GEOMETRY;

  var key = map.id + "@" + UNIT_LENGTH;
  if (geometryCache && geometryCache.key === key) return geometryCache.value;

  var blockers = (map.blockers || []).map(scaleShape);
  var landmarks = (map.landmarks || []).map(function (l) {
    var scaled = scaleShape(l);
    scaled.blocksSight = !!l.blocksSight;
    scaled.landmark = true;
    return scaled;
  });
  var platforms = (map.platforms || []).map(function (pf) {
    return {
      id: pf.id,
      x: ul(pf.x / AUTHORED_AT_PX_PER_UL),
      y: ul(pf.y / AUTHORED_AT_PX_PER_UL),
      radius: ul(pf.radius / AUTHORED_AT_PX_PER_UL),
      // The top surface, in world units. One number, read by the prop that
      // draws the stump and by the height field that stands actors on it.
      height: ul((pf.height || 16) / AUTHORED_AT_PX_PER_UL)
    };
  });

  var value = {
    blockers: blockers,
    // What stops a sight line: every blocker, the landmarks that are solid, and
    // THE STUMPS. A stump is a metre of standing timber; it was cover from the
    // day it was drawn and it took a playtest to notice it was not acting like
    // any. The fence is mesh and is deliberately absent.
    //
    // Each carries its height, and a line is only stopped by a shape STANDING
    // HIGHER than the eye that cast it -- so a tower up on a stump looks down
    // over the other five, over the low shelf, and from the two tallest, over
    // the fallen log as well.
    sightBlockers: blockers.concat(landmarks.filter(function (l) {
      return l.blocksSight;
    })).concat(platforms.map(function (pf) {
      return { id: pf.id, shape: "circle", x: pf.x, y: pf.y,
               radius: pf.radius, height: pf.height, platform: true };
    })),
    // What refuses a tower: every blocker AND every landmark, sight or no sight.
    // You cannot build inside the settlement even though you can shoot across it.
    noBuild: blockers.concat(landmarks),
    platforms: platforms,
    any: true
  };

  geometryCache = { key: key, value: value };
  return value;
};

// HOW HIGH THE GROUND IS UNDER A POINT, in world units. Zero on dirt, the
// stump's top on a stump. One number, and it is the whole of a tower's
// elevation: it decides what the tower can see over and how far it can reach.
Maps.groundHeightAt = function (map, x, y) {
  var geo = Maps.geometryOf(map);
  for (var i = 0; i < geo.platforms.length; i++) {
    var pf = geo.platforms[i];
    var dx = x - pf.x, dy = y - pf.y;
    if (dx * dx + dy * dy <= pf.radius * pf.radius) return pf.height;
  }
  return 0;
};

// Drop the cache. Called when a run loads a map, so switching routes cannot
// leave the previous map's rocks standing on the new one.
Maps.resetGeometry = function () { geometryCache = null; };

// A DRAWN road, curved, from an authored one that is not.
//
// PRESENTATION ONLY, and that is the whole contract. Enemies walk the authored
// polyline, towers measure distance to the authored polyline, the difficulty
// sampler samples the authored polyline, and build clearance is measured
// against it. Nothing here is ever handed to any of them -- this exists because
// a forest track that turns in eighteen hard corners reads as an electrical
// circuit, which is precisely what the brief says it must not.
//
// Centripetal Catmull-Rom through the authored points: it passes exactly
// THROUGH each one, so the curve never wanders away from the line the enemies
// actually walk, and it cannot overshoot into a corner the way a uniform spline
// does on a tight switchback. The ends are extended by reflecting the first and
// last segments, so the road does not straighten out just before the depot ramp
// and the settlement gate.
Maps.smoothRoad = function (points, perSegment) {
  if (!points || points.length < 3) return points;
  var floorSteps = perSegment || 8;
  var i;

  // WHICH VERTICES ARE CORNERS -- and it is the AUTHOR who says so, not a
  // measurement of the angle.
  //
  // The first version classified by turn angle: anything sharper than sixty-
  // eight degrees kept its edge. That is a rule about the shape of the road,
  // and the shape of the road is a decision, not a fact -- it took a track the
  // owner had already accepted as natural and put four hard angles back into it
  // on its own, which is exactly the report that killed it: "the path changed
  // and now has weird angles sometimes; the goal was not to change the path".
  //
  // So the capability stays and the guessing goes. A vertex marked `sharp: true`
  // in the map data keeps its angle -- its control point is DUPLICATED, which is
  // what makes a Catmull-Rom arrive along the straight segment and leave along
  // the next one with an edge between them. Every unmarked vertex is rounded.
  // A board that wants a hairpin asks for a hairpin.
  var corner = [];
  for (i = 0; i < points.length; i++) {
    corner.push(i === 0 || i === points.length - 1 || points[i].sharp === true);
  }

  function ctrl(i) {
    var j = Math.max(0, Math.min(points.length - 1, i));
    return points[j];
  }

  var out = [points[0]];
  for (i = 0; i < points.length - 1; i++) {
    // At a corner, the neighbouring control collapses onto the vertex, so the
    // curve leaves and arrives along the straight segments and the angle
    // survives.
    var p0 = corner[i] ? points[i] : ctrl(i - 1);
    var p1 = points[i];
    var p2 = points[i + 1];
    var p3 = corner[i + 1] ? points[i + 1] : ctrl(i + 2);
    var flat = corner[i] && corner[i + 1];
    // SUBDIVIDED BY LENGTH, not by a flat count per span. A fixed six steps is
    // plenty across a forty-pixel bend and visibly faceted across a two-hundred
    // pixel sweep, and this route has both -- which is what the long straightish
    // runs looked like on screen: a curve made of chords.
    var span = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    var n = flat ? 1                          // both ends hard: keep it straight
      : Math.max(floorSteps, Math.ceil(span / Maps.ROAD_CHORD_PX));
    for (var sIdx = 1; sIdx <= n; sIdx++) {
      var t = sIdx / n, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
             (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
             (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
             (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
             (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      });
    }
  }
  return out;
};

// Longest chord the smoothed road is allowed to be drawn and walked in. Small
// enough that no bend on any board reads as a sequence of straight lines,
// large enough that a straight run does not become a hundred redundant points.
Maps.ROAD_CHORD_PX = 6;

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
  // --- Ironwood Frontier ---------------------------------------------------
  //
  // The other six boards are lit from inside: a ley line, a reactor, a bank of
  // servers. This one has no light of its own. What it has is a clearing at
  // dusk, one warm settlement at the west end and one cold machine at the east,
  // and the whole read of the map is that those two things do not belong to the
  // same world.
  //
  // COLOUR CARRIES THE STORY, NOT THE GAMEPLAY. The road is packed earth, the
  // floor is moss over dirt, the depot is oxidised steel under red work lamps
  // and the settlement is timber under amber ones. Nothing on this board is
  // painted a gameplay colour: the rocks are rock-coloured and the stumps are
  // wood-coloured, and they are readable because of where they sit and how they
  // are lit, not because they are magenta. See the blockers list on the map
  // itself for what is actually solid.
  "ironwood-frontier": {
    theme: {
      background: "#080a07", floor: "#1b2416", panel: "#26301c",
      panelDark: "#141c10", panelLine: "78,96,58", accent: "255,150,64",
      accent2: "150,196,120", metal: "#4b4535", metalDark: "#1e1a12",
      // STONE, and it is its own colour rather than a machine colour reused.
      // The blockers were drawn in `panel` and `metal` and came out darker than
      // the forest floor they stand on -- five rocks you could walk into and
      // not see. Rock catches more light than leaf litter; these say so.
      //
      // And these lines were on the WRONG THEME for a commit: they went onto
      // the map above this one, which has neither a rock nor a hill on it, so
      // every one of them fell back to the machine colours and nothing changed.
      rock: "#7c7361", rockDark: "#443d30",
      // THE HILLS ON THE HORIZON, and they are PALE. Drawn in `metalDark` they
      // were a black cut-out against a light sky, which reads as a hole in the
      // world rather than as distance -- everything far away goes TOWARD the
      // haze, not away from it. This sits between the fog and the sky.
      ridge: "#7d94a6", ridgeDark: "#65809a",
      roadOuter: "#221a10", roadInner: "#4a3520",
      roadEdge: "120,94,58", roadCenter: "156,124,78",
      wild: true,
      // THE GROUND RUNS PAST ANYTHING THE CAMERA CAN SEE, and the far edge
      // dissolves into the mist rather than ending on a line. Without both of
      // these the board reads as a lit rectangle floating in a void -- a tray
      // with a forest printed on it, which is what the first pass looked like
      // the moment it was orbited.
      apron: 4600,
      horizon: true,
      // PLACEHOLDER SKY. The board had no horizon at all -- the ground faded
      // into a near-black void, which reads as a tray however much forest is on
      // it. A daylight blue is deliberately a stand-in: it is here to prove the
      // horizon works and to be replaced by real sky art.
      sky: "#8fb4cf",
      // Thinner than the dead forest's: this board is at dusk rather than in
      // fog, and the depth cue wanted is distance, not weather. Raised from
      // 0.00015 once the ground ran further -- the extra distance is what the
      // haze is FOR. Backed off again from 0.00042, which fogged the CLEARING
      // as well as the treeline and turned the playable half of the board into
      // flat green: the mist has to eat the horizon and leave the fight alone.
      // The mist is pulled toward the sky rather than toward the floor, so the
      // far treeline dissolves INTO the horizon instead of stopping against it.
      //
      // DENSITY IS THE HARD PART AND IT HAS BEEN WRONG IN BOTH DIRECTIONS. At
      // 0.00026 against a sky-coloured mist the whole board went blue-grey --
      // the clearing, the road and the settlement all fogged, which is not
      // weather, it is a wash. At 0.00015 the far treeline stayed sharp and the
      // horizon drew a line again. 0.00009 with the mist LOW to the ground puts
      // the haze where distance is and leaves the fight in front of the camera
      // alone: the dirt reads as dirt and the far stems still dissolve.
      fog: { color: "#7d99ad", density: 0.00009, height: 46 }
    },
    // Bare-earth clearings at floor height -- scraped ground where the road has
    // been worked and where the fighting happens. They are PATCHES, not decks:
    // no height, so they can never become an invisible no-build ring.
    zones: [
      { kind: "dirt", x: 470, y: 210, w: 320, h: 190 },
      { kind: "dirt", x: 600, y: 390, w: 340, h: 200 },
      { kind: "dirt", x: 880, y: 200, w: 260, h: 200 },
      { kind: "dirt", x: 250, y: 330, w: 220, h: 210 }
    ],
    models: [
      // THE TREELINE IS THE FRAME. Most of it stands outside the 1280x720 play
      // area, on the 120-unit apron the 3D board is built with, where a stem can
      // never hide a tower, an enemy or a build spot. Sizes, rotations and
      // positions are all scattered -- a forest of identical trees on a grid is
      // the single fastest way to make a board look like a debug scene.
      //
      // ITS OWN SPECIES, AND THAT IS THE POINT. This board does not reuse the
      // dead-forest vocabulary from the other wild map: those are bare snapped
      // stems on black dirt, and Ironwood is a LIVING wood -- buttressed
      // trunks, layered canopies, ferns and moss-capped rock. Sharing prop
      // kinds would have made the two boards read as one location with the
      // lights changed, which is the failure the flagship brief names first.


      // THE WOOD CLOSING IN, belt by belt, out past where the camera can go.
      //
      // A board with no skybox takes its horizon from the forest itself, and
      // the forest only works as one if it runs PAST the camera. It did not:
      // at the flattest pitch and full zoom-out the eye ends up about 1900
      // units outside the clearing, which was beyond the whole treeline and
      // in among the hills -- the board went black behind one seen from two
      // hundred units away.
      //
      // So there are two halves to this. Out to 1800 the stems stay MODEST,
      // because that band is where the eye can actually be and a canopy the
      // size of a house at fifty units is a black screen. From 2300 out they
      // are enormous, and they can be, because nothing can get in among them.
      // Same trick as the ridge line and cheaper: something far away and big
      // reads as distance, and the camera never gets to check.
      //
      // Generated from a fixed seed, not hand-placed -- nine hundred trees is
      // not a thing to author by hand, and not a thing to randomise at load,
      // because a forest that reshuffles every run is not a place.

      // belt at 130, stems about 50
      { kind: "ironwood", x: -63, y: -108, size: 49, rotation: 3.88 },
      { kind: "ironwood", x: -43, y: -144, size: 43, rotation: 0.06 },
      { kind: "ironwood", x: 95, y: -150, size: 52, rotation: 5.54 },
      { kind: "ironwood", x: 141, y: -153, size: 51, rotation: 3.45 },
      { kind: "ironwood", x: 191, y: -99, size: 44, rotation: 2.91 },
      { kind: "ironwood", x: 323, y: -137, size: 59, rotation: 2.54 },
      { kind: "ironwood", x: 383, y: -165, size: 47, rotation: 3.43 },
      { kind: "ironwood", x: 467, y: -94, size: 44, rotation: 1.91 },
      { kind: "ironwood", x: 508, y: -143, size: 58, rotation: 4.83 },
      { kind: "ironwood", x: 581, y: -87, size: 47, rotation: 4.45 },
      { kind: "ironwood", x: 706, y: -83, size: 49, rotation: 0.58 },
      { kind: "ironwood", x: 784, y: -165, size: 49, rotation: 0.70 },
      { kind: "ironwood", x: 837, y: -96, size: 53, rotation: 1.57 },
      { kind: "ironwood", x: 892, y: -131, size: 58, rotation: 1.86 },
      { kind: "ironwood", x: 971, y: -151, size: 54, rotation: 5.63 },
      { kind: "ironwood", x: 1090, y: -100, size: 60, rotation: 2.49 },
      { kind: "ironwood", x: 1148, y: -70, size: 59, rotation: 0.28 },
      { kind: "ironwood", x: 1246, y: -70, size: 53, rotation: 0.69 },
      { kind: "ironwood", x: 1303, y: -140, size: 53, rotation: 5.55 },
      { kind: "ironwood", x: 1386, y: -131, size: 60, rotation: 5.59 },
      { kind: "ironwood", x: 1368, y: -85, size: 46, rotation: 3.57 },
      { kind: "ironwood", x: 1353, y: 21, size: 47, rotation: 3.03 },
      { kind: "ironwood", x: 1428, y: 53, size: 50, rotation: 0.48 },
      { kind: "ironwood", x: 1401, y: 126, size: 42, rotation: 4.01 },
      { kind: "ironwood", x: 1361, y: 225, size: 43, rotation: 4.64 },
      { kind: "ironwood", x: 1370, y: 303, size: 44, rotation: 2.14 },
      { kind: "ironwood", x: 1390, y: 419, size: 54, rotation: 3.18 },
      { kind: "ironwood", x: 1350, y: 428, size: 62, rotation: 2.52 },
      { kind: "ironwood", x: 1417, y: 529, size: 54, rotation: 3.69 },
      { kind: "ironwood", x: 1387, y: 650, size: 59, rotation: 4.86 },
      { kind: "ironwood", x: 1344, y: 681, size: 47, rotation: 3.22 },
      { kind: "ironwood", x: 1423, y: 796, size: 49, rotation: 2.53 },
      { kind: "ironwood", x: 1365, y: 786, size: 57, rotation: 1.51 },
      { kind: "ironwood", x: 1340, y: 878, size: 46, rotation: 6.20 },
      { kind: "ironwood", x: 1223, y: 860, size: 41, rotation: 2.54 },
      { kind: "ironwood", x: 1185, y: 846, size: 56, rotation: 2.96 },
      { kind: "ironwood", x: 1086, y: 850, size: 44, rotation: 1.68 },
      { kind: "ironwood", x: 1023, y: 865, size: 54, rotation: 3.92 },
      { kind: "ironwood", x: 917, y: 804, size: 63, rotation: 3.20 },
      { kind: "ironwood", x: 838, y: 863, size: 46, rotation: 3.47 },
      { kind: "ironwood", x: 822, y: 792, size: 45, rotation: 2.63 },
      { kind: "ironwood", x: 688, y: 847, size: 56, rotation: 2.95 },
      { kind: "ironwood", x: 605, y: 871, size: 45, rotation: 3.70 },
      { kind: "ironwood", x: 553, y: 809, size: 42, rotation: 3.75 },
      { kind: "ironwood", x: 500, y: 848, size: 46, rotation: 4.56 },
      { kind: "ironwood", x: 418, y: 838, size: 53, rotation: 3.24 },
      { kind: "ironwood", x: 356, y: 805, size: 56, rotation: 3.96 },
      { kind: "ironwood", x: 218, y: 841, size: 45, rotation: 5.15 },
      { kind: "ironwood", x: 170, y: 850, size: 50, rotation: 6.20 },
      { kind: "ironwood", x: 127, y: 863, size: 60, rotation: 2.63 },
      { kind: "ironwood", x: -18, y: 809, size: 49, rotation: 0.10 },
      { kind: "ironwood", x: -85, y: 878, size: 41, rotation: 2.10 },
      { kind: "ironwood", x: -90, y: 817, size: 61, rotation: 3.88 },
      { kind: "ironwood", x: -114, y: 731, size: 43, rotation: 2.01 },
      { kind: "ironwood", x: -88, y: 695, size: 60, rotation: 0.42 },
      { kind: "ironwood", x: -144, y: 632, size: 50, rotation: 1.08 },
      { kind: "ironwood", x: -91, y: 499, size: 49, rotation: 5.56 },
      { kind: "ironwood", x: -66, y: 429, size: 58, rotation: 0.30 },
      { kind: "ironwood", x: -163, y: 357, size: 48, rotation: 6.03 },
      { kind: "ironwood", x: -147, y: 278, size: 63, rotation: 4.16 },
      { kind: "ironwood", x: -126, y: 228, size: 61, rotation: 3.22 },
      { kind: "ironwood", x: -110, y: 132, size: 45, rotation: 4.30 },
      { kind: "ironwood", x: -91, y: 41, size: 62, rotation: 0.12 },
      { kind: "ironwood", x: -74, y: -34, size: 58, rotation: 1.23 },
      { kind: "ironwood", x: -73, y: -84, size: 45, rotation: 4.12 },

      // belt at 300, stems about 58
      { kind: "ironwood", x: -211, y: -268, size: 57, rotation: 2.43 },
      { kind: "ironwood", x: -149, y: -251, size: 67, rotation: 4.57 },
      { kind: "ironwood", x: -95, y: -248, size: 48, rotation: 3.20 },
      { kind: "ironwood", x: 0, y: -237, size: 59, rotation: 3.92 },
      { kind: "ironwood", x: 58, y: -253, size: 59, rotation: 2.90 },
      { kind: "ironwood", x: 181, y: -213, size: 58, rotation: 4.35 },
      { kind: "ironwood", x: 276, y: -260, size: 59, rotation: 3.12 },
      { kind: "ironwood", x: 391, y: -300, size: 73, rotation: 3.46 },
      { kind: "ironwood", x: 422, y: -248, size: 51, rotation: 3.16 },
      { kind: "ironwood", x: 541, y: -245, size: 66, rotation: 6.13 },
      { kind: "ironwood", x: 586, y: -253, size: 55, rotation: 1.08 },
      { kind: "ironwood", x: 670, y: -252, size: 71, rotation: 5.08 },
      { kind: "ironwood", x: 828, y: -297, size: 51, rotation: 1.45 },
      { kind: "ironwood", x: 900, y: -268, size: 61, rotation: 0.28 },
      { kind: "ironwood", x: 981, y: -313, size: 59, rotation: 2.14 },
      { kind: "ironwood", x: 1049, y: -231, size: 51, rotation: 2.70 },
      { kind: "ironwood", x: 1178, y: -297, size: 58, rotation: 4.72 },
      { kind: "ironwood", x: 1254, y: -238, size: 58, rotation: 2.80 },
      { kind: "ironwood", x: 1325, y: -239, size: 60, rotation: 1.88 },
      { kind: "ironwood", x: 1396, y: -258, size: 68, rotation: 6.17 },
      { kind: "ironwood", x: 1453, y: -211, size: 59, rotation: 5.36 },
      { kind: "ironwood", x: 1592, y: -246, size: 54, rotation: 3.61 },
      { kind: "ironwood", x: 1515, y: -155, size: 66, rotation: 5.06 },
      { kind: "ironwood", x: 1540, y: -133, size: 56, rotation: 3.33 },
      { kind: "ironwood", x: 1494, y: -33, size: 51, rotation: 4.22 },
      { kind: "ironwood", x: 1546, y: 27, size: 53, rotation: 5.04 },
      { kind: "ironwood", x: 1540, y: 176, size: 47, rotation: 2.78 },
      { kind: "ironwood", x: 1533, y: 266, size: 49, rotation: 5.94 },
      { kind: "ironwood", x: 1563, y: 307, size: 66, rotation: 4.59 },
      { kind: "ironwood", x: 1503, y: 369, size: 57, rotation: 6.24 },
      { kind: "ironwood", x: 1513, y: 500, size: 67, rotation: 2.18 },
      { kind: "ironwood", x: 1512, y: 557, size: 49, rotation: 3.87 },
      { kind: "ironwood", x: 1600, y: 649, size: 53, rotation: 2.31 },
      { kind: "ironwood", x: 1548, y: 718, size: 55, rotation: 2.45 },
      { kind: "ironwood", x: 1563, y: 804, size: 53, rotation: 1.98 },
      { kind: "ironwood", x: 1487, y: 884, size: 58, rotation: 3.26 },
      { kind: "ironwood", x: 1576, y: 973, size: 62, rotation: 3.26 },
      { kind: "ironwood", x: 1445, y: 938, size: 61, rotation: 5.49 },
      { kind: "ironwood", x: 1368, y: 946, size: 57, rotation: 1.75 },
      { kind: "ironwood", x: 1336, y: 1006, size: 64, rotation: 4.16 },
      { kind: "ironwood", x: 1223, y: 940, size: 57, rotation: 5.59 },
      { kind: "ironwood", x: 1141, y: 973, size: 68, rotation: 3.79 },
      { kind: "ironwood", x: 1062, y: 965, size: 50, rotation: 1.04 },
      { kind: "ironwood", x: 1003, y: 947, size: 47, rotation: 5.79 },
      { kind: "ironwood", x: 917, y: 986, size: 71, rotation: 3.16 },
      { kind: "ironwood", x: 792, y: 1030, size: 52, rotation: 0.18 },
      { kind: "ironwood", x: 690, y: 951, size: 63, rotation: 0.83 },
      { kind: "ironwood", x: 588, y: 1024, size: 63, rotation: 1.42 },
      { kind: "ironwood", x: 547, y: 959, size: 69, rotation: 3.81 },
      { kind: "ironwood", x: 436, y: 939, size: 57, rotation: 1.70 },
      { kind: "ironwood", x: 339, y: 1034, size: 58, rotation: 0.99 },
      { kind: "ironwood", x: 294, y: 968, size: 57, rotation: 0.90 },
      { kind: "ironwood", x: 163, y: 978, size: 66, rotation: 6.13 },
      { kind: "ironwood", x: 75, y: 955, size: 56, rotation: 5.57 },
      { kind: "ironwood", x: -30, y: 1012, size: 61, rotation: 0.25 },
      { kind: "ironwood", x: -61, y: 1036, size: 47, rotation: 5.17 },
      { kind: "ironwood", x: -158, y: 1026, size: 60, rotation: 3.62 },
      { kind: "ironwood", x: -247, y: 1042, size: 58, rotation: 0.09 },
      { kind: "ironwood", x: -248, y: 935, size: 55, rotation: 4.64 },
      { kind: "ironwood", x: -315, y: 854, size: 61, rotation: 2.02 },
      { kind: "ironwood", x: -308, y: 815, size: 71, rotation: 3.83 },
      { kind: "ironwood", x: -312, y: 735, size: 65, rotation: 5.46 },
      { kind: "ironwood", x: -296, y: 650, size: 51, rotation: 0.71 },
      { kind: "ironwood", x: -302, y: 528, size: 50, rotation: 1.90 },
      { kind: "ironwood", x: -229, y: 470, size: 62, rotation: 5.84 },
      { kind: "ironwood", x: -213, y: 382, size: 66, rotation: 4.03 },
      { kind: "ironwood", x: -245, y: 278, size: 54, rotation: 0.14 },
      { kind: "ironwood", x: -270, y: 201, size: 60, rotation: 0.70 },
      { kind: "ironwood", x: -238, y: 111, size: 53, rotation: 5.25 },
      { kind: "ironwood", x: -209, y: 2, size: 49, rotation: 4.76 },
      { kind: "ironwood", x: -241, y: -48, size: 53, rotation: 5.08 },
      { kind: "ironwood", x: -239, y: -161, size: 55, rotation: 1.41 },
      { kind: "ironwood", x: -318, y: -260, size: 63, rotation: 1.51 },

      // belt at 500, stems about 68
      { kind: "ironwood", x: -402, y: -442, size: 67, rotation: 0.34 },
      { kind: "ironwood", x: -332, y: -394, size: 83, rotation: 0.52 },
      { kind: "ironwood", x: -229, y: -383, size: 74, rotation: 3.46 },
      { kind: "ironwood", x: -150, y: -402, size: 64, rotation: 4.82 },
      { kind: "ironwood", x: -18, y: -385, size: 75, rotation: 2.69 },
      { kind: "ironwood", x: 34, y: -414, size: 67, rotation: 3.36 },
      { kind: "ironwood", x: 185, y: -405, size: 55, rotation: 1.95 },
      { kind: "ironwood", x: 234, y: -493, size: 75, rotation: 2.78 },
      { kind: "ironwood", x: 377, y: -494, size: 56, rotation: 3.92 },
      { kind: "ironwood", x: 489, y: -466, size: 63, rotation: 2.07 },
      { kind: "ironwood", x: 527, y: -377, size: 58, rotation: 4.43 },
      { kind: "ironwood", x: 609, y: -480, size: 62, rotation: 3.51 },
      { kind: "ironwood", x: 727, y: -436, size: 74, rotation: 1.22 },
      { kind: "ironwood", x: 846, y: -492, size: 63, rotation: 3.39 },
      { kind: "ironwood", x: 910, y: -430, size: 67, rotation: 0.64 },
      { kind: "ironwood", x: 1037, y: -438, size: 68, rotation: 0.92 },
      { kind: "ironwood", x: 1128, y: -429, size: 68, rotation: 2.14 },
      { kind: "ironwood", x: 1242, y: -505, size: 85, rotation: 3.78 },
      { kind: "ironwood", x: 1372, y: -432, size: 83, rotation: 0.65 },
      { kind: "ironwood", x: 1399, y: -448, size: 60, rotation: 5.81 },
      { kind: "ironwood", x: 1539, y: -382, size: 80, rotation: 5.81 },
      { kind: "ironwood", x: 1577, y: -416, size: 58, rotation: 3.50 },
      { kind: "ironwood", x: 1715, y: -473, size: 67, rotation: 4.70 },
      { kind: "ironwood", x: 1675, y: -389, size: 73, rotation: 1.39 },
      { kind: "ironwood", x: 1694, y: -319, size: 70, rotation: 5.45 },
      { kind: "ironwood", x: 1728, y: -207, size: 75, rotation: 4.09 },
      { kind: "ironwood", x: 1761, y: -90, size: 65, rotation: 0.51 },
      { kind: "ironwood", x: 1745, y: -35, size: 73, rotation: 1.61 },
      { kind: "ironwood", x: 1767, y: 82, size: 69, rotation: 5.61 },
      { kind: "ironwood", x: 1680, y: 140, size: 84, rotation: 1.98 },
      { kind: "ironwood", x: 1698, y: 273, size: 79, rotation: 0.69 },
      { kind: "ironwood", x: 1656, y: 391, size: 68, rotation: 5.15 },
      { kind: "ironwood", x: 1772, y: 482, size: 80, rotation: 4.26 },
      { kind: "ironwood", x: 1712, y: 575, size: 68, rotation: 3.28 },
      { kind: "ironwood", x: 1659, y: 633, size: 57, rotation: 0.74 },
      { kind: "ironwood", x: 1655, y: 803, size: 82, rotation: 1.98 },
      { kind: "ironwood", x: 1664, y: 884, size: 66, rotation: 2.26 },
      { kind: "ironwood", x: 1702, y: 944, size: 77, rotation: 3.25 },
      { kind: "ironwood", x: 1775, y: 1020, size: 70, rotation: 2.37 },
      { kind: "ironwood", x: 1715, y: 1118, size: 75, rotation: 1.06 },
      { kind: "ironwood", x: 1668, y: 1215, size: 67, rotation: 2.65 },
      { kind: "ironwood", x: 1555, y: 1171, size: 82, rotation: 5.78 },
      { kind: "ironwood", x: 1526, y: 1197, size: 81, rotation: 1.35 },
      { kind: "ironwood", x: 1444, y: 1142, size: 63, rotation: 3.94 },
      { kind: "ironwood", x: 1344, y: 1171, size: 79, rotation: 5.99 },
      { kind: "ironwood", x: 1247, y: 1125, size: 62, rotation: 1.34 },
      { kind: "ironwood", x: 1109, y: 1120, size: 75, rotation: 2.88 },
      { kind: "ironwood", x: 1048, y: 1174, size: 63, rotation: 5.85 },
      { kind: "ironwood", x: 931, y: 1219, size: 72, rotation: 1.87 },
      { kind: "ironwood", x: 860, y: 1127, size: 76, rotation: 3.69 },
      { kind: "ironwood", x: 701, y: 1204, size: 71, rotation: 1.69 },
      { kind: "ironwood", x: 594, y: 1223, size: 79, rotation: 5.32 },
      { kind: "ironwood", x: 499, y: 1121, size: 57, rotation: 0.28 },
      { kind: "ironwood", x: 433, y: 1123, size: 85, rotation: 1.13 },
      { kind: "ironwood", x: 361, y: 1117, size: 63, rotation: 2.11 },
      { kind: "ironwood", x: 270, y: 1178, size: 68, rotation: 3.72 },
      { kind: "ironwood", x: 157, y: 1186, size: 82, rotation: 2.73 },
      { kind: "ironwood", x: 42, y: 1141, size: 80, rotation: 4.26 },
      { kind: "ironwood", x: -99, y: 1165, size: 81, rotation: 2.83 },
      { kind: "ironwood", x: -143, y: 1204, size: 82, rotation: 0.82 },
      { kind: "ironwood", x: -221, y: 1115, size: 82, rotation: 0.71 },
      { kind: "ironwood", x: -349, y: 1104, size: 85, rotation: 1.85 },
      { kind: "ironwood", x: -404, y: 1172, size: 63, rotation: 2.88 },
      { kind: "ironwood", x: -395, y: 1134, size: 64, rotation: 5.23 },
      { kind: "ironwood", x: -431, y: 973, size: 84, rotation: 1.67 },
      { kind: "ironwood", x: -482, y: 900, size: 58, rotation: 0.82 },
      { kind: "ironwood", x: -391, y: 827, size: 66, rotation: 3.62 },
      { kind: "ironwood", x: -378, y: 758, size: 76, rotation: 3.27 },
      { kind: "ironwood", x: -426, y: 658, size: 79, rotation: 0.84 },
      { kind: "ironwood", x: -411, y: 523, size: 75, rotation: 5.68 },
      { kind: "ironwood", x: -409, y: 486, size: 65, rotation: 0.65 },
      { kind: "ironwood", x: -456, y: 332, size: 55, rotation: 5.62 },
      { kind: "ironwood", x: -425, y: 277, size: 65, rotation: 5.65 },
      { kind: "ironwood", x: -376, y: 120, size: 66, rotation: 0.33 },
      { kind: "ironwood", x: -385, y: 42, size: 64, rotation: 3.04 },
      { kind: "ironwood", x: -397, y: -9, size: 70, rotation: 1.97 },
      { kind: "ironwood", x: -502, y: -108, size: 63, rotation: 5.95 },
      { kind: "ironwood", x: -429, y: -221, size: 81, rotation: 1.33 },
      { kind: "ironwood", x: -436, y: -338, size: 76, rotation: 4.78 },
      { kind: "ironwood", x: -459, y: -392, size: 66, rotation: 6.10 },

      // belt at 740, stems about 80
      { kind: "ironwood", x: -609, y: -651, size: 70, rotation: 6.09 },
      { kind: "ironwood", x: -541, y: -588, size: 88, rotation: 2.64 },
      { kind: "ironwood", x: -403, y: -637, size: 96, rotation: 0.70 },
      { kind: "ironwood", x: -259, y: -642, size: 87, rotation: 2.92 },
      { kind: "ironwood", x: -180, y: -671, size: 93, rotation: 2.95 },
      { kind: "ironwood", x: -98, y: -672, size: 89, rotation: 1.82 },
      { kind: "ironwood", x: -27, y: -652, size: 84, rotation: 5.57 },
      { kind: "ironwood", x: 171, y: -662, size: 73, rotation: 5.07 },
      { kind: "ironwood", x: 218, y: -675, size: 92, rotation: 5.37 },
      { kind: "ironwood", x: 334, y: -693, size: 84, rotation: 4.53 },
      { kind: "ironwood", x: 516, y: -628, size: 98, rotation: 0.11 },
      { kind: "ironwood", x: 598, y: -700, size: 98, rotation: 0.80 },
      { kind: "ironwood", x: 730, y: -709, size: 82, rotation: 0.11 },
      { kind: "ironwood", x: 820, y: -608, size: 66, rotation: 1.17 },
      { kind: "ironwood", x: 949, y: -631, size: 83, rotation: 3.26 },
      { kind: "ironwood", x: 1073, y: -711, size: 99, rotation: 2.84 },
      { kind: "ironwood", x: 1176, y: -691, size: 79, rotation: 4.72 },
      { kind: "ironwood", x: 1302, y: -721, size: 77, rotation: 6.12 },
      { kind: "ironwood", x: 1360, y: -646, size: 66, rotation: 2.65 },
      { kind: "ironwood", x: 1457, y: -694, size: 82, rotation: 4.57 },
      { kind: "ironwood", x: 1542, y: -633, size: 65, rotation: 2.07 },
      { kind: "ironwood", x: 1641, y: -717, size: 81, rotation: 3.12 },
      { kind: "ironwood", x: 1803, y: -683, size: 76, rotation: 3.38 },
      { kind: "ironwood", x: 1863, y: -606, size: 86, rotation: 5.05 },
      { kind: "ironwood", x: 1913, y: -590, size: 92, rotation: 2.82 },
      { kind: "ironwood", x: 1878, y: -499, size: 92, rotation: 5.97 },
      { kind: "ironwood", x: 1920, y: -424, size: 67, rotation: 3.76 },
      { kind: "ironwood", x: 1914, y: -311, size: 70, rotation: 5.00 },
      { kind: "ironwood", x: 1883, y: -207, size: 89, rotation: 3.53 },
      { kind: "ironwood", x: 1878, y: -68, size: 78, rotation: 2.25 },
      { kind: "ironwood", x: 1948, y: 30, size: 91, rotation: 4.79 },
      { kind: "ironwood", x: 1890, y: 96, size: 87, rotation: 5.07 },
      { kind: "ironwood", x: 1953, y: 247, size: 70, rotation: 3.57 },
      { kind: "ironwood", x: 1989, y: 369, size: 76, rotation: 6.22 },
      { kind: "ironwood", x: 1977, y: 444, size: 94, rotation: 3.16 },
      { kind: "ironwood", x: 1983, y: 635, size: 88, rotation: 0.22 },
      { kind: "ironwood", x: 1866, y: 713, size: 78, rotation: 5.63 },
      { kind: "ironwood", x: 1996, y: 768, size: 88, rotation: 0.99 },
      { kind: "ironwood", x: 1891, y: 949, size: 82, rotation: 5.48 },
      { kind: "ironwood", x: 1929, y: 1003, size: 91, rotation: 1.60 },
      { kind: "ironwood", x: 1946, y: 1080, size: 87, rotation: 5.94 },
      { kind: "ironwood", x: 1871, y: 1220, size: 78, rotation: 2.37 },
      { kind: "ironwood", x: 1922, y: 1275, size: 96, rotation: 0.87 },
      { kind: "ironwood", x: 1843, y: 1424, size: 81, rotation: 4.24 },
      { kind: "ironwood", x: 1825, y: 1440, size: 86, rotation: 5.74 },
      { kind: "ironwood", x: 1635, y: 1363, size: 76, rotation: 5.76 },
      { kind: "ironwood", x: 1554, y: 1324, size: 67, rotation: 4.98 },
      { kind: "ironwood", x: 1447, y: 1403, size: 97, rotation: 1.04 },
      { kind: "ironwood", x: 1409, y: 1386, size: 85, rotation: 6.25 },
      { kind: "ironwood", x: 1253, y: 1381, size: 97, rotation: 4.48 },
      { kind: "ironwood", x: 1201, y: 1419, size: 83, rotation: 5.91 },
      { kind: "ironwood", x: 1031, y: 1446, size: 89, rotation: 5.43 },
      { kind: "ironwood", x: 883, y: 1330, size: 74, rotation: 6.03 },
      { kind: "ironwood", x: 857, y: 1349, size: 84, rotation: 4.16 },
      { kind: "ironwood", x: 721, y: 1435, size: 86, rotation: 0.38 },
      { kind: "ironwood", x: 601, y: 1324, size: 67, rotation: 0.99 },
      { kind: "ironwood", x: 497, y: 1398, size: 94, rotation: 0.59 },
      { kind: "ironwood", x: 371, y: 1318, size: 78, rotation: 1.84 },
      { kind: "ironwood", x: 242, y: 1363, size: 88, rotation: 0.91 },
      { kind: "ironwood", x: 116, y: 1314, size: 96, rotation: 0.22 },
      { kind: "ironwood", x: 19, y: 1319, size: 84, rotation: 3.34 },
      { kind: "ironwood", x: -142, y: 1318, size: 79, rotation: 5.04 },
      { kind: "ironwood", x: -243, y: 1312, size: 88, rotation: 1.29 },
      { kind: "ironwood", x: -295, y: 1319, size: 72, rotation: 5.16 },
      { kind: "ironwood", x: -433, y: 1435, size: 80, rotation: 5.96 },
      { kind: "ironwood", x: -490, y: 1340, size: 93, rotation: 3.02 },
      { kind: "ironwood", x: -624, y: 1332, size: 88, rotation: 1.05 },
      { kind: "ironwood", x: -683, y: 1313, size: 67, rotation: 1.78 },
      { kind: "ironwood", x: -612, y: 1242, size: 94, rotation: 4.05 },
      { kind: "ironwood", x: -656, y: 1095, size: 97, rotation: 3.14 },
      { kind: "ironwood", x: -725, y: 1054, size: 75, rotation: 0.76 },
      { kind: "ironwood", x: -602, y: 914, size: 65, rotation: 0.65 },
      { kind: "ironwood", x: -701, y: 832, size: 85, rotation: 6.17 },
      { kind: "ironwood", x: -631, y: 710, size: 75, rotation: 0.53 },
      { kind: "ironwood", x: -708, y: 544, size: 69, rotation: 6.10 },
      { kind: "ironwood", x: -611, y: 474, size: 81, rotation: 4.66 },
      { kind: "ironwood", x: -664, y: 314, size: 83, rotation: 1.36 },
      { kind: "ironwood", x: -706, y: 272, size: 87, rotation: 0.31 },
      { kind: "ironwood", x: -691, y: 89, size: 93, rotation: 2.76 },
      { kind: "ironwood", x: -650, y: 50, size: 99, rotation: 4.19 },
      { kind: "ironwood", x: -686, y: -62, size: 78, rotation: 4.36 },
      { kind: "ironwood", x: -726, y: -212, size: 74, rotation: 4.57 },
      { kind: "ironwood", x: -601, y: -290, size: 101, rotation: 2.86 },
      { kind: "ironwood", x: -659, y: -378, size: 78, rotation: 6.01 },
      { kind: "ironwood", x: -623, y: -504, size: 99, rotation: 2.69 },
      { kind: "ironwood", x: -635, y: -598, size: 97, rotation: 1.58 },

      // belt at 1030, stems about 92
      { kind: "ironwood", x: -843, y: -977, size: 74, rotation: 6.21 },
      { kind: "ironwood", x: -685, y: -869, size: 107, rotation: 1.66 },
      { kind: "ironwood", x: -586, y: -829, size: 98, rotation: 3.09 },
      { kind: "ironwood", x: -549, y: -860, size: 108, rotation: 2.67 },
      { kind: "ironwood", x: -426, y: -960, size: 78, rotation: 4.71 },
      { kind: "ironwood", x: -307, y: -865, size: 78, rotation: 1.16 },
      { kind: "ironwood", x: -187, y: -840, size: 95, rotation: 3.03 },
      { kind: "ironwood", x: -54, y: -956, size: 92, rotation: 5.38 },
      { kind: "ironwood", x: 22, y: -954, size: 94, rotation: 2.60 },
      { kind: "ironwood", x: 209, y: -852, size: 88, rotation: 2.64 },
      { kind: "ironwood", x: 356, y: -964, size: 97, rotation: 0.35 },
      { kind: "ironwood", x: 411, y: -988, size: 112, rotation: 1.55 },
      { kind: "ironwood", x: 600, y: -979, size: 87, rotation: 1.67 },
      { kind: "ironwood", x: 680, y: -845, size: 99, rotation: 5.23 },
      { kind: "ironwood", x: 825, y: -842, size: 91, rotation: 2.69 },
      { kind: "ironwood", x: 964, y: -921, size: 82, rotation: 0.77 },
      { kind: "ironwood", x: 1122, y: -844, size: 113, rotation: 3.65 },
      { kind: "ironwood", x: 1223, y: -901, size: 81, rotation: 3.42 },
      { kind: "ironwood", x: 1336, y: -832, size: 83, rotation: 2.26 },
      { kind: "ironwood", x: 1445, y: -872, size: 102, rotation: 1.93 },
      { kind: "ironwood", x: 1628, y: -942, size: 80, rotation: 0.49 },
      { kind: "ironwood", x: 1664, y: -929, size: 90, rotation: 0.65 },
      { kind: "ironwood", x: 1795, y: -943, size: 109, rotation: 5.01 },
      { kind: "ironwood", x: 1966, y: -860, size: 91, rotation: 4.83 },
      { kind: "ironwood", x: 2017, y: -879, size: 96, rotation: 4.67 },
      { kind: "ironwood", x: 2138, y: -898, size: 94, rotation: 0.16 },
      { kind: "ironwood", x: 2156, y: -831, size: 77, rotation: 5.54 },
      { kind: "ironwood", x: 2246, y: -724, size: 96, rotation: 5.43 },
      { kind: "ironwood", x: 2192, y: -589, size: 94, rotation: 0.20 },
      { kind: "ironwood", x: 2217, y: -452, size: 86, rotation: 4.49 },
      { kind: "ironwood", x: 2255, y: -303, size: 107, rotation: 2.09 },
      { kind: "ironwood", x: 2149, y: -267, size: 89, rotation: 5.87 },
      { kind: "ironwood", x: 2160, y: -114, size: 86, rotation: 2.72 },
      { kind: "ironwood", x: 2107, y: -33, size: 113, rotation: 4.76 },
      { kind: "ironwood", x: 2127, y: 74, size: 106, rotation: 1.35 },
      { kind: "ironwood", x: 2266, y: 245, size: 92, rotation: 1.78 },
      { kind: "ironwood", x: 2194, y: 367, size: 116, rotation: 2.71 },
      { kind: "ironwood", x: 2189, y: 563, size: 80, rotation: 3.66 },
      { kind: "ironwood", x: 2246, y: 650, size: 94, rotation: 0.45 },
      { kind: "ironwood", x: 2221, y: 817, size: 89, rotation: 3.41 },
      { kind: "ironwood", x: 2119, y: 838, size: 77, rotation: 5.17 },
      { kind: "ironwood", x: 2123, y: 977, size: 105, rotation: 3.24 },
      { kind: "ironwood", x: 2178, y: 1162, size: 112, rotation: 2.77 },
      { kind: "ironwood", x: 2111, y: 1224, size: 105, rotation: 2.48 },
      { kind: "ironwood", x: 2116, y: 1297, size: 80, rotation: 2.62 },
      { kind: "ironwood", x: 2105, y: 1444, size: 104, rotation: 1.17 },
      { kind: "ironwood", x: 2143, y: 1539, size: 74, rotation: 4.62 },
      { kind: "ironwood", x: 2152, y: 1574, size: 99, rotation: 4.29 },
      { kind: "ironwood", x: 2037, y: 1700, size: 91, rotation: 0.70 },
      { kind: "ironwood", x: 1937, y: 1706, size: 93, rotation: 2.07 },
      { kind: "ironwood", x: 1780, y: 1677, size: 78, rotation: 3.20 },
      { kind: "ironwood", x: 1692, y: 1710, size: 80, rotation: 5.56 },
      { kind: "ironwood", x: 1570, y: 1549, size: 75, rotation: 2.12 },
      { kind: "ironwood", x: 1416, y: 1567, size: 97, rotation: 5.97 },
      { kind: "ironwood", x: 1358, y: 1660, size: 86, rotation: 0.60 },
      { kind: "ironwood", x: 1146, y: 1645, size: 74, rotation: 6.15 },
      { kind: "ironwood", x: 1124, y: 1692, size: 89, rotation: 5.59 },
      { kind: "ironwood", x: 988, y: 1626, size: 108, rotation: 5.42 },
      { kind: "ironwood", x: 844, y: 1687, size: 98, rotation: 3.83 },
      { kind: "ironwood", x: 629, y: 1612, size: 98, rotation: 4.17 },
      { kind: "ironwood", x: 591, y: 1582, size: 79, rotation: 0.78 },
      { kind: "ironwood", x: 385, y: 1578, size: 109, rotation: 3.87 },
      { kind: "ironwood", x: 268, y: 1545, size: 115, rotation: 2.19 },
      { kind: "ironwood", x: 149, y: 1589, size: 79, rotation: 6.09 },
      { kind: "ironwood", x: 36, y: 1561, size: 90, rotation: 3.30 },
      { kind: "ironwood", x: -58, y: 1677, size: 102, rotation: 4.90 },
      { kind: "ironwood", x: -192, y: 1674, size: 88, rotation: 3.42 },
      { kind: "ironwood", x: -325, y: 1578, size: 113, rotation: 1.49 },
      { kind: "ironwood", x: -436, y: 1676, size: 90, rotation: 4.20 },
      { kind: "ironwood", x: -535, y: 1604, size: 86, rotation: 3.89 },
      { kind: "ironwood", x: -683, y: 1672, size: 86, rotation: 3.14 },
      { kind: "ironwood", x: -733, y: 1618, size: 74, rotation: 2.99 },
      { kind: "ironwood", x: -891, y: 1596, size: 86, rotation: 3.33 },
      { kind: "ironwood", x: -891, y: 1493, size: 109, rotation: 0.83 },
      { kind: "ironwood", x: -910, y: 1450, size: 108, rotation: 0.68 },
      { kind: "ironwood", x: -961, y: 1332, size: 78, rotation: 0.57 },
      { kind: "ironwood", x: -904, y: 1185, size: 111, rotation: 1.23 },
      { kind: "ironwood", x: -972, y: 1101, size: 74, rotation: 2.93 },
      { kind: "ironwood", x: -895, y: 914, size: 111, rotation: 4.57 },
      { kind: "ironwood", x: -921, y: 814, size: 78, rotation: 6.20 },
      { kind: "ironwood", x: -821, y: 763, size: 115, rotation: 5.86 },
      { kind: "ironwood", x: -942, y: 572, size: 115, rotation: 4.52 },
      { kind: "ironwood", x: -866, y: 505, size: 110, rotation: 2.88 },
      { kind: "ironwood", x: -924, y: 326, size: 106, rotation: 0.36 },
      { kind: "ironwood", x: -852, y: 164, size: 111, rotation: 4.02 },
      { kind: "ironwood", x: -922, y: 55, size: 92, rotation: 0.64 },
      { kind: "ironwood", x: -982, y: -43, size: 106, rotation: 4.81 },
      { kind: "ironwood", x: -962, y: -123, size: 76, rotation: 0.16 },
      { kind: "ironwood", x: -980, y: -231, size: 94, rotation: 4.19 },
      { kind: "ironwood", x: -873, y: -414, size: 93, rotation: 3.02 },
      { kind: "ironwood", x: -952, y: -521, size: 97, rotation: 3.12 },
      { kind: "ironwood", x: -865, y: -593, size: 88, rotation: 4.35 },
      { kind: "ironwood", x: -847, y: -700, size: 98, rotation: 0.12 },
      { kind: "ironwood", x: -862, y: -891, size: 79, rotation: 1.85 },

      // belt at 1380, stems about 104
      { kind: "ironwood", x: -1195, y: -1170, size: 112, rotation: 4.22 },
      { kind: "ironwood", x: -1001, y: -1220, size: 108, rotation: 5.19 },
      { kind: "ironwood", x: -867, y: -1299, size: 122, rotation: 6.07 },
      { kind: "ironwood", x: -794, y: -1284, size: 124, rotation: 1.55 },
      { kind: "ironwood", x: -668, y: -1163, size: 107, rotation: 3.71 },
      { kind: "ironwood", x: -476, y: -1244, size: 120, rotation: 1.39 },
      { kind: "ironwood", x: -422, y: -1275, size: 115, rotation: 4.38 },
      { kind: "ironwood", x: -226, y: -1118, size: 117, rotation: 4.10 },
      { kind: "ironwood", x: -147, y: -1158, size: 116, rotation: 3.65 },
      { kind: "ironwood", x: 50, y: -1158, size: 89, rotation: 0.06 },
      { kind: "ironwood", x: 146, y: -1228, size: 91, rotation: 2.53 },
      { kind: "ironwood", x: 344, y: -1148, size: 112, rotation: 4.50 },
      { kind: "ironwood", x: 527, y: -1153, size: 131, rotation: 5.61 },
      { kind: "ironwood", x: 579, y: -1132, size: 115, rotation: 1.51 },
      { kind: "ironwood", x: 712, y: -1181, size: 90, rotation: 5.33 },
      { kind: "ironwood", x: 902, y: -1264, size: 86, rotation: 2.91 },
      { kind: "ironwood", x: 1019, y: -1160, size: 113, rotation: 4.88 },
      { kind: "ironwood", x: 1254, y: -1305, size: 124, rotation: 2.78 },
      { kind: "ironwood", x: 1370, y: -1206, size: 83, rotation: 3.40 },
      { kind: "ironwood", x: 1493, y: -1309, size: 116, rotation: 0.84 },
      { kind: "ironwood", x: 1552, y: -1256, size: 96, rotation: 1.99 },
      { kind: "ironwood", x: 1751, y: -1300, size: 99, rotation: 1.17 },
      { kind: "ironwood", x: 1828, y: -1133, size: 126, rotation: 4.71 },
      { kind: "ironwood", x: 2036, y: -1120, size: 107, rotation: 2.58 },
      { kind: "ironwood", x: 2095, y: -1117, size: 99, rotation: 3.90 },
      { kind: "ironwood", x: 2261, y: -1158, size: 117, rotation: 6.18 },
      { kind: "ironwood", x: 2423, y: -1285, size: 120, rotation: 5.55 },
      { kind: "ironwood", x: 2470, y: -1220, size: 126, rotation: 0.16 },
      { kind: "ironwood", x: 2479, y: -1076, size: 127, rotation: 2.54 },
      { kind: "ironwood", x: 2483, y: -901, size: 91, rotation: 3.74 },
      { kind: "ironwood", x: 2435, y: -843, size: 100, rotation: 1.64 },
      { kind: "ironwood", x: 2512, y: -640, size: 128, rotation: 4.67 },
      { kind: "ironwood", x: 2527, y: -598, size: 114, rotation: 5.86 },
      { kind: "ironwood", x: 2452, y: -376, size: 121, rotation: 4.32 },
      { kind: "ironwood", x: 2555, y: -341, size: 127, rotation: 1.50 },
      { kind: "ironwood", x: 2397, y: -196, size: 131, rotation: 4.46 },
      { kind: "ironwood", x: 2504, y: -21, size: 102, rotation: 2.19 },
      { kind: "ironwood", x: 2474, y: 131, size: 87, rotation: 5.54 },
      { kind: "ironwood", x: 2536, y: 241, size: 84, rotation: 4.59 },
      { kind: "ironwood", x: 2581, y: 444, size: 118, rotation: 1.19 },
      { kind: "ironwood", x: 2425, y: 617, size: 85, rotation: 2.32 },
      { kind: "ironwood", x: 2552, y: 671, size: 85, rotation: 1.09 },
      { kind: "ironwood", x: 2493, y: 886, size: 127, rotation: 0.57 },
      { kind: "ironwood", x: 2398, y: 1004, size: 112, rotation: 4.17 },
      { kind: "ironwood", x: 2457, y: 1104, size: 122, rotation: 2.27 },
      { kind: "ironwood", x: 2511, y: 1279, size: 99, rotation: 4.51 },
      { kind: "ironwood", x: 2404, y: 1312, size: 94, rotation: 2.35 },
      { kind: "ironwood", x: 2521, y: 1488, size: 107, rotation: 2.02 },
      { kind: "ironwood", x: 2501, y: 1636, size: 116, rotation: 4.97 },
      { kind: "ironwood", x: 2406, y: 1763, size: 93, rotation: 0.04 },
      { kind: "ironwood", x: 2515, y: 1852, size: 85, rotation: 6.13 },
      { kind: "ironwood", x: 2486, y: 2012, size: 88, rotation: 5.68 },
      { kind: "ironwood", x: 2251, y: 1890, size: 120, rotation: 0.32 },
      { kind: "ironwood", x: 2167, y: 1863, size: 100, rotation: 2.54 },
      { kind: "ironwood", x: 2076, y: 1890, size: 91, rotation: 4.04 },
      { kind: "ironwood", x: 1933, y: 1965, size: 89, rotation: 5.92 },
      { kind: "ironwood", x: 1791, y: 1934, size: 93, rotation: 4.08 },
      { kind: "ironwood", x: 1678, y: 1903, size: 114, rotation: 0.44 },
      { kind: "ironwood", x: 1571, y: 1985, size: 94, rotation: 5.40 },
      { kind: "ironwood", x: 1417, y: 1865, size: 107, rotation: 2.25 },
      { kind: "ironwood", x: 1291, y: 1987, size: 99, rotation: 5.01 },
      { kind: "ironwood", x: 1097, y: 2013, size: 116, rotation: 1.56 },
      { kind: "ironwood", x: 1026, y: 1957, size: 110, rotation: 3.82 },
      { kind: "ironwood", x: 842, y: 1999, size: 105, rotation: 2.81 },
      { kind: "ironwood", x: 688, y: 1956, size: 108, rotation: 2.19 },
      { kind: "ironwood", x: 548, y: 1918, size: 98, rotation: 5.91 },
      { kind: "ironwood", x: 319, y: 1998, size: 84, rotation: 3.20 },
      { kind: "ironwood", x: 181, y: 1982, size: 98, rotation: 1.50 },
      { kind: "ironwood", x: 84, y: 1883, size: 125, rotation: 0.81 },
      { kind: "ironwood", x: -21, y: 2000, size: 126, rotation: 5.92 },
      { kind: "ironwood", x: -145, y: 1976, size: 117, rotation: 2.07 },
      { kind: "ironwood", x: -365, y: 1866, size: 100, rotation: 1.35 },
      { kind: "ironwood", x: -500, y: 1984, size: 126, rotation: 3.97 },
      { kind: "ironwood", x: -527, y: 1992, size: 109, rotation: 1.66 },
      { kind: "ironwood", x: -701, y: 1898, size: 104, rotation: 5.48 },
      { kind: "ironwood", x: -823, y: 1947, size: 103, rotation: 2.67 },
      { kind: "ironwood", x: -960, y: 1954, size: 127, rotation: 0.59 },
      { kind: "ironwood", x: -1104, y: 1908, size: 96, rotation: 5.82 },
      { kind: "ironwood", x: -1126, y: 1907, size: 96, rotation: 1.46 },
      { kind: "ironwood", x: -1155, y: 1816, size: 104, rotation: 6.05 },
      { kind: "ironwood", x: -1213, y: 1664, size: 112, rotation: 5.95 },
      { kind: "ironwood", x: -1147, y: 1509, size: 127, rotation: 0.80 },
      { kind: "ironwood", x: -1269, y: 1357, size: 120, rotation: 2.79 },
      { kind: "ironwood", x: -1258, y: 1229, size: 127, rotation: 5.20 },
      { kind: "ironwood", x: -1243, y: 1096, size: 85, rotation: 4.00 },
      { kind: "ironwood", x: -1268, y: 1020, size: 128, rotation: 4.90 },
      { kind: "ironwood", x: -1177, y: 907, size: 93, rotation: 3.02 },
      { kind: "ironwood", x: -1211, y: 753, size: 86, rotation: 0.91 },
      { kind: "ironwood", x: -1204, y: 659, size: 129, rotation: 5.20 },
      { kind: "ironwood", x: -1256, y: 515, size: 93, rotation: 2.75 },
      { kind: "ironwood", x: -1146, y: 379, size: 110, rotation: 4.09 },
      { kind: "ironwood", x: -1309, y: 159, size: 87, rotation: 4.88 },
      { kind: "ironwood", x: -1199, y: 33, size: 116, rotation: 6.12 },
      { kind: "ironwood", x: -1226, y: -130, size: 109, rotation: 3.66 },
      { kind: "ironwood", x: -1267, y: -232, size: 110, rotation: 2.23 },
      { kind: "ironwood", x: -1282, y: -334, size: 88, rotation: 1.92 },
      { kind: "ironwood", x: -1245, y: -533, size: 87, rotation: 1.69 },
      { kind: "ironwood", x: -1235, y: -668, size: 93, rotation: 1.85 },
      { kind: "ironwood", x: -1143, y: -709, size: 102, rotation: 1.40 },
      { kind: "ironwood", x: -1136, y: -921, size: 90, rotation: 2.41 },
      { kind: "ironwood", x: -1225, y: -972, size: 92, rotation: 6.08 },
      { kind: "ironwood", x: -1279, y: -1106, size: 93, rotation: 1.86 },

      // belt at 1800, stems about 86
      { kind: "ironwood", x: -1519, y: -1611, size: 101, rotation: 2.44 },
      { kind: "ironwood", x: -1319, y: -1577, size: 100, rotation: 6.14 },
      { kind: "ironwood", x: -1170, y: -1496, size: 73, rotation: 0.24 },
      { kind: "ironwood", x: -1067, y: -1555, size: 103, rotation: 5.79 },
      { kind: "ironwood", x: -891, y: -1598, size: 80, rotation: 5.29 },
      { kind: "ironwood", x: -825, y: -1676, size: 92, rotation: 2.47 },
      { kind: "ironwood", x: -646, y: -1585, size: 89, rotation: 1.64 },
      { kind: "ironwood", x: -510, y: -1506, size: 104, rotation: 4.09 },
      { kind: "ironwood", x: -312, y: -1678, size: 106, rotation: 5.92 },
      { kind: "ironwood", x: -275, y: -1585, size: 72, rotation: 0.48 },
      { kind: "ironwood", x: -14, y: -1550, size: 100, rotation: 2.96 },
      { kind: "ironwood", x: 141, y: -1533, size: 106, rotation: 2.53 },
      { kind: "ironwood", x: 213, y: -1505, size: 99, rotation: 5.43 },
      { kind: "ironwood", x: 374, y: -1521, size: 89, rotation: 4.33 },
      { kind: "ironwood", x: 518, y: -1663, size: 78, rotation: 0.98 },
      { kind: "ironwood", x: 803, y: -1685, size: 75, rotation: 0.61 },
      { kind: "ironwood", x: 905, y: -1507, size: 103, rotation: 5.63 },
      { kind: "ironwood", x: 1051, y: -1587, size: 91, rotation: 0.50 },
      { kind: "ironwood", x: 1169, y: -1613, size: 105, rotation: 5.91 },
      { kind: "ironwood", x: 1338, y: -1676, size: 89, rotation: 0.56 },
      { kind: "ironwood", x: 1556, y: -1655, size: 106, rotation: 2.09 },
      { kind: "ironwood", x: 1687, y: -1685, size: 73, rotation: 2.33 },
      { kind: "ironwood", x: 1870, y: -1496, size: 74, rotation: 4.17 },
      { kind: "ironwood", x: 1948, y: -1610, size: 108, rotation: 6.02 },
      { kind: "ironwood", x: 2139, y: -1639, size: 100, rotation: 4.58 },
      { kind: "ironwood", x: 2288, y: -1514, size: 99, rotation: 2.85 },
      { kind: "ironwood", x: 2419, y: -1593, size: 97, rotation: 5.18 },
      { kind: "ironwood", x: 2485, y: -1684, size: 89, rotation: 4.30 },
      { kind: "ironwood", x: 2732, y: -1545, size: 86, rotation: 3.43 },
      { kind: "ironwood", x: 2808, y: -1519, size: 76, rotation: 5.28 },
      { kind: "ironwood", x: 2843, y: -1523, size: 85, rotation: 2.57 },
      { kind: "ironwood", x: 2830, y: -1312, size: 94, rotation: 1.13 },
      { kind: "ironwood", x: 2809, y: -1184, size: 94, rotation: 0.99 },
      { kind: "ironwood", x: 2797, y: -1097, size: 88, rotation: 5.60 },
      { kind: "ironwood", x: 2969, y: -920, size: 103, rotation: 0.55 },
      { kind: "ironwood", x: 2770, y: -723, size: 90, rotation: 1.35 },
      { kind: "ironwood", x: 2862, y: -566, size: 92, rotation: 1.49 },
      { kind: "ironwood", x: 2883, y: -424, size: 79, rotation: 2.64 },
      { kind: "ironwood", x: 2865, y: -363, size: 96, rotation: 4.96 },
      { kind: "ironwood", x: 2783, y: -207, size: 81, rotation: 4.45 },
      { kind: "ironwood", x: 2858, y: -86, size: 71, rotation: 3.27 },
      { kind: "ironwood", x: 2876, y: 186, size: 94, rotation: 4.26 },
      { kind: "ironwood", x: 2881, y: 323, size: 83, rotation: 4.09 },
      { kind: "ironwood", x: 2838, y: 447, size: 97, rotation: 2.49 },
      { kind: "ironwood", x: 2919, y: 697, size: 76, rotation: 5.90 },
      { kind: "ironwood", x: 2940, y: 793, size: 78, rotation: 4.47 },
      { kind: "ironwood", x: 2758, y: 914, size: 105, rotation: 2.17 },
      { kind: "ironwood", x: 2776, y: 1072, size: 78, rotation: 5.49 },
      { kind: "ironwood", x: 2758, y: 1274, size: 75, rotation: 0.88 },
      { kind: "ironwood", x: 2761, y: 1358, size: 106, rotation: 0.52 },
      { kind: "ironwood", x: 2763, y: 1492, size: 91, rotation: 4.86 },
      { kind: "ironwood", x: 2942, y: 1670, size: 91, rotation: 0.10 },
      { kind: "ironwood", x: 2854, y: 1861, size: 94, rotation: 2.28 },
      { kind: "ironwood", x: 2775, y: 1933, size: 87, rotation: 6.18 },
      { kind: "ironwood", x: 2935, y: 2051, size: 77, rotation: 0.90 },
      { kind: "ironwood", x: 2946, y: 2208, size: 87, rotation: 4.79 },
      { kind: "ironwood", x: 2748, y: 2319, size: 84, rotation: 4.45 },
      { kind: "ironwood", x: 2611, y: 2292, size: 108, rotation: 4.49 },
      { kind: "ironwood", x: 2441, y: 2308, size: 103, rotation: 2.63 },
      { kind: "ironwood", x: 2299, y: 2335, size: 105, rotation: 1.88 },
      { kind: "ironwood", x: 2202, y: 2249, size: 88, rotation: 4.85 },
      { kind: "ironwood", x: 2121, y: 2247, size: 90, rotation: 3.40 },
      { kind: "ironwood", x: 1885, y: 2298, size: 98, rotation: 0.89 },
      { kind: "ironwood", x: 1832, y: 2408, size: 101, rotation: 3.70 },
      { kind: "ironwood", x: 1638, y: 2268, size: 91, rotation: 4.13 },
      { kind: "ironwood", x: 1543, y: 2222, size: 74, rotation: 5.76 },
      { kind: "ironwood", x: 1320, y: 2199, size: 91, rotation: 3.99 },
      { kind: "ironwood", x: 1149, y: 2293, size: 97, rotation: 1.86 },
      { kind: "ironwood", x: 1039, y: 2296, size: 96, rotation: 2.25 },
      { kind: "ironwood", x: 909, y: 2271, size: 73, rotation: 0.63 },
      { kind: "ironwood", x: 635, y: 2306, size: 89, rotation: 3.60 },
      { kind: "ironwood", x: 530, y: 2231, size: 92, rotation: 0.48 },
      { kind: "ironwood", x: 380, y: 2275, size: 91, rotation: 3.33 },
      { kind: "ironwood", x: 272, y: 2248, size: 74, rotation: 0.80 },
      { kind: "ironwood", x: 56, y: 2359, size: 108, rotation: 5.86 },
      { kind: "ironwood", x: -86, y: 2399, size: 108, rotation: 1.54 },
      { kind: "ironwood", x: -312, y: 2300, size: 72, rotation: 3.87 },
      { kind: "ironwood", x: -336, y: 2205, size: 106, rotation: 1.04 },
      { kind: "ironwood", x: -600, y: 2388, size: 86, rotation: 1.99 },
      { kind: "ironwood", x: -690, y: 2376, size: 94, rotation: 5.19 },
      { kind: "ironwood", x: -771, y: 2405, size: 80, rotation: 2.30 },
      { kind: "ironwood", x: -966, y: 2235, size: 80, rotation: 1.60 },
      { kind: "ironwood", x: -1109, y: 2307, size: 109, rotation: 4.11 },
      { kind: "ironwood", x: -1259, y: 2212, size: 92, rotation: 6.02 },
      { kind: "ironwood", x: -1395, y: 2218, size: 93, rotation: 4.50 },
      { kind: "ironwood", x: -1568, y: 2379, size: 91, rotation: 2.53 },
      { kind: "ironwood", x: -1546, y: 2170, size: 109, rotation: 1.71 },
      { kind: "ironwood", x: -1558, y: 2096, size: 76, rotation: 4.39 },
      { kind: "ironwood", x: -1485, y: 1927, size: 91, rotation: 0.40 },
      { kind: "ironwood", x: -1683, y: 1809, size: 76, rotation: 0.42 },
      { kind: "ironwood", x: -1485, y: 1622, size: 79, rotation: 2.20 },
      { kind: "ironwood", x: -1596, y: 1461, size: 76, rotation: 1.16 },
      { kind: "ironwood", x: -1682, y: 1326, size: 106, rotation: 5.56 },
      { kind: "ironwood", x: -1595, y: 1192, size: 80, rotation: 0.09 },
      { kind: "ironwood", x: -1630, y: 1085, size: 82, rotation: 4.62 },
      { kind: "ironwood", x: -1605, y: 920, size: 92, rotation: 1.15 },
      { kind: "ironwood", x: -1585, y: 717, size: 108, rotation: 4.81 },
      { kind: "ironwood", x: -1586, y: 531, size: 94, rotation: 3.44 },
      { kind: "ironwood", x: -1569, y: 441, size: 99, rotation: 0.98 },
      { kind: "ironwood", x: -1496, y: 269, size: 76, rotation: 6.26 },
      { kind: "ironwood", x: -1650, y: 102, size: 87, rotation: 4.87 },
      { kind: "ironwood", x: -1614, y: -31, size: 73, rotation: 0.72 },
      { kind: "ironwood", x: -1567, y: -216, size: 104, rotation: 4.88 },
      { kind: "ironwood", x: -1478, y: -396, size: 82, rotation: 4.86 },
      { kind: "ironwood", x: -1610, y: -453, size: 97, rotation: 1.45 },
      { kind: "ironwood", x: -1512, y: -619, size: 86, rotation: 1.79 },
      { kind: "ironwood", x: -1578, y: -753, size: 106, rotation: 1.04 },
      { kind: "ironwood", x: -1668, y: -879, size: 83, rotation: 1.00 },
      { kind: "ironwood", x: -1478, y: -1113, size: 77, rotation: 5.27 },
      { kind: "ironwood", x: -1608, y: -1185, size: 86, rotation: 0.67 },
      { kind: "ironwood", x: -1639, y: -1338, size: 89, rotation: 3.81 },
      { kind: "ironwood", x: -1543, y: -1486, size: 104, rotation: 2.19 },

      // belt at 2300, stems about 95
      { kind: "ironwood", x: -1940, y: -1946, size: 111, rotation: 2.64 },
      { kind: "ironwood", x: -1784, y: -2114, size: 103, rotation: 2.52 },
      { kind: "ironwood", x: -1599, y: -2105, size: 79, rotation: 5.99 },
      { kind: "ironwood", x: -1485, y: -2025, size: 105, rotation: 1.21 },
      { kind: "ironwood", x: -1223, y: -2080, size: 91, rotation: 1.56 },
      { kind: "ironwood", x: -1132, y: -1907, size: 111, rotation: 3.43 },
      { kind: "ironwood", x: -946, y: -2146, size: 118, rotation: 3.25 },
      { kind: "ironwood", x: -701, y: -2035, size: 85, rotation: 5.03 },
      { kind: "ironwood", x: -541, y: -2102, size: 104, rotation: 3.41 },
      { kind: "ironwood", x: -276, y: -1925, size: 91, rotation: 5.15 },
      { kind: "ironwood", x: -104, y: -1950, size: 117, rotation: 0.57 },
      { kind: "ironwood", x: 35, y: -1972, size: 103, rotation: 0.81 },
      { kind: "ironwood", x: 164, y: -2045, size: 80, rotation: 3.48 },
      { kind: "ironwood", x: 318, y: -1908, size: 85, rotation: 1.79 },
      { kind: "ironwood", x: 633, y: -2019, size: 117, rotation: 1.22 },
      { kind: "ironwood", x: 759, y: -1920, size: 102, rotation: 3.58 },
      { kind: "ironwood", x: 1070, y: -2121, size: 117, rotation: 5.04 },
      { kind: "ironwood", x: 1214, y: -2095, size: 109, rotation: 3.68 },
      { kind: "ironwood", x: 1354, y: -2057, size: 118, rotation: 0.86 },
      { kind: "ironwood", x: 1497, y: -2064, size: 88, rotation: 5.41 },
      { kind: "ironwood", x: 1718, y: -2038, size: 108, rotation: 6.08 },
      { kind: "ironwood", x: 1935, y: -2060, size: 106, rotation: 0.36 },
      { kind: "ironwood", x: 2043, y: -1908, size: 94, rotation: 0.60 },
      { kind: "ironwood", x: 2303, y: -1977, size: 87, rotation: 5.44 },
      { kind: "ironwood", x: 2426, y: -1991, size: 118, rotation: 0.96 },
      { kind: "ironwood", x: 2692, y: -2028, size: 91, rotation: 1.27 },
      { kind: "ironwood", x: 2720, y: -2076, size: 106, rotation: 3.58 },
      { kind: "ironwood", x: 3040, y: -2115, size: 104, rotation: 4.76 },
      { kind: "ironwood", x: 3198, y: -1905, size: 86, rotation: 3.25 },
      { kind: "ironwood", x: 3195, y: -1931, size: 89, rotation: 3.48 },
      { kind: "ironwood", x: 3239, y: -1849, size: 82, rotation: 1.23 },
      { kind: "ironwood", x: 3261, y: -1577, size: 107, rotation: 3.44 },
      { kind: "ironwood", x: 3380, y: -1481, size: 93, rotation: 1.83 },
      { kind: "ironwood", x: 3323, y: -1314, size: 94, rotation: 5.65 },
      { kind: "ironwood", x: 3425, y: -1131, size: 98, rotation: 6.01 },
      { kind: "ironwood", x: 3365, y: -891, size: 114, rotation: 0.06 },
      { kind: "ironwood", x: 3216, y: -751, size: 109, rotation: 1.01 },
      { kind: "ironwood", x: 3402, y: -656, size: 83, rotation: 5.57 },
      { kind: "ironwood", x: 3338, y: -407, size: 106, rotation: 4.68 },
      { kind: "ironwood", x: 3318, y: -258, size: 76, rotation: 6.12 },
      { kind: "ironwood", x: 3283, y: -62, size: 115, rotation: 0.18 },
      { kind: "ironwood", x: 3436, y: 121, size: 106, rotation: 0.04 },
      { kind: "ironwood", x: 3205, y: 328, size: 109, rotation: 2.02 },
      { kind: "ironwood", x: 3201, y: 481, size: 82, rotation: 6.25 },
      { kind: "ironwood", x: 3184, y: 742, size: 101, rotation: 0.98 },
      { kind: "ironwood", x: 3432, y: 960, size: 98, rotation: 5.95 },
      { kind: "ironwood", x: 3215, y: 1119, size: 102, rotation: 3.98 },
      { kind: "ironwood", x: 3175, y: 1279, size: 106, rotation: 2.46 },
      { kind: "ironwood", x: 3393, y: 1468, size: 87, rotation: 4.20 },
      { kind: "ironwood", x: 3192, y: 1674, size: 95, rotation: 2.05 },
      { kind: "ironwood", x: 3308, y: 1803, size: 98, rotation: 3.27 },
      { kind: "ironwood", x: 3198, y: 1912, size: 103, rotation: 4.19 },
      { kind: "ironwood", x: 3242, y: 2098, size: 114, rotation: 2.78 },
      { kind: "ironwood", x: 3264, y: 2339, size: 87, rotation: 4.98 },
      { kind: "ironwood", x: 3327, y: 2452, size: 114, rotation: 4.90 },
      { kind: "ironwood", x: 3369, y: 2656, size: 104, rotation: 1.88 },
      { kind: "ironwood", x: 3139, y: 2671, size: 80, rotation: 2.36 },
      { kind: "ironwood", x: 3019, y: 2794, size: 84, rotation: 3.22 },
      { kind: "ironwood", x: 2846, y: 2712, size: 92, rotation: 3.91 },
      { kind: "ironwood", x: 2709, y: 2748, size: 82, rotation: 5.74 },
      { kind: "ironwood", x: 2471, y: 2664, size: 107, rotation: 0.07 },
      { kind: "ironwood", x: 2334, y: 2653, size: 87, rotation: 0.11 },
      { kind: "ironwood", x: 2106, y: 2821, size: 86, rotation: 3.11 },
      { kind: "ironwood", x: 1979, y: 2662, size: 118, rotation: 5.18 },
      { kind: "ironwood", x: 1808, y: 2808, size: 111, rotation: 3.51 },
      { kind: "ironwood", x: 1671, y: 2797, size: 106, rotation: 2.78 },
      { kind: "ironwood", x: 1475, y: 2699, size: 96, rotation: 1.75 },
      { kind: "ironwood", x: 1257, y: 2672, size: 85, rotation: 5.97 },
      { kind: "ironwood", x: 1076, y: 2717, size: 111, rotation: 1.74 },
      { kind: "ironwood", x: 869, y: 2684, size: 115, rotation: 0.80 },
      { kind: "ironwood", x: 741, y: 2660, size: 109, rotation: 5.42 },
      { kind: "ironwood", x: 511, y: 2748, size: 111, rotation: 0.68 },
      { kind: "ironwood", x: 363, y: 2858, size: 94, rotation: 1.50 },
      { kind: "ironwood", x: 98, y: 2694, size: 106, rotation: 3.73 },
      { kind: "ironwood", x: -38, y: 2789, size: 90, rotation: 0.62 },
      { kind: "ironwood", x: -253, y: 2761, size: 117, rotation: 4.27 },
      { kind: "ironwood", x: -452, y: 2871, size: 95, rotation: 2.92 },
      { kind: "ironwood", x: -623, y: 2768, size: 78, rotation: 5.73 },
      { kind: "ironwood", x: -755, y: 2630, size: 110, rotation: 0.72 },
      { kind: "ironwood", x: -926, y: 2622, size: 93, rotation: 4.16 },
      { kind: "ironwood", x: -1177, y: 2629, size: 97, rotation: 2.71 },
      { kind: "ironwood", x: -1308, y: 2733, size: 117, rotation: 2.63 },
      { kind: "ironwood", x: -1558, y: 2822, size: 103, rotation: 0.16 },
      { kind: "ironwood", x: -1746, y: 2788, size: 110, rotation: 0.48 },
      { kind: "ironwood", x: -1891, y: 2868, size: 94, rotation: 6.09 },
      { kind: "ironwood", x: -2005, y: 2681, size: 118, rotation: 5.22 },
      { kind: "ironwood", x: -1896, y: 2533, size: 113, rotation: 6.28 },
      { kind: "ironwood", x: -2042, y: 2332, size: 106, rotation: 4.80 },
      { kind: "ironwood", x: -2031, y: 2233, size: 117, rotation: 3.22 },
      { kind: "ironwood", x: -1937, y: 1975, size: 118, rotation: 4.52 },
      { kind: "ironwood", x: -2040, y: 1851, size: 86, rotation: 4.47 },
      { kind: "ironwood", x: -2122, y: 1636, size: 97, rotation: 3.49 },
      { kind: "ironwood", x: -2081, y: 1534, size: 111, rotation: 4.67 },
      { kind: "ironwood", x: -2123, y: 1350, size: 85, rotation: 2.34 },
      { kind: "ironwood", x: -1961, y: 1205, size: 102, rotation: 1.05 },
      { kind: "ironwood", x: -2104, y: 958, size: 92, rotation: 5.11 },
      { kind: "ironwood", x: -1946, y: 832, size: 120, rotation: 3.78 },
      { kind: "ironwood", x: -2145, y: 670, size: 118, rotation: 0.13 },
      { kind: "ironwood", x: -2063, y: 344, size: 117, rotation: 5.63 },
      { kind: "ironwood", x: -1912, y: 242, size: 117, rotation: 2.20 },
      { kind: "ironwood", x: -1952, y: 30, size: 114, rotation: 4.19 },
      { kind: "ironwood", x: -1943, y: -178, size: 93, rotation: 2.78 },
      { kind: "ironwood", x: -1901, y: -414, size: 96, rotation: 3.37 },
      { kind: "ironwood", x: -2076, y: -469, size: 111, rotation: 4.53 },
      { kind: "ironwood", x: -2114, y: -701, size: 120, rotation: 5.84 },
      { kind: "ironwood", x: -1938, y: -928, size: 108, rotation: 5.96 },
      { kind: "ironwood", x: -2144, y: -991, size: 93, rotation: 4.86 },
      { kind: "ironwood", x: -1925, y: -1254, size: 80, rotation: 5.60 },
      { kind: "ironwood", x: -2042, y: -1458, size: 76, rotation: 5.79 },
      { kind: "ironwood", x: -1940, y: -1616, size: 83, rotation: 4.60 },
      { kind: "ironwood", x: -2152, y: -1802, size: 109, rotation: 4.23 },
      { kind: "ironwood", x: -2112, y: -1915, size: 109, rotation: 1.76 },

      // belt at 2850, stems about 123
      { kind: "ironwood", x: -2442, y: -2417, size: 115, rotation: 4.05 },
      { kind: "ironwood", x: -2178, y: -2542, size: 117, rotation: 2.79 },
      { kind: "ironwood", x: -2053, y: -2467, size: 139, rotation: 1.63 },
      { kind: "ironwood", x: -1685, y: -2401, size: 146, rotation: 5.13 },
      { kind: "ironwood", x: -1515, y: -2463, size: 122, rotation: 1.86 },
      { kind: "ironwood", x: -1197, y: -2374, size: 133, rotation: 4.08 },
      { kind: "ironwood", x: -1077, y: -2398, size: 150, rotation: 6.17 },
      { kind: "ironwood", x: -897, y: -2519, size: 146, rotation: 1.93 },
      { kind: "ironwood", x: -714, y: -2366, size: 146, rotation: 4.52 },
      { kind: "ironwood", x: -362, y: -2652, size: 107, rotation: 5.16 },
      { kind: "ironwood", x: -130, y: -2652, size: 142, rotation: 3.31 },
      { kind: "ironwood", x: 46, y: -2389, size: 148, rotation: 3.16 },
      { kind: "ironwood", x: 286, y: -2644, size: 130, rotation: 5.78 },
      { kind: "ironwood", x: 463, y: -2647, size: 128, rotation: 0.73 },
      { kind: "ironwood", x: 704, y: -2673, size: 143, rotation: 5.26 },
      { kind: "ironwood", x: 1097, y: -2395, size: 131, rotation: 5.95 },
      { kind: "ironwood", x: 1274, y: -2442, size: 152, rotation: 4.30 },
      { kind: "ironwood", x: 1454, y: -2384, size: 110, rotation: 3.82 },
      { kind: "ironwood", x: 1683, y: -2437, size: 117, rotation: 0.75 },
      { kind: "ironwood", x: 2000, y: -2358, size: 113, rotation: 5.87 },
      { kind: "ironwood", x: 2241, y: -2639, size: 103, rotation: 3.99 },
      { kind: "ironwood", x: 2409, y: -2512, size: 113, rotation: 5.02 },
      { kind: "ironwood", x: 2641, y: -2648, size: 116, rotation: 3.59 },
      { kind: "ironwood", x: 2856, y: -2620, size: 126, rotation: 1.32 },
      { kind: "ironwood", x: 2948, y: -2461, size: 151, rotation: 3.97 },
      { kind: "ironwood", x: 3312, y: -2651, size: 155, rotation: 3.20 },
      { kind: "ironwood", x: 3443, y: -2408, size: 148, rotation: 3.06 },
      { kind: "ironwood", x: 3648, y: -2620, size: 136, rotation: 0.27 },
      { kind: "ironwood", x: 3778, y: -2462, size: 128, rotation: 3.66 },
      { kind: "ironwood", x: 3775, y: -2117, size: 114, rotation: 0.83 },
      { kind: "ironwood", x: 3902, y: -1966, size: 153, rotation: 4.60 },
      { kind: "ironwood", x: 3834, y: -1749, size: 116, rotation: 4.26 },
      { kind: "ironwood", x: 3846, y: -1409, size: 146, rotation: 3.74 },
      { kind: "ironwood", x: 3663, y: -1186, size: 150, rotation: 1.75 },
      { kind: "ironwood", x: 3885, y: -975, size: 134, rotation: 3.84 },
      { kind: "ironwood", x: 3803, y: -919, size: 119, rotation: 0.99 },
      { kind: "ironwood", x: 3936, y: -545, size: 139, rotation: 3.34 },
      { kind: "ironwood", x: 3628, y: -473, size: 143, rotation: 4.93 },
      { kind: "ironwood", x: 3686, y: -180, size: 123, rotation: 0.55 },
      { kind: "ironwood", x: 3748, y: 156, size: 113, rotation: 3.26 },
      { kind: "ironwood", x: 3642, y: 353, size: 125, rotation: 5.80 },
      { kind: "ironwood", x: 3881, y: 517, size: 155, rotation: 0.63 },
      { kind: "ironwood", x: 3918, y: 748, size: 125, rotation: 2.45 },
      { kind: "ironwood", x: 3830, y: 1072, size: 155, rotation: 2.35 },
      { kind: "ironwood", x: 3690, y: 1228, size: 129, rotation: 1.64 },
      { kind: "ironwood", x: 3777, y: 1526, size: 136, rotation: 0.30 },
      { kind: "ironwood", x: 3714, y: 1681, size: 124, rotation: 0.02 },
      { kind: "ironwood", x: 3625, y: 1902, size: 150, rotation: 5.38 },
      { kind: "ironwood", x: 3636, y: 2058, size: 99, rotation: 4.18 },
      { kind: "ironwood", x: 3867, y: 2264, size: 149, rotation: 6.04 },
      { kind: "ironwood", x: 3760, y: 2573, size: 138, rotation: 0.05 },
      { kind: "ironwood", x: 3743, y: 2881, size: 126, rotation: 5.92 },
      { kind: "ironwood", x: 3636, y: 2960, size: 147, rotation: 5.83 },
      { kind: "ironwood", x: 3793, y: 3138, size: 115, rotation: 1.26 },
      { kind: "ironwood", x: 3501, y: 3290, size: 139, rotation: 5.17 },
      { kind: "ironwood", x: 3340, y: 3386, size: 99, rotation: 0.95 },
      { kind: "ironwood", x: 3169, y: 3155, size: 109, rotation: 5.86 },
      { kind: "ironwood", x: 2992, y: 3366, size: 136, rotation: 0.17 },
      { kind: "ironwood", x: 2622, y: 3299, size: 100, rotation: 1.93 },
      { kind: "ironwood", x: 2486, y: 3139, size: 154, rotation: 3.93 },
      { kind: "ironwood", x: 2186, y: 3246, size: 119, rotation: 2.80 },
      { kind: "ironwood", x: 1948, y: 3277, size: 122, rotation: 5.55 },
      { kind: "ironwood", x: 1774, y: 3286, size: 137, rotation: 1.50 },
      { kind: "ironwood", x: 1667, y: 3273, size: 128, rotation: 3.60 },
      { kind: "ironwood", x: 1456, y: 3366, size: 151, rotation: 1.78 },
      { kind: "ironwood", x: 1143, y: 3298, size: 142, rotation: 0.08 },
      { kind: "ironwood", x: 795, y: 3064, size: 126, rotation: 1.08 },
      { kind: "ironwood", x: 606, y: 3153, size: 134, rotation: 0.57 },
      { kind: "ironwood", x: 380, y: 3240, size: 126, rotation: 5.38 },
      { kind: "ironwood", x: 160, y: 3234, size: 103, rotation: 3.03 },
      { kind: "ironwood", x: -165, y: 3224, size: 128, rotation: 4.19 },
      { kind: "ironwood", x: -326, y: 3251, size: 115, rotation: 2.34 },
      { kind: "ironwood", x: -503, y: 3385, size: 118, rotation: 0.57 },
      { kind: "ironwood", x: -804, y: 3185, size: 143, rotation: 3.54 },
      { kind: "ironwood", x: -1089, y: 3290, size: 106, rotation: 5.64 },
      { kind: "ironwood", x: -1286, y: 3220, size: 128, rotation: 1.71 },
      { kind: "ironwood", x: -1437, y: 3333, size: 111, rotation: 4.48 },
      { kind: "ironwood", x: -1580, y: 3166, size: 123, rotation: 3.11 },
      { kind: "ironwood", x: -1883, y: 3322, size: 99, rotation: 3.94 },
      { kind: "ironwood", x: -2048, y: 3064, size: 105, rotation: 1.64 },
      { kind: "ironwood", x: -2326, y: 3292, size: 131, rotation: 5.82 },
      { kind: "ironwood", x: -2463, y: 3205, size: 122, rotation: 3.93 },
      { kind: "ironwood", x: -2595, y: 3064, size: 102, rotation: 3.56 },
      { kind: "ironwood", x: -2391, y: 2808, size: 128, rotation: 4.71 },
      { kind: "ironwood", x: -2560, y: 2463, size: 102, rotation: 2.80 },
      { kind: "ironwood", x: -2385, y: 2296, size: 138, rotation: 5.74 },
      { kind: "ironwood", x: -2672, y: 2044, size: 113, rotation: 0.67 },
      { kind: "ironwood", x: -2398, y: 1954, size: 122, rotation: 4.94 },
      { kind: "ironwood", x: -2655, y: 1720, size: 136, rotation: 5.81 },
      { kind: "ironwood", x: -2595, y: 1413, size: 116, rotation: 5.18 },
      { kind: "ironwood", x: -2404, y: 1252, size: 111, rotation: 2.64 },
      { kind: "ironwood", x: -2434, y: 1039, size: 109, rotation: 0.81 },
      { kind: "ironwood", x: -2383, y: 855, size: 144, rotation: 4.66 },
      { kind: "ironwood", x: -2459, y: 493, size: 150, rotation: 3.71 },
      { kind: "ironwood", x: -2571, y: 269, size: 143, rotation: 5.95 },
      { kind: "ironwood", x: -2564, y: -4, size: 116, rotation: 4.40 },
      { kind: "ironwood", x: -2535, y: -276, size: 121, rotation: 1.06 },
      { kind: "ironwood", x: -2546, y: -473, size: 151, rotation: 5.28 },
      { kind: "ironwood", x: -2421, y: -568, size: 118, rotation: 1.53 },
      { kind: "ironwood", x: -2653, y: -930, size: 133, rotation: 2.56 },
      { kind: "ironwood", x: -2492, y: -1005, size: 128, rotation: 5.76 },
      { kind: "ironwood", x: -2354, y: -1303, size: 150, rotation: 3.90 },
      { kind: "ironwood", x: -2663, y: -1444, size: 111, rotation: 1.35 },
      { kind: "ironwood", x: -2634, y: -1708, size: 119, rotation: 2.16 },
      { kind: "ironwood", x: -2617, y: -2040, size: 113, rotation: 0.35 },
      { kind: "ironwood", x: -2447, y: -2176, size: 124, rotation: 4.88 },
      { kind: "ironwood", x: -2645, y: -2330, size: 142, rotation: 4.56 },

      // belt at 3400, stems about 137
      { kind: "ironwood", x: -2907, y: -2936, size: 110, rotation: 1.48 },
      { kind: "ironwood", x: -2648, y: -2912, size: 140, rotation: 1.23 },
      { kind: "ironwood", x: -2408, y: -3077, size: 116, rotation: 0.17 },
      { kind: "ironwood", x: -2108, y: -3021, size: 162, rotation: 5.55 },
      { kind: "ironwood", x: -1805, y: -2798, size: 112, rotation: 1.50 },
      { kind: "ironwood", x: -1597, y: -3062, size: 154, rotation: 6.27 },
      { kind: "ironwood", x: -1252, y: -3009, size: 128, rotation: 4.27 },
      { kind: "ironwood", x: -1061, y: -3130, size: 162, rotation: 5.49 },
      { kind: "ironwood", x: -848, y: -3150, size: 172, rotation: 0.49 },
      { kind: "ironwood", x: -549, y: -3026, size: 143, rotation: 1.19 },
      { kind: "ironwood", x: -171, y: -3021, size: 168, rotation: 3.76 },
      { kind: "ironwood", x: 114, y: -3057, size: 138, rotation: 3.88 },
      { kind: "ironwood", x: 451, y: -2928, size: 122, rotation: 0.20 },
      { kind: "ironwood", x: 731, y: -2871, size: 145, rotation: 2.31 },
      { kind: "ironwood", x: 975, y: -2882, size: 163, rotation: 2.85 },
      { kind: "ironwood", x: 1155, y: -2896, size: 162, rotation: 1.17 },
      { kind: "ironwood", x: 1615, y: -2978, size: 128, rotation: 4.62 },
      { kind: "ironwood", x: 1728, y: -2890, size: 145, rotation: 5.92 },
      { kind: "ironwood", x: 2132, y: -2897, size: 157, rotation: 4.47 },
      { kind: "ironwood", x: 2411, y: -2981, size: 162, rotation: 2.33 },
      { kind: "ironwood", x: 2635, y: -3055, size: 123, rotation: 2.45 },
      { kind: "ironwood", x: 2854, y: -2878, size: 116, rotation: 0.36 },
      { kind: "ironwood", x: 3208, y: -2974, size: 133, rotation: 0.06 },
      { kind: "ironwood", x: 3434, y: -3042, size: 123, rotation: 1.87 },
      { kind: "ironwood", x: 3705, y: -2950, size: 122, rotation: 2.04 },
      { kind: "ironwood", x: 3794, y: -3135, size: 122, rotation: 5.50 },
      { kind: "ironwood", x: 4107, y: -3025, size: 128, rotation: 5.80 },
      { kind: "ironwood", x: 4358, y: -2950, size: 153, rotation: 2.51 },
      { kind: "ironwood", x: 4235, y: -2602, size: 156, rotation: 6.00 },
      { kind: "ironwood", x: 4133, y: -2338, size: 157, rotation: 1.60 },
      { kind: "ironwood", x: 4394, y: -2078, size: 162, rotation: 0.62 },
      { kind: "ironwood", x: 4094, y: -1720, size: 159, rotation: 4.91 },
      { kind: "ironwood", x: 4190, y: -1463, size: 123, rotation: 0.66 },
      { kind: "ironwood", x: 4285, y: -1166, size: 171, rotation: 4.93 },
      { kind: "ironwood", x: 4256, y: -935, size: 155, rotation: 4.86 },
      { kind: "ironwood", x: 4157, y: -654, size: 150, rotation: 5.90 },
      { kind: "ironwood", x: 4254, y: -371, size: 150, rotation: 4.42 },
      { kind: "ironwood", x: 4322, y: -283, size: 137, rotation: 1.33 },
      { kind: "ironwood", x: 4135, y: 126, size: 150, rotation: 4.09 },
      { kind: "ironwood", x: 4236, y: 425, size: 152, rotation: 5.49 },
      { kind: "ironwood", x: 4239, y: 653, size: 112, rotation: 5.40 },
      { kind: "ironwood", x: 4170, y: 918, size: 128, rotation: 1.41 },
      { kind: "ironwood", x: 4195, y: 1098, size: 150, rotation: 1.09 },
      { kind: "ironwood", x: 4167, y: 1444, size: 117, rotation: 3.59 },
      { kind: "ironwood", x: 4283, y: 1636, size: 167, rotation: 1.99 },
      { kind: "ironwood", x: 4400, y: 2025, size: 125, rotation: 3.93 },
      { kind: "ironwood", x: 4087, y: 2299, size: 143, rotation: 0.95 },
      { kind: "ironwood", x: 4368, y: 2406, size: 131, rotation: 5.34 },
      { kind: "ironwood", x: 4091, y: 2738, size: 135, rotation: 1.69 },
      { kind: "ironwood", x: 4161, y: 3097, size: 128, rotation: 5.52 },
      { kind: "ironwood", x: 4232, y: 3406, size: 168, rotation: 4.86 },
      { kind: "ironwood", x: 4444, y: 3519, size: 126, rotation: 3.79 },
      { kind: "ironwood", x: 4155, y: 3733, size: 141, rotation: 3.55 },
      { kind: "ironwood", x: 3914, y: 3858, size: 143, rotation: 0.10 },
      { kind: "ironwood", x: 3533, y: 3534, size: 138, rotation: 0.03 },
      { kind: "ironwood", x: 3257, y: 3762, size: 130, rotation: 2.47 },
      { kind: "ironwood", x: 3142, y: 3845, size: 172, rotation: 1.78 },
      { kind: "ironwood", x: 2938, y: 3645, size: 153, rotation: 5.90 },
      { kind: "ironwood", x: 2518, y: 3612, size: 144, rotation: 2.12 },
      { kind: "ironwood", x: 2174, y: 3779, size: 156, rotation: 2.78 },
      { kind: "ironwood", x: 1945, y: 3528, size: 126, rotation: 4.24 },
      { kind: "ironwood", x: 1760, y: 3597, size: 149, rotation: 0.55 },
      { kind: "ironwood", x: 1500, y: 3606, size: 135, rotation: 5.84 },
      { kind: "ironwood", x: 1320, y: 3733, size: 120, rotation: 6.14 },
      { kind: "ironwood", x: 872, y: 3610, size: 122, rotation: 3.13 },
      { kind: "ironwood", x: 572, y: 3690, size: 150, rotation: 3.00 },
      { kind: "ironwood", x: 335, y: 3906, size: 144, rotation: 0.75 },
      { kind: "ironwood", x: 64, y: 3672, size: 152, rotation: 6.09 },
      { kind: "ironwood", x: -266, y: 3690, size: 156, rotation: 4.45 },
      { kind: "ironwood", x: -594, y: 3903, size: 156, rotation: 0.76 },
      { kind: "ironwood", x: -768, y: 3674, size: 135, rotation: 1.97 },
      { kind: "ironwood", x: -940, y: 3633, size: 127, rotation: 1.49 },
      { kind: "ironwood", x: -1253, y: 3851, size: 124, rotation: 3.36 },
      { kind: "ironwood", x: -1473, y: 3836, size: 153, rotation: 5.16 },
      { kind: "ironwood", x: -1927, y: 3811, size: 159, rotation: 1.52 },
      { kind: "ironwood", x: -1969, y: 3539, size: 142, rotation: 5.77 },
      { kind: "ironwood", x: -2292, y: 3747, size: 115, rotation: 5.86 },
      { kind: "ironwood", x: -2636, y: 3671, size: 168, rotation: 2.11 },
      { kind: "ironwood", x: -2800, y: 3744, size: 122, rotation: 3.77 },
      { kind: "ironwood", x: -2915, y: 3564, size: 162, rotation: 2.15 },
      { kind: "ironwood", x: -3101, y: 3195, size: 155, rotation: 2.56 },
      { kind: "ironwood", x: -2970, y: 3042, size: 144, rotation: 5.83 },
      { kind: "ironwood", x: -2798, y: 2881, size: 170, rotation: 0.39 },
      { kind: "ironwood", x: -3168, y: 2537, size: 163, rotation: 1.53 },
      { kind: "ironwood", x: -3180, y: 2267, size: 169, rotation: 1.29 },
      { kind: "ironwood", x: -2834, y: 2084, size: 164, rotation: 1.72 },
      { kind: "ironwood", x: -2920, y: 1803, size: 129, rotation: 4.16 },
      { kind: "ironwood", x: -2812, y: 1521, size: 146, rotation: 2.37 },
      { kind: "ironwood", x: -2802, y: 1206, size: 157, rotation: 5.67 },
      { kind: "ironwood", x: -2982, y: 907, size: 115, rotation: 4.79 },
      { kind: "ironwood", x: -3189, y: 517, size: 131, rotation: 3.51 },
      { kind: "ironwood", x: -2816, y: 326, size: 133, rotation: 3.13 },
      { kind: "ironwood", x: -2875, y: 11, size: 131, rotation: 2.12 },
      { kind: "ironwood", x: -3018, y: -301, size: 156, rotation: 1.03 },
      { kind: "ironwood", x: -2837, y: -411, size: 161, rotation: 1.08 },
      { kind: "ironwood", x: -2956, y: -702, size: 164, rotation: 4.49 },
      { kind: "ironwood", x: -3136, y: -1030, size: 156, rotation: 5.98 },
      { kind: "ironwood", x: -3012, y: -1377, size: 113, rotation: 4.21 },
      { kind: "ironwood", x: -2818, y: -1472, size: 158, rotation: 4.37 },
      { kind: "ironwood", x: -2995, y: -1771, size: 155, rotation: 1.36 },
      { kind: "ironwood", x: -2924, y: -2058, size: 141, rotation: 3.00 },
      { kind: "ironwood", x: -2974, y: -2345, size: 119, rotation: 1.95 },
      { kind: "ironwood", x: -3086, y: -2547, size: 123, rotation: 6.17 },
      { kind: "ironwood", x: -2823, y: -2948, size: 129, rotation: 2.43 },

      // AND THE HILLS BEYOND THE WOOD. Two lines, the second offset behind the
      // first so the gaps between the near hills are filled rather than showing
      // sky through them.
      //
      // THEY ARE LOW ON PURPOSE. At a third of this size they were 1800 units
      // tall at 2600 units out, which is twenty degrees above the eye -- and
      // the whole band of sky this camera can ever show is FOUR degrees, since
      // the field of view is 32 and the flattest pitch is 12. So mountains that
      // read as mountains from the clearing were a wall across the entire top
      // of the frame, and the report was "I still cannot see the sky". These
      // MEASURED, not eyeballed. The band of sky this camera can show is about
      // seven degrees wide (32 degree field of view, 9 degree pitch floor). Most
      // of the ring sits at three to five degrees above the eye at full zoom-out
      // -- clear of the treeline, with sky over it -- and the nearest one
      // reaches about ten, so turning to face it fills the band. That is what a
      // mountain does when you look straight at it, and it is the reason the
      // whole ring cannot simply be made taller.
      //
      // AND THE SIZE IS CAPPED, at 1220. The angle a hill subtends ABOVE THE EYE
      // is brutally sensitive here, because their crowns sit only a little over
      // it: a fifteen per cent growth in size moved the tallest from two and a
      // half degrees to nine. The cap holds the two or three that end up nearest
      // the camera; every hill under it grows freely.
      { kind: "ridge", x: -3320, y: -3392, size: 846, rotation: 0.36 },
      { kind: "ridge", x: -2504, y: -3586, size: 743, rotation: 2.81 },
      { kind: "ridge", x: -1367, y: -3601, size: 673, rotation: 0.22 },
      { kind: "ridge", x: -627, y: -3461, size: 807, rotation: 3.24 },
      { kind: "ridge", x: 738, y: -3515, size: 831, rotation: 0.91 },
      { kind: "ridge", x: 1869, y: -3509, size: 754, rotation: 2.86 },
      { kind: "ridge", x: 2264, y: -3519, size: 1030, rotation: 2.16 },
      { kind: "ridge", x: 3491, y: -3510, size: 685, rotation: 1.30 },
      { kind: "ridge", x: 4316, y: -3503, size: 835, rotation: 1.76 },
      { kind: "ridge", x: 4731, y: -3226, size: 899, rotation: 3.31 },
      { kind: "ridge", x: 4921, y: -2196, size: 845, rotation: 4.61 },
      { kind: "ridge", x: 4742, y: -1846, size: 980, rotation: 1.36 },
      { kind: "ridge", x: 4744, y: -714, size: 769, rotation: 1.70 },
      { kind: "ridge", x: 4712, y: 66, size: 922, rotation: 1.74 },
      { kind: "ridge", x: 4681, y: 1059, size: 780, rotation: 5.93 },
      { kind: "ridge", x: 4781, y: 1998, size: 858, rotation: 3.88 },
      { kind: "ridge", x: 4891, y: 3259, size: 1000, rotation: 2.46 },
      { kind: "ridge", x: 4897, y: 3824, size: 895, rotation: 2.42 },
      { kind: "ridge", x: 4355, y: 4199, size: 899, rotation: 1.07 },
      { kind: "ridge", x: 3852, y: 4355, size: 1038, rotation: 3.28 },
      { kind: "ridge", x: 2376, y: 4185, size: 976, rotation: 4.35 },
      { kind: "ridge", x: 1951, y: 4159, size: 936, rotation: 4.03 },
      { kind: "ridge", x: 961, y: 4179, size: 969, rotation: 3.53 },
      { kind: "ridge", x: 52, y: 4252, size: 769, rotation: 5.13 },
      { kind: "ridge", x: -700, y: 4241, size: 756, rotation: 4.45 },
      { kind: "ridge", x: -1747, y: 4177, size: 881, rotation: 2.31 },
      { kind: "ridge", x: -2541, y: 4275, size: 683, rotation: 0.75 },
      { kind: "ridge", x: -3333, y: 4219, size: 1038, rotation: 1.65 },
      { kind: "ridge", x: -3582, y: 3061, size: 787, rotation: 3.35 },
      { kind: "ridge", x: -3617, y: 2198, size: 742, rotation: 1.25 },
      { kind: "ridge", x: -3515, y: 1606, size: 681, rotation: 5.96 },
      { kind: "ridge", x: -3455, y: 67, size: 1011, rotation: 6.16 },
      { kind: "ridge", x: -3575, y: -78, size: 814, rotation: 1.65 },
      { kind: "ridge", x: -3464, y: -1329, size: 693, rotation: 1.67 },
      { kind: "ridge", x: -3487, y: -1960, size: 1014, rotation: 5.69 },
      { kind: "ridge", x: -3588, y: -3101, size: 727, rotation: 1.91 },
      { kind: "ridge", x: -3604, y: -4246, size: 1128, rotation: 1.56 },
      { kind: "ridge", x: -1991, y: -4214, size: 913, rotation: 4.39 },
      { kind: "ridge", x: -1380, y: -4170, size: 1090, rotation: 3.80 },
      { kind: "ridge", x: -248, y: -3969, size: 1220, rotation: 1.16 },
      { kind: "ridge", x: 581, y: -4020, size: 1011, rotation: 2.56 },
      { kind: "ridge", x: 1892, y: -4202, size: 984, rotation: 3.09 },
      { kind: "ridge", x: 3154, y: -4234, size: 949, rotation: 4.84 },
      { kind: "ridge", x: 4366, y: -4283, size: 1138, rotation: 1.49 },
      { kind: "ridge", x: 5535, y: -3895, size: 1220, rotation: 4.58 },
      { kind: "ridge", x: 5420, y: -2340, size: 1056, rotation: 3.71 },
      { kind: "ridge", x: 5286, y: -1207, size: 860, rotation: 0.81 },
      { kind: "ridge", x: 5557, y: -507, size: 980, rotation: 4.25 },
      { kind: "ridge", x: 5581, y: 869, size: 1220, rotation: 5.72 },
      { kind: "ridge", x: 5398, y: 1673, size: 1010, rotation: 3.69 },
      { kind: "ridge", x: 5352, y: 2819, size: 1136, rotation: 4.02 },
      { kind: "ridge", x: 5312, y: 4367, size: 1210, rotation: 3.93 },
      { kind: "ridge", x: 4901, y: 4874, size: 1092, rotation: 3.89 },
      { kind: "ridge", x: 3557, y: 4930, size: 1028, rotation: 5.48 },
      { kind: "ridge", x: 2458, y: 4895, size: 1134, rotation: 2.63 },
      { kind: "ridge", x: 861, y: 4736, size: 1155, rotation: 4.15 },
      { kind: "ridge", x: 425, y: 4726, size: 1113, rotation: 1.22 },
      { kind: "ridge", x: -679, y: 4994, size: 1173, rotation: 0.33 },
      { kind: "ridge", x: -1728, y: 4933, size: 1149, rotation: 3.82 },
      { kind: "ridge", x: -3370, y: 4802, size: 980, rotation: 5.81 },
      { kind: "ridge", x: -4273, y: 4649, size: 1128, rotation: 4.50 },
      { kind: "ridge", x: -4225, y: 3518, size: 888, rotation: 4.65 },
      { kind: "ridge", x: -3978, y: 1847, size: 1060, rotation: 4.09 },
      { kind: "ridge", x: -3985, y: 977, size: 913, rotation: 3.82 },
      { kind: "ridge", x: -4032, y: 330, size: 1052, rotation: 2.89 },
      { kind: "ridge", x: -4092, y: -1279, size: 1132, rotation: 4.56 },
      { kind: "ridge", x: -4069, y: -2794, size: 1018, rotation: 5.80 },
      { kind: "ridge", x: -4009, y: -3379, size: 915, rotation: 5.01 },
      { kind: "ironwood", x: 17, y: 376, size: 26, rotation: 3.38 },
      { kind: "ironwood", x: 570, y: 23, size: 27, rotation: 0.88 },
      { kind: "ironwood", x: 1273, y: 222, size: 24, rotation: 1.52 },
      { kind: "ironwood", x: 185, y: 684, size: 27, rotation: 5.67 },
      { kind: "ironwood", x: 712, y: 719, size: 24, rotation: 0.55 },
      { kind: "ironwood", x: 792, y: 720, size: 27, rotation: 5.65 },
      { kind: "ironwood", x: 719, y: 692, size: 25, rotation: 0.96 },
      { kind: "ironwood", x: 1149, y: 714, size: 25, rotation: 1.05 },
      { kind: "ironwood", x: 156, y: 82, size: 24, rotation: 6.25 },
      { kind: "ironwood", x: 170, y: 93, size: 24, rotation: 6.21 },
      { kind: "ironwood", x: 95, y: 91, size: 24, rotation: 4.63 },
      { kind: "ironwood", x: 86, y: 61, size: 24, rotation: 1.99 },
      { kind: "ironwood", x: 1139, y: 626, size: 24, rotation: 1.94 },
      { kind: "ironwood", x: 1155, y: 609, size: 24, rotation: 0.83 },
      { kind: "ironwood", x: 1152, y: 588, size: 24, rotation: 4.04 },
      { kind: "ironwood", x: 1187, y: 660, size: 24, rotation: 2.83 },
      { kind: "ironwood", x: 73, y: 659, size: 24, rotation: 3.77 },
      { kind: "ironwood", x: 10, y: 647, size: 24, rotation: 2.49 },
      { kind: "ironwood", x: 21, y: 608, size: 24, rotation: 0.94 },
      { kind: "ironwood", x: 19, y: 608, size: 24, rotation: 2.64 },

      // THE TREELINE GETS BIGGER AND THICKER AS IT GOES OUT, which is the
      // trick that gives an open board a horizon without a skybox: the wood
      // does not simply continue, it CLOSES, and the eye reads that as
      // distance. Four rings, each denser than the last and each carrying
      // taller stems, then a ridge line of hills beyond all of them.
      //
      // Every one of these is outside the play area, on the apron, where a prop
      // can never hide a tower, an enemy or a build spot -- which is the one
      // place a forest is allowed to be this dense.

      // THE HORIZON ITSELF: low hills right out at the edge of the ground, big
      // enough to sit above the treeline and hazy enough to read as far away.
      // They are what the board is missing when it reads as "a bigger
      // rectangle" -- there has to be something the forest ENDS against.

      // AND A SECOND LINE BEHIND THE FIRST, further out and taller.
      //
      // One row of hills leaves gaps between the hills, and every gap is a
      // hole you see sky through -- which is the whole of the report that
      // sent this back: "we can still see the sky". A second row offset
      // behind the first closes them, and it buys the thing a single row
      // cannot have at any size: the far ridge reads as FURTHER than the
      // near one, because the haze eats more of it.

      // Inner groves, kept off the road and off the stumps.
      { kind: "ironwood", x: 688, y: 105, size: 24, rotation: 4.26 },
      { kind: "ironwood", x: 672, y: 103, size: 24, rotation: 3.12 },
      { kind: "ironwood", x: 736, y: 104, size: 24, rotation: 5.97 },
      { kind: "ironwood", x: 933, y: 626, size: 24, rotation: 3.75 },
      { kind: "ironwood", x: 990, y: 642, size: 24, rotation: 1.54 },
      { kind: "ironwood", x: 923, y: 632, size: 24, rotation: 1.49 },
      { kind: "ironwood", x: 137, y: 585, size: 24, rotation: 5.21 },
      { kind: "ironwood", x: 206, y: 604, size: 24, rotation: 6.23 },
      { kind: "ironwood", x: 178, y: 571, size: 24, rotation: 2.73 },
      { kind: "ironwood", x: 523, y: 647, size: 24, rotation: 5.59 },
      { kind: "ironwood", x: 492, y: 593, size: 24, rotation: 3.12 },
      { kind: "ironwood", x: 512, y: 599, size: 24, rotation: 0.07 },
      { kind: "ironwood", x: 1097, y: 456, size: 24, rotation: 1.41 },
      { kind: "ironwood", x: 1116, y: 481, size: 24, rotation: 3.25 },
      { kind: "ironwood", x: 1133, y: 453, size: 24, rotation: 2.20 },
      { kind: "ironwood", x: 271, y: 129, size: 24, rotation: 4.84 },
      { kind: "ironwood", x: 245, y: 161, size: 24, rotation: 5.48 },
      { kind: "ironwood", x: 280, y: 139, size: 24, rotation: 0.61 },

      // Ground litter in the clearings: knee-high only, so nothing here stands
      // between the camera and a tower.
      { kind: "mossrock", x: 505, y: 330, size: 22, rotation: 0.6 },
      { kind: "mossrock", x: 745, y: 470, size: 20, rotation: 2.4 },
      { kind: "mossrock", x: 895, y: 175, size: 21, rotation: 4.1 },
      { kind: "mossrock", x: 240, y: 250, size: 19, rotation: 1.3 },
      { kind: "deadfall", x: 610, y: 585, size: 32, rotation: 0.35 },
      { kind: "deadfall", x: 1105, y: 545, size: 28, rotation: 2.1 },
      { kind: "deadfall", x: 175, y: 545, size: 30, rotation: 1.7 },
      { kind: "fern", x: 520, y: 500, size: 24, rotation: 1.1 },
      { kind: "fern", x: 860, y: 585, size: 26, rotation: 0.4 },
      { kind: "fern", x: 300, y: 560, size: 22, rotation: 2.7 },
      { kind: "fern", x: 1060, y: 150, size: 24, rotation: 3.3 },
      { kind: "fern", x: 690, y: 330, size: 20, rotation: 1.9 },
      { kind: "deadfall", x: 455, y: 130, size: 30, rotation: 0.8 },
      { kind: "deadfall", x: 1090, y: 400, size: 28, rotation: 2.9 },

      // --- gameplay geometry is NOT in this list ----------------------------
      //
      // The five blockers and the six stumps used to be here, as ordinary props
      // carrying a `blockerId` and a size of their own beside the shape in
      // `blockers`. The comment above them claimed they were "drawn at the
      // position and size the blocker list authors" and they were not: a
      // blocker of radius 48 had a prop of SIZE 48, so the rock was drawn at
      // half the width of the rock you collide with, and every one of them wore
      // an invisible skirt. The owner found it by playing: "the hitbox of the
      // obstacles does not correspond with their visual".
      //
      // A comment cannot hold two numbers together. They are built FROM the
      // compiled shapes now -- see GLGeometry.solid and the pass in gl-world --
      // which is the only arrangement where the question cannot have a wrong
      // answer, and test 22 asserts no prop of those kinds ever comes back.

      // --- the settlement ---------------------------------------------------
      { kind: "townhall",   x: 150, y: 362, size: 66, rotation: 0,    propId: "townhall" },
      { kind: "house",      x: 78,  y: 268, size: 44, rotation: 0.12, propId: "house-northwest" },
      { kind: "house",      x: 160, y: 258, size: 46, rotation: -0.08, propId: "house-north" },
      { kind: "house",      x: 52,  y: 350, size: 42, rotation: 0.2,  propId: "house-west" },
      { kind: "house",      x: 82,  y: 448, size: 45, rotation: -0.15, propId: "house-southwest" },
      { kind: "storehouse", x: 178, y: 458, size: 52, rotation: 0.05, propId: "storehouse-south" },
      { kind: "workshop",   x: 232, y: 300, size: 40, rotation: -0.1, propId: "workshop-east" },
      { kind: "gate",       x: 285, y: 360, size: 46, rotation: 0,    propId: "settlement-gate" },
      // THE WALL IS GENERATED FROM THE OCTAGON, one segment per edge, with the
      // east edge split around the gate's 330-390 opening. It used to be five
      // hand-placed runs that did not follow the footprint at all: the
      // settlement read as buildings standing among scattered walls rather than
      // as a fortified enclosure, which is what it is supposed to be.
      { kind: "palisade", x: 145, y: 225, size: 150, rotation: 0.0000 },
      { kind: "palisade", x: 252, y: 258, size: 92, rotation: 0.7854 },
      { kind: "palisade", x: 285, y: 310, size: 40, rotation: 1.5708 },
      { kind: "palisade", x: 285, y: 410, size: 40, rotation: 1.5708 },
      { kind: "palisade", x: 252, y: 468, size: 99, rotation: 2.2849 },
      { kind: "palisade", x: 145, y: 505, size: 150, rotation: 3.1416 },
      { kind: "palisade", x: 45, y: 468, size: 90, rotation: -2.1588 },
      { kind: "palisade", x: 20, y: 360, size: 140, rotation: -1.5708 },
      { kind: "palisade", x: 45, y: 258, size: 82, rotation: -0.9151 },
      { kind: "lantern",    x: 258, y: 322, size: 16, rotation: 0 },
      { kind: "lantern",    x: 258, y: 398, size: 16, rotation: 0 },
      { kind: "lantern",    x: 110, y: 318, size: 14, rotation: 0 },
      { kind: "barrel",     x: 208, y: 392, size: 15, rotation: 0.6 },
      { kind: "barrel",     x: 216, y: 408, size: 14, rotation: 2.2 },

      // --- the depot --------------------------------------------------------
      //
      // One object, built from several: the hull, the freight door facing west,
      // the ramp that meets the road's first point, and the running gear that
      // says it arrived rather than was built here.
      { kind: "depot",      x: 1158, y: 178, size: 120, rotation: 0, propId: "enemy-depot" },
      { kind: "depot-ramp", x: 1088, y: 180, size: 46,  rotation: 0 },
      { kind: "wheel",      x: 1092, y: 262, size: 26, rotation: 0 },
      { kind: "wheel",      x: 1178, y: 276, size: 28, rotation: 0 },
      { kind: "wheel",      x: 1252, y: 254, size: 24, rotation: 0 },
      { kind: "wheel",      x: 1096, y: 108, size: 24, rotation: 0 },
      { kind: "wheel",      x: 1196, y: 96,  size: 26, rotation: 0 },
      { kind: "exhaust",    x: 1236, y: 116, size: 22, rotation: 0 },
      { kind: "exhaust",    x: 1256, y: 148, size: 19, rotation: 0 },
      { kind: "floodlight", x: 1082, y: 132, size: 15, rotation: 0 },
      { kind: "floodlight", x: 1082, y: 232, size: 15, rotation: 0 }
    ]
  },

  "test": {
    theme: {
      background: "#0a0b09", floor: "#1a1913", panel: "#3a3527",
      // A HAIR DARKER THAN THE FLOOR, DELIBERATELY. `panelDark` is what the
      // bare-earth patches are painted in, and at the first value it was six
      // stops under the floor -- which on a board with no seams and no grid
      // did not read as ground at all, it read as three rectangular PITS cut
      // into the forest. Ground variation is the effect; a hole is not.
      panelDark: "#171610", panelLine: "64,60,46", accent: "255,138,52",
      // THE SECOND COLOUR ON THE BOARD, and it is not a second brown.
      //
      // `accent2` was a bone grey and did nothing: on a board whose floor,
      // panels, metal and road are all within a few stops of each other, a
      // near-white highlight is not a colour, it is a lighter version of the
      // same one. Cyan is what the buried facility is lit in -- the cable
      // cores, the sensor masts, the nodes at the deck corners -- so the board
      // now has an ember (the camp, warm, alive) and a cyan (the plant, cold,
      // running with nobody left to run it), which is a picture rather than a
      // palette.
      accent2: "120,214,255", metal: "#4a4336", metalDark: "#1c1812",
      // THE ROAD IS THE DARKEST SURFACE ON THE BOARD AND ITS MARKINGS ARE THE
      // COLDEST. Both halves are deliberate: the enemy's ground is black
      // asphalt against dirt and lighter milled decks, so "where do they walk"
      // and "where may I build" are answered by value before anything else,
      // and the kerb line and centre dashes are cyan because the plant marked
      // its own service road and nobody has repainted it.
      roadOuter: "#100f0b", roadInner: "#2a2519",
      roadEdge: "120,170,178", roadCenter: "150,214,228",
      // AND THE ONE KEY NO OTHER BOARD SETS. Black asphalt on black dirt has
      // no value contrast left to be seen by, which on the board that most
      // needs its route read is the wrong place to be austere. `roadGlow` puts
      // two emissive lines along the kerbs in the 3D board (GLGeometry.road) --
      // the plant's own service lighting, still running, and the only thing
      // that makes the notch, the basin and the wire gate legible from the
      // opening camera.
      roadGlow: "96,178,196",
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
    // THE RIVER, and it is the only terrain in the game that is not flat.
    //
    // It runs north-south across the board and the road crosses it ONCE, on
    // the long straight after the notch -- which is the whole reason the
    // crossing is worth building: a bridge on a corner is a bridge nobody
    // looks at, and a bridge on the long straight is the thing the player
    // watches every wave walk over. The width profile narrows the road onto
    // the bridge deck, so the crossing is a chokepoint as well as a picture.
    //
    // ITS COLUMN IS A NO-BUILD STRIP THE FULL HEIGHT OF THE BOARD, which is
    // the reason the route was drawn where it was: at x 359..481 nothing may
    // stand, so the road crosses it square, the decks stand clear of it either
    // side, and the switchbacks fold east of it where there is ground to build
    // on.
    //
    // `banks` is the earth cut on EACH side of the water, so the band the
    // floor has to open for is width/2 + banks either side of `x`: 359..481.
    // Nothing may stand in that strip -- see the props that were moved off it
    // when this landed -- and `js/gl/gl-world.js` refuses a tower there
    // outright rather than letting one stand flat on the bed.
    //
    // `spill: "min"` is the low-y edge, which under the default camera is the
    // NEAR one: the water runs toward the viewer and goes over the edge of the
    // board into the void, in full view, rather than off the far side where
    // all you would see is it stopping.
    //
    // The two colours are authored here for the reason every other colour on
    // this board is: the theme's one saturated note is an ember and water is
    // not an ember. Cold, desaturated, and only a few stops off the black
    // dirt -- the contrast is in VALUE, which is this board's whole rule.
    river: {
      x: 420, width: 78, banks: 22, depth: 34,
      spill: "min", water: "#18222a", foam: "#63777c"
    },
    // THE GROUND, IN FOUR COLOURS, and every one of them is FLAT.
    //
    // A slab has a rim, `World3D.levelUnder` refuses a footprint that straddles
    // one, and a patch of mud built as a slab is an invisible no-build ring in
    // open ground -- so `dirt`, `plate` and `flux` all stamp zero height (see
    // ZONE_HEIGHT in js/gl/gl-world.js). They are paint, and they are here
    // because a board asked to stop being monochrome cannot answer with one
    // more shade of the same brown:
    //
    //   dirt   bare earth scraped through the litter, the floor's own shadow.
    //   plate  cracked floor panel, all that is left of the buildings that
    //          stood here. Milled, seamed, and lighter than the dirt.
    //   flux   ground the buried plant is still leaking into. The board's ONE
    //          saturated colour, weak, on the ground rather than in the air.
    //
    // THE FOUR DECKS ARE THE OTHER THING ENTIRELY, and they are gameplay
    // furniture rather than paint: raised, rimmed, unmistakable from above, and
    // placed exactly where a tower does the most work. A player who builds on
    // the four of them and nowhere else has covered every leg of this route,
    // and two of them (the island and the knoll) reach two lanes at once
    // because the switchbacks fold the road back past them.
    //
    //   the west spur    215,225   the entry straight, the first corner and
    //                              the notch, all from one pocket.
    //   the relay island 505,360   inside the first switchback. Ninety units
    //                              from the crossing straight and ninety from
    //                              the lane coming back -- both inside a
    //                              Rifleman's 100.
    //   the knoll        540,215   between the basin and the switchback below
    //                              it, and in reach of the climb as well.
    //   the camp deck    870,440   the wire gate and the whole run to the base.
    //
    // Nothing stands ON any of the four. Props are drawn at floor height
    // whatever they are standing over, so a prop on a deck sinks into it --
    // and a deck is where the player's guns go, which is the last place that
    // wants scenery in the way. They are marked at the corners instead.
    zones: [
      { kind: "deck", x: 215, y: 225, w: 130, h: 150 },
      { kind: "deck", x: 505, y: 360, w: 130, h: 130 },
      { kind: "deck", x: 540, y: 215, w: 175, h: 85 },
      { kind: "deck", x: 870, y: 440, w: 180, h: 115 },
      { kind: "bay", x: 1100, y: 470, w: 175, h: 105 },

      { kind: "plate", x: 900, y: 190, w: 160, h: 140 },
      { kind: "plate", x: 1080, y: 610, w: 190, h: 90 },
      { kind: "plate", x: 205, y: 40, w: 145, h: 95 },
      { kind: "dirt", x: 40, y: 250, w: 120, h: 130 },
      { kind: "dirt", x: 200, y: 560, w: 150, h: 120 },
      { kind: "dirt", x: 690, y: 590, w: 210, h: 105 },
      { kind: "flux", x: 500, y: 545, w: 200, h: 110 },
      { kind: "flux", x: 30, y: 430, w: 130, h: 95 },
      { kind: "flux", x: 640, y: 40, w: 150, h: 75 }
    ],
    // THE TREELINE IS THE FRAME, THE ROAD IS THE SUBJECT, AND THE RELAY IS WHAT
    // THE FOREST GREW OVER.
    //
    // Full-height stems are banked along the top, the left edge and the bottom,
    // where they can never stand between the camera and a tower. Everything
    // inside the route's pockets is knee-high, or it is machinery.
    //
    // THE MACHINERY IS THE HALF OF THIS BOARD THAT IS NEW, and it is authored
    // by what it points at rather than by where there was a gap:
    //
    //   conduit  a buried cable run with its core showing, laid PARALLEL to the
    //            road. It is the only prop on the board whose job is to point
    //            along something -- five of them walk the eye from the gate to
    //            the base, and where the road turns, the run turns with it.
    //   pylon    an energy node. Two stand at the corners of every deck, which
    //            is how a tower zone announces itself from above.
    //   antenna  a sensor array, on the high ground looking over the basin and
    //            the crossing.
    //   holo /
    //   console  the relay itself: what the facility was for, in the board's
    //            own ember, because the camp took these over and runs them.
    //   gate     the two ends of the route (see below).
    //
    // COLOUR IS THE ARGUMENT AND IT HAS EXACTLY TWO SIDES. The board's theme
    // accent is an ember and everything the CAMP owns burns in it -- the
    // watchtower lamp, the barrels, the relay consoles they took over, the
    // gate they will run back through. Everything the FACILITY owns is cold
    // cyan and declares `accent` per prop, which costs one extra draw call per
    // colour and is the only way a prop can own its own light (see
    // `accentMeshes`, js/gl/gl-world.js). Two lights, two owners, on a floor
    // that is neither.
    models: [
      // THE TREELINE, and half of it stands OUTSIDE the 1280x720 play area.
      // The 3D board is built 120 units proud of the view on every side (see
      // buildMapMesh), so there is real ground out there for a wall of stems
      // to stand on -- and a prop out there can never hide a tower, an enemy
      // or a build spot, because none of those can be there. It is the one
      // place a forest can actually be DENSE.
      { kind: "tree", x: -70, y: -40, size: 50, rotation: 1.1 },
      { kind: "tree", x: -118, y: 92, size: 44, rotation: 3.4 },
      { kind: "tree", x: -75, y: 330, size: 48, rotation: 0.2 },
      { kind: "tree", x: -55, y: 520, size: 42, rotation: 2.6 },
      { kind: "tree", x: -70, y: 700, size: 46, rotation: 4.7 },
      { kind: "tree", x: 120, y: -60, size: 43, rotation: 2.1 },
      { kind: "tree", x: 320, y: -55, size: 47, rotation: 0.8 },
      { kind: "tree", x: 610, y: -70, size: 41, rotation: 3.7 },
      { kind: "tree", x: 720, y: -50, size: 45, rotation: 1.4 },
      { kind: "tree", x: 920, y: -65, size: 49, rotation: 5.1 },
      { kind: "tree", x: 1120, y: -55, size: 42, rotation: 2.3 },
      { kind: "tree", x: 1330, y: -40, size: 46, rotation: 0.5 },
      { kind: "tree", x: 1345, y: 140, size: 44, rotation: 3.1 },
      { kind: "tree", x: 1350, y: 690, size: 45, rotation: 1.8 },
      { kind: "tree", x: 210, y: 760, size: 44, rotation: 4.2 },
      { kind: "tree", x: 300, y: 778, size: 48, rotation: 0.9 },
      { kind: "tree", x: 650, y: 765, size: 42, rotation: 2.5 },
      { kind: "tree", x: 880, y: 780, size: 46, rotation: 5.3 },
      { kind: "tree", x: 1120, y: 770, size: 43, rotation: 1.0 },

      // The stems that stand on the board itself, in the pockets the route and
      // the decks leave. None of them is in the river's cut and none is on the
      // tarmac; both are pinned by tests, because scenery is never validated
      // against terrain at run time.
      { kind: "tree", x: 55, y: 70, size: 46, rotation: 0.3 },
      { kind: "tree", x: 140, y: 118, size: 38, rotation: 1.9 },
      { kind: "tree", x: 262, y: 152, size: 40, rotation: 3.2 },
      { kind: "tree", x: 330, y: 62, size: 44, rotation: 0.7 },
      { kind: "tree", x: 330, y: 200, size: 36, rotation: 2.4 },
      { kind: "tree", x: 545, y: 62, size: 42, rotation: 4.1 },
      { kind: "tree", x: 620, y: 108, size: 34, rotation: 1.2 },
      { kind: "tree", x: 745, y: 58, size: 46, rotation: 5.0 },
      { kind: "tree", x: 880, y: 62, size: 38, rotation: 2.8 },
      { kind: "tree", x: 1010, y: 55, size: 43, rotation: 0.4 },
      { kind: "tree", x: 1150, y: 96, size: 45, rotation: 3.6 },
      { kind: "tree", x: 1258, y: 42, size: 39, rotation: 1.5 },
      { kind: "tree", x: 1236, y: 168, size: 41, rotation: 4.8 },
      { kind: "tree", x: 42, y: 232, size: 40, rotation: 2.2 },
      { kind: "tree", x: 30, y: 392, size: 44, rotation: 0.9 },
      { kind: "tree", x: 45, y: 552, size: 37, rotation: 3.9 },
      { kind: "tree", x: 122, y: 622, size: 46, rotation: 1.6 },
      { kind: "tree", x: 232, y: 700, size: 41, rotation: 5.2 },
      { kind: "tree", x: 330, y: 620, size: 43, rotation: 0.6 },
      { kind: "tree", x: 520, y: 690, size: 38, rotation: 2.7 },
      { kind: "tree", x: 626, y: 672, size: 45, rotation: 4.3 },
      { kind: "tree", x: 762, y: 700, size: 40, rotation: 1.1 },
      { kind: "tree", x: 900, y: 672, size: 42, rotation: 3.3 },
      { kind: "tree", x: 1042, y: 690, size: 39, rotation: 5.5 },
      { kind: "tree", x: 1300, y: 620, size: 44, rotation: 2.0 },
      { kind: "tree", x: 940, y: 240, size: 36, rotation: 1.3 },

      // Knee-high, inside the pockets the player builds in.
      { kind: "snag", x: 250, y: 530, size: 32, rotation: 4.4 },
      { kind: "snag", x: 742, y: 236, size: 30, rotation: 2.0 },
      { kind: "snag", x: 700, y: 452, size: 28, rotation: 0.5 },
      { kind: "stump", x: 118, y: 300, size: 26, rotation: 1.0 },
      { kind: "stump", x: 706, y: 552, size: 24, rotation: 3.0 },
      { kind: "stump", x: 990, y: 620, size: 25, rotation: 0.2 },
      { kind: "log", x: 168, y: 495, size: 32, rotation: 0.4 },
      { kind: "log", x: 862, y: 618, size: 32, rotation: 2.2 },
      { kind: "log", x: 118, y: 462, size: 28, rotation: 1.4 },
      { kind: "brush", x: 268, y: 402, size: 24, rotation: 1.3 },
      { kind: "brush", x: 726, y: 268, size: 24, rotation: 0.8 },
      { kind: "brush", x: 96, y: 148, size: 26, rotation: 2.9 },
      { kind: "brush", x: 1090, y: 650, size: 26, rotation: 1.7 },
      // THE BANKS. Dead stems lean over a cut like this because the water took
      // the ground out from under them, so the props nearest the channel are
      // the only ones on the board placed for a REASON rather than a rhythm.
      { kind: "log", x: 340, y: 592, size: 30, rotation: 1.35 },
      { kind: "brush", x: 146, y: 352, size: 22, rotation: 2.6 },
      { kind: "snag", x: 496, y: 618, size: 27, rotation: 1.7 },
      { kind: "brush", x: 498, y: 128, size: 22, rotation: 0.5 },

      // THE CROSSING, on the long straight between the notch and the
      // switchbacks. Its `size` is the SPAN divided by 1.5 (see gl-geometry's
      // bridge case) and the abutments sit at 0.47 of the span, so 105 reaches
      // x 386..534 -- outside the 399..521 cut at both ends, landing on solid
      // bank. That is the one measurement on this prop that is not taste.
      { kind: "bridge", x: 420, y: 520, size: 105, rotation: 0 },

      // THE TWO ENDS OF THE ROAD.
      //
      // The gate at the spawn stands over the road with the casket behind it,
      // and both burn violet -- the one light on this board that belongs to
      // neither the camp nor the facility. `accent` is the per-prop override
      // (js/gl/gl-world.js); the violet is here precisely because it is not
      // the camp's ember and does not belong in this forest.
      //
      // The gate at the base is the same prop in the camp's own ember, turned
      // to stand across the last leg. Two arches, at the two ends, doing
      // opposite jobs: bodies come out of one and must never reach the other.
      { kind: "casket", x: -82, y: 190, size: 60, rotation: 0,
        accent: "168,96,236" },
      { kind: "gate", x: -22, y: 190, size: 58, rotation: 0,
        accent: "168,96,236" },
      { kind: "gate", x: 1300, y: 432, size: 58, rotation: 0.197 },

      // THE CABLE RUNS. Laid along the road, turning where it turns, so the
      // board's own lighting walks the player from the gate to the base.
      { kind: "conduit", x: 62, y: 228, size: 58, rotation: 0,
        accent: "88,214,255" },
      { kind: "conduit", x: 248, y: 556, size: 52, rotation: 0,
        accent: "88,214,255" },
      { kind: "conduit", x: 578, y: 566, size: 58, rotation: 0,
        accent: "88,214,255" },
      { kind: "conduit", x: 762, y: 250, size: 48, rotation: 1.5708,
        accent: "88,214,255" },
      { kind: "conduit", x: 952, y: 322, size: 54, rotation: 0,
        accent: "88,214,255" },

      // ENERGY NODES AT THE DECK CORNERS. Two per deck, diagonally opposite,
      // so the platform reads as a marked-out position from directly above and
      // still has a lit edge from a tilted camera.
      { kind: "pylon", x: 206, y: 388, size: 32, accent: "88,214,255" },
      { kind: "battery", x: 346, y: 214, size: 26, accent: "88,214,255" },
      { kind: "pylon", x: 494, y: 350, size: 30, accent: "88,214,255" },
      { kind: "battery", x: 498, y: 486, size: 24, accent: "88,214,255" },
      { kind: "pylon", x: 548, y: 308, size: 28, accent: "88,214,255" },
      { kind: "battery", x: 726, y: 206, size: 24, accent: "88,214,255" },
      { kind: "pylon", x: 860, y: 566, size: 32, accent: "88,214,255" },
      { kind: "battery", x: 1060, y: 430, size: 26, accent: "88,214,255" },

      // SENSOR ARRAYS, on the ground that overlooks the three places a wave
      // bunches up: the crossing, the basin and the wire gate.
      { kind: "antenna", x: 250, y: 96, size: 42, rotation: -0.25,
        accent: "88,214,255" },
      { kind: "antenna", x: 966, y: 128, size: 44, rotation: 0.3,
        accent: "88,214,255" },
      { kind: "antenna", x: 636, y: 620, size: 40, rotation: -0.4,
        accent: "88,214,255" },
      { kind: "server", x: 1006, y: 258, size: 36, rotation: 0.1,
        accent: "88,214,255" },
      { kind: "coil", x: 76, y: 470, size: 34, rotation: 0.2,
        accent: "88,214,255" },
      { kind: "battery", x: 690, y: 92, size: 30, accent: "88,214,255" },

      // THE RELAY THE CAMP TOOK OVER. Ember, not cyan: these are the ones
      // somebody is still running.
      { kind: "holo", x: 756, y: 462, size: 40, rotation: -0.1 },
      { kind: "console", x: 1152, y: 342, size: 36, rotation: 0.12 },
      { kind: "vent", x: 92, y: 596, size: 36, rotation: 0 },

      // THE CAMP, built along the inside of the last two legs of the road, so
      // every wall faces something that is coming. It starts at the wire gate
      // -- the tightest point on the board -- and everything behind it is the
      // final gauntlet.
      { kind: "barricade", x: 902, y: 338, size: 42, rotation: 0 },
      { kind: "barricade", x: 998, y: 338, size: 42, rotation: 0 },
      { kind: "barricade", x: 1148, y: 604, size: 42, rotation: 0 },
      { kind: "spikes", x: 940, y: 300, size: 36, rotation: 0 },
      { kind: "spikes", x: 1284, y: 508, size: 36, rotation: 0.197 },
      { kind: "sandbags", x: 884, y: 596, size: 38, rotation: 0 },
      { kind: "sandbags", x: 1226, y: 604, size: 38, rotation: 0 },
      { kind: "fence", x: 1076, y: 336, size: 44, rotation: 0 },
      { kind: "fence", x: 1208, y: 340, size: 44, rotation: 0 },
      { kind: "wreck", x: 796, y: 596, size: 44, rotation: 0.5 },
      { kind: "watchtower", x: 1082, y: 546, size: 52, rotation: 0.3 },
      { kind: "barrel", x: 1068, y: 472, size: 28, rotation: 0 },
      { kind: "barrel", x: 1256, y: 386, size: 26, rotation: 0 }
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
  // Optional, and absent on six of the seven boards. `drawEnvironment` and the
  // 3D mesh both test for it rather than assuming one.
  environmentMap.river = environment.river || null;
}

Maps.DEFAULT_ID = "ironwood-frontier";

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

// A theme hex, darkened. The board's palettes are authored as the surfaces they
// name -- floor, panel, metal -- and none of them names "the same earth, in
// shadow", which is what the inside of a cut is. Multiplying the one it IS is
// honest and keeps every board's river the colour of that board's ground.
function shadeHex(hex, factor) {
  var text = String(hex).replace("#", "");
  if (text.length === 3) {
    text = text[0] + text[0] + text[1] + text[1] + text[2] + text[2];
  }
  var n = parseInt(text, 16);
  function c(v) { return Math.max(0, Math.min(255, Math.round(v * factor))); }
  return "rgb(" + c((n >> 16) & 255) + "," + c((n >> 8) & 255) + "," +
    c(n & 255) + ")";
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

  // THE OTHER TWO PATCHES, and they are patches for the same hard reason
  // `dirt` is: a slab has a rim, `World3D.levelUnder` refuses a footprint that
  // straddles one, and a puddle built as a slab is an invisible no-build ring
  // in the middle of open ground. Ground COLOUR is the whole effect here, so
  // none of the three stamps any height.
  //
  //   plate  a cracked floor panel left where a facility stood. Painted in the
  //          board's `panel` and split by seams, which is what says milled.
  //   flux   ground the buried plant is still leaking into. The accent, weak,
  //          because it is a stain and not a light source.
  if (zone.kind === "plate" || zone.kind === "flux") {
    ctx.fillStyle = zone.kind === "plate"
      ? theme.panel : themeRgba(theme, "accent", 0.10);
    ctx.fillRect(0, 0, zone.w, zone.h);
    ctx.strokeStyle = zone.kind === "plate"
      ? themeRgba(theme, "panelLine", 0.5)
      : themeRgba(theme, "accent", 0.28);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, zone.w - 1, zone.h - 1);
    // A plate is CRACKED, so its seams run all the way across it; a flux patch
    // has no seams at all and is drawn as a second, brighter pool inside the
    // first so it reads as soaking outward rather than as a painted rectangle.
    if (zone.kind === "plate") {
      for (var seamX = 34; seamX < zone.w; seamX += 34) {
        ctx.beginPath();
        ctx.moveTo(seamX, 0);
        ctx.lineTo(seamX - 6, zone.h);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = themeRgba(theme, "accent", 0.14);
      ctx.fillRect(zone.w * 0.18, zone.h * 0.2, zone.w * 0.64, zone.h * 0.6);
    }
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

// THE RIVER, SEEN FROM ABOVE.
//
// The 3D board cuts a real channel and pours it off the edge of the world
// (GLGeometry.river). None of that is available here and none of it is faked:
// from straight down a river is two bank strips, a stripe of water and the
// places the surface breaks over the bed. What this DOES have to agree with is
// where the water is, because `drawMapThumbnail` renders the map card through
// this same function -- a river the card does not show is a river the player
// meets for the first time in the run.
//
// Drawn after the zones and before the props, which is the same order the mesh
// is built in: the channel cuts THROUGH the ground patches, and the bridge is
// a prop that has to land on top of it.
function drawRiver(ctx, river, theme, height) {
  var half = river.width / 2;
  var x0 = river.x - half - river.banks;
  var x1 = river.x + half + river.banks;
  var top = river.spill === "max" ? height : 0;
  var lip = river.spill === "max" ? -1 : 1;   // into the board, from the lip

  // THE CUT, AS A VALUE LADDER: bank, then wall, then water. The first pass
  // filled the whole band in `metalDark` and measured (28,24,18) against a
  // (27,27,20) floor -- one value apart, which from above is not a river bank,
  // it is a stripe of the same dirt. The 3D board carries the identical ladder
  // and for the identical reason: the eye reads depth as darkness.
  ctx.fillStyle = shadeHex(theme.floor, 0.55);
  ctx.fillRect(x0, -30, x1 - x0, height + 60);
  ctx.fillStyle = shadeHex(theme.metalDark, 0.5);
  ctx.fillRect(river.x - half, -30, half * 2, height + 60);
  ctx.fillStyle = river.water;
  ctx.fillRect(river.x - half * 0.88, -30, half * 1.76, height + 60);
  ctx.strokeStyle = themeRgba(theme, "panelLine", 0.30);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(river.x - half * 0.88, -30);
  ctx.lineTo(river.x - half * 0.88, height + 30);
  ctx.moveTo(river.x + half * 0.88, -30);
  ctx.lineTo(river.x + half * 0.88, height + 30);
  ctx.stroke();

  // Riffles. Deterministic, and the only reason a flat stripe reads as moving.
  ctx.strokeStyle = river.foam;
  ctx.lineWidth = 1.6;
  for (var y = 30; y < height - 30; y += 74) {
    var w = half * (0.30 + ((y * 37) % 41) / 41 * 0.44);
    var c = river.x + (((y * 53) % 29) / 29 - 0.5) * half * 0.5;
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.moveTo(c - w, y);
    ctx.lineTo(c + w, y + 2.5);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // AND THE EDGE OF THE BOARD. In 3D the water leans out and falls; from above
  // there is nothing to fall INTO, so what the top-down view can honestly show
  // is the water reaching the last of the ground and the void past it.
  //
  // PULLED INSIDE THE CANVAS. Drawn at the true board edge the whole thing sat
  // at y = 0 and above, where a map card has no pixels: the river simply ran
  // off the top and the one moment the 3D board is built around -- the water
  // leaving the world -- was the one thing the card did not show. Eight pixels
  // in is a lie of eight pixels and buys the entire read.
  var edge = top + lip * 8;
  ctx.fillStyle = theme.background;
  ctx.fillRect(x0 - 2, edge - lip * 38, x1 - x0 + 4, 38);
  ctx.strokeStyle = river.foam;
  ctx.lineWidth = 2.4;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(river.x - half * 0.9, edge);
  ctx.lineTo(river.x + half * 0.9, edge);
  ctx.stroke();
  ctx.globalAlpha = 1;
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

  // ONE PROP MAY OWN ITS OWN LIGHT. `accent` on a model overrides the board's
  // accent for that prop and nothing else about it -- see the 3D side in
  // js/gl/gl-world.js, where it costs a separate draw call because emission is
  // one tint per call. Here it costs a shadowed theme, which is cheaper and
  // has to exist anyway: a card that paints the spawn gate in the camp's ember
  // while the board paints it violet breaks the promise that the preview is
  // the map, on the one prop whose whole point is its colour.
  if (model.accent) {
    theme = Object.create(theme);
    theme.accent = model.accent;
  }

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
  } else if (model.kind === "conduit") {
    // A cable run, from above: three sections of dark sheath with the core
    // showing in the breaks between them. Drawn along the prop's own x axis,
    // like the 3D one, so a run authored parallel to the road is parallel to
    // the road on the card too.
    for (i = -1; i <= 1; i++) {
      ctx.fillStyle = theme.metalDark;
      ctx.fillRect(i * size * 0.62 - size * 0.25, -size * 0.1,
        size * 0.5, size * 0.2);
    }
    ctx.strokeStyle = themeRgba(theme, "accent", 0.85);
    ctx.lineWidth = size * 0.07;
    ctx.beginPath();
    ctx.moveTo(-size * 0.93, 0);
    ctx.lineTo(size * 0.93, 0);
    ctx.stroke();

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
  } else if (model.kind === "ridge") {
    // Horizon hills. In 2D they sit outside the 1280x720 canvas and are never
    // seen -- this exists so the kind is not a silent hole if one is ever
    // authored inside the view.
    ctx.beginPath();
    ctx.moveTo(-size * 0.5, size * 0.16);
    for (i = 0; i <= 6; i++) {
      var mrx = -size * 0.5 + size * i / 6;
      ctx.lineTo(mrx, -size * (0.12 + Math.sin(i * 1.7 + model.x * 0.05) * 0.10));
    }
    ctx.lineTo(size * 0.5, size * 0.16);
    ctx.closePath();
    ctx.fillStyle = theme.metalDark;
    ctx.fill();

  } else if (model.kind === "ironwood") {
    // A LIVING BROADLEAF, and deliberately nothing like the dead forest board's
    // bare stems. Three overlapping canopy lobes of different sizes, a trunk
    // with buttress roots, and every dimension jittered off the tree's own
    // position -- so no two of the eighty-odd on this board share a silhouette,
    // and each keeps the same one every frame.
    var jx = Math.sin(model.x * 0.077 + model.y * 0.041);
    var jy = Math.cos(model.x * 0.053 - model.y * 0.089);
    var canopy = size * (0.52 + jx * 0.10);

    // Buttress roots first, so the canopy sits over them.
    ctx.strokeStyle = theme.metalDark;
    ctx.lineWidth = size * 0.055;
    ctx.lineCap = "round";
    for (i = 0; i < 4; i++) {
      var rootA = i * Math.PI / 2 + 0.5 + jy;
      ctx.beginPath();
      ctx.moveTo(0, size * 0.04);
      ctx.lineTo(Math.cos(rootA) * size * 0.20,
                 size * 0.04 + Math.sin(rootA) * size * 0.14);
      ctx.stroke();
    }
    ctx.fillStyle = theme.metalDark;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.11, size * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();

    // Three canopy lobes, offset from each other and from centre.
    var lobeSpec = [[0.00, -0.06, 1.00], [-0.34, 0.12, 0.72], [0.31, 0.16, 0.66]];
    for (i = 0; i < 3; i++) {
      var lo = lobeSpec[i];
      ctx.beginPath();
      for (var k = 0; k <= 9; k++) {
        var ca = k * Math.PI * 2 / 9;
        var cw = 1 + Math.sin(model.x * 0.06 + i * 3.1 + k * 1.9) * 0.13;
        var cxp = lo[0] * canopy + Math.cos(ca) * canopy * lo[2] * cw;
        var cyp = lo[1] * canopy + Math.sin(ca) * canopy * lo[2] * 0.80 * cw;
        if (k === 0) ctx.moveTo(cxp, cyp); else ctx.lineTo(cxp, cyp);
      }
      ctx.closePath();
      ctx.fillStyle = themeRgba(theme, "accent2", i === 0 ? 0.30 : 0.22);
      ctx.fill();
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = themeRgba(theme, "panelLine", 0.55);
      ctx.stroke();
    }

  } else if (model.kind === "deadfall") {
    // Storm-thrown: a leaning snapped trunk with its root plate torn up, not a
    // tidy log lying flat.
    ctx.save();
    ctx.rotate(Math.sin(model.x * 0.05) * 0.4);
    ctx.strokeStyle = theme.metalDark;
    ctx.lineCap = "round";
    ctx.lineWidth = size * 0.20;
    ctx.beginPath();
    ctx.moveTo(-size * 0.46, size * 0.10);
    ctx.lineTo(size * 0.40, -size * 0.18);
    ctx.stroke();
    ctx.lineWidth = size * 0.05;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.55);
    ctx.stroke();
    // The root plate, standing on end where it tore out.
    ctx.beginPath();
    for (i = 0; i <= 7; i++) {
      var pa2 = i * Math.PI * 2 / 7;
      var pr = size * (0.22 + Math.sin(i * 2.7 + model.y * 0.06) * 0.07);
      var ppx = -size * 0.50 + Math.cos(pa2) * pr * 0.7;
      var ppy = size * 0.10 + Math.sin(pa2) * pr;
      if (i === 0) ctx.moveTo(ppx, ppy); else ctx.lineTo(ppx, ppy);
    }
    ctx.closePath();
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.7);
    ctx.stroke();
    // Snapped branches off the upper side.
    ctx.lineWidth = size * 0.045;
    ctx.strokeStyle = theme.metalDark;
    for (i = 0; i < 3; i++) {
      var bt = -0.2 + i * 0.3;
      var bxp = -size * 0.46 + (size * 0.86) * (0.3 + i * 0.25);
      var byp = size * 0.10 - (size * 0.28) * (0.3 + i * 0.25);
      ctx.beginPath();
      ctx.moveTo(bxp, byp);
      ctx.lineTo(bxp + Math.cos(bt - 1.2) * size * 0.22,
                 byp + Math.sin(bt - 1.2) * size * 0.22);
      ctx.stroke();
    }
    ctx.restore();

  } else if (model.kind === "fern") {
    // Low ground cover. Fronds, not sticks -- each one a curved spine with
    // leaflets, fanned from a single crown.
    var fronds = 6;
    for (i = 0; i < fronds; i++) {
      var fa2 = -Math.PI * 0.9 + i * (Math.PI * 1.8 / (fronds - 1));
      var flen = size * (0.42 + Math.sin(model.x * 0.09 + i) * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, size * 0.06);
      ctx.quadraticCurveTo(Math.cos(fa2) * flen * 0.6, size * 0.06 + Math.sin(fa2) * flen * 0.5,
                           Math.cos(fa2) * flen, size * 0.06 + Math.sin(fa2) * flen * 0.72);
      ctx.lineWidth = 2;
      ctx.strokeStyle = themeRgba(theme, "accent2", 0.55);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = themeRgba(theme, "accent2", 0.32);
      for (var lf = 1; lf <= 3; lf++) {
        var t2 = lf / 4;
        var lx = Math.cos(fa2) * flen * t2;
        var ly = size * 0.06 + Math.sin(fa2) * flen * 0.72 * t2;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(fa2 + 1.3) * size * 0.10,
                   ly + Math.sin(fa2 + 1.3) * size * 0.08);
        ctx.stroke();
      }
    }

  } else if (model.kind === "mossrock") {
    // A moss-capped stone the size of a crouching man. Ground detail, and the
    // only thing on this floor that is neither wood nor dirt.
    ctx.beginPath();
    for (i = 0; i <= 8; i++) {
      var ma = i * Math.PI * 2 / 8;
      var mr = size * (0.38 + Math.sin(model.y * 0.11 + i * 2.3) * 0.10);
      var mxp = Math.cos(ma) * mr, myp = Math.sin(ma) * mr * 0.72;
      if (i === 0) ctx.moveTo(mxp, myp); else ctx.lineTo(mxp, myp);
    }
    ctx.closePath();
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-size * 0.05, -size * 0.12, size * 0.24, size * 0.13, 0.3, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent2", 0.34);
    ctx.fill();

  } else if (model.kind === "boulder" || model.kind === "outcrop") {
    // NO PERFECT CIRCLES. A rock drawn as an arc reads as a debug shape, and on
    // a board where rocks are the one thing you must be able to see and build
    // around, that is the difference between a landmark and a placeholder.
    //
    // The outline is a jittered ring, and the jitter is SEEDED FROM THE POSITION
    // rather than random: every boulder on the board has a different profile and
    // the same boulder has the same profile every frame. A rock that shimmers is
    // worse than a circle.
    var lobes = model.kind === "boulder" ? 9 : 7;
    var seedX = model.x, seedY = model.y;
    ctx.beginPath();
    for (i = 0; i <= lobes; i++) {
      var ra = i * Math.PI * 2 / lobes;
      var wob = Math.sin(seedX * 0.13 + i * 2.1) * 0.16 +
                Math.cos(seedY * 0.11 + i * 1.7) * 0.12;
      var rr = size * (0.46 + wob);
      var rx = Math.cos(ra) * rr, ry = Math.sin(ra) * rr * 0.82;
      if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.stroke();
    // Fracture lines and a moss cap, so the mass reads as stone rather than as
    // a filled shape.
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = themeRgba(theme, "accent2", 0.30);
    for (i = 0; i < 3; i++) {
      var fa = 0.6 + i * 1.9 + seedX * 0.01;
      ctx.beginPath();
      ctx.moveTo(Math.cos(fa) * size * 0.34, Math.sin(fa) * size * 0.26);
      ctx.lineTo(Math.cos(fa + 2.2) * size * 0.30, Math.sin(fa + 2.2) * size * 0.24);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(-size * 0.10, -size * 0.16, size * 0.20, size * 0.12, 0.4, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent2", 0.22);
    ctx.fill();

  } else if (model.kind === "trunk") {
    // A FALLEN TRUNK, not a capsule. It has a taper, a broken end, bark texture
    // and two branch stubs, because the gameplay shape underneath it is a
    // capsule and the drawing is the only thing telling the player it is wood.
    var half = size * 0.52;
    ctx.beginPath();
    ctx.moveTo(-half, -size * 0.13);
    ctx.lineTo(half * 0.86, -size * 0.10);
    ctx.lineTo(half, size * 0.02);
    ctx.lineTo(half * 0.80, size * 0.11);
    ctx.lineTo(-half, size * 0.14);
    ctx.closePath();
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.85);
    ctx.stroke();
    // Bark: lengthwise splits, uneven.
    ctx.lineWidth = 1;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.45);
    for (i = 0; i < 4; i++) {
      var by = -size * 0.09 + i * size * 0.06;
      ctx.beginPath();
      ctx.moveTo(-half * 0.88, by);
      ctx.lineTo(half * (0.5 + (i % 2) * 0.3), by + size * 0.012);
      ctx.stroke();
    }
    // The broken end, and the rings in it.
    ctx.beginPath();
    ctx.ellipse(-half, 0, size * 0.055, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fillStyle = theme.panel;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.stroke();
    // Two snapped branches, so the silhouette is not a smooth sausage.
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.strokeStyle = theme.metalDark;
    ctx.beginPath();
    ctx.moveTo(-half * 0.2, -size * 0.11);
    ctx.lineTo(-half * 0.05, -size * 0.30);
    ctx.moveTo(half * 0.42, size * 0.12);
    ctx.lineTo(half * 0.56, size * 0.29);
    ctx.stroke();

  } else if (model.kind === "platform") {
    // A BUILDABLE STUMP. Deliberately the most readable object on the floor:
    // it is where the player wants to put things, so it gets the cleanest
    // silhouette on the board -- a wide cut face, a rim, and roots reaching out
    // of it into the dirt.
    ctx.beginPath();
    for (i = 0; i <= 10; i++) {
      var pa = i * Math.PI * 2 / 10;
      var pw = 1 + Math.sin(model.x * 0.09 + i * 2.3) * 0.06;
      var pxr = Math.cos(pa) * size * 0.50 * pw;
      var pyr = Math.sin(pa) * size * 0.44 * pw;
      if (i === 0) ctx.moveTo(pxr, pyr); else ctx.lineTo(pxr, pyr);
    }
    ctx.closePath();
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.95);
    ctx.stroke();
    // Roots, out past the rim and into the ground.
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = theme.metalDark;
    for (i = 0; i < 5; i++) {
      var rt = i * Math.PI * 2 / 5 + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(rt) * size * 0.40, Math.sin(rt) * size * 0.34);
      ctx.lineTo(Math.cos(rt) * size * 0.70, Math.sin(rt) * size * 0.58);
      ctx.stroke();
    }
    // The cut face and its growth rings -- the "you may stand here" signal.
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.05, size * 0.38, size * 0.32, 0, 0, Math.PI * 2);
    // Pale heartwood, not the theme's mossy trim -- see the same note on the
    // 3D case. The cut face is the "you may stand here" signal.
    ctx.fillStyle = "#b9a074";
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = themeRgba(theme, "accent", 0.30);
    for (i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, -size * 0.05, size * 0.38 * (i / 4), size * 0.32 * (i / 4),
        0, 0, Math.PI * 2);
      ctx.stroke();
    }

  } else if (model.kind === "house" || model.kind === "townhall" ||
             model.kind === "storehouse" || model.kind === "workshop") {
    // INHABITED, NOT A BOX. Each building gets a body, a pitched roof drawn as
    // a separate mass, a door and lit windows -- and the town hall gets a
    // second storey and a tower so it is the one you find first.
    var big = model.kind === "townhall";
    var wide = size * (big ? 0.62 : (model.kind === "storehouse" ? 0.58 : 0.46));
    var deep = size * (big ? 0.50 : 0.40);
    ctx.fillStyle = theme.metalDark;
    ctx.fillRect(-wide, -deep * 0.35, wide * 2, deep * 1.35);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.strokeRect(-wide, -deep * 0.35, wide * 2, deep * 1.35);
    // Roof, offset up-left so the building has a readable third dimension.
    ctx.beginPath();
    ctx.moveTo(-wide * 1.10, -deep * 0.35);
    ctx.lineTo(0, -deep * (big ? 1.15 : 0.95));
    ctx.lineTo(wide * 1.10, -deep * 0.35);
    ctx.closePath();
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.95);
    ctx.stroke();
    // Lit windows. Amber, and the only warm light on this half of the board.
    ctx.fillStyle = themeRgba(theme, "accent", 0.70);
    var panes = big ? 3 : 2;
    for (i = 0; i < panes; i++) {
      var wx = -wide * 0.55 + i * (wide * 1.1 / Math.max(1, panes - 1));
      ctx.fillRect(wx - size * 0.05, -deep * 0.10, size * 0.10, size * 0.11);
    }
    if (big) {
      // The hall's bell tower: the settlement's landmark silhouette.
      ctx.fillStyle = theme.metalDark;
      ctx.fillRect(-size * 0.10, -deep * 1.85, size * 0.20, deep * 0.80);
      ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
      ctx.strokeRect(-size * 0.10, -deep * 1.85, size * 0.20, deep * 0.80);
      ctx.beginPath();
      ctx.moveTo(-size * 0.16, -deep * 1.85);
      ctx.lineTo(0, -deep * 2.35);
      ctx.lineTo(size * 0.16, -deep * 1.85);
      ctx.closePath();
      ctx.fillStyle = theme.metal;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -deep * 1.50, size * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = themeRgba(theme, "accent", 0.85);
      ctx.fill();
    }

  } else if (model.kind === "palisade") {
    // Metal mesh on posts, with wire along the top. It refuses building and
    // deliberately does NOT block sight -- see the landmark's blocksSight flag.
    var run2 = size;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.55);
    for (i = 0; i <= 12; i++) {
      var mx = -run2 / 2 + run2 * i / 12;
      ctx.beginPath();
      ctx.moveTo(mx, -size * 0.09);
      ctx.lineTo(mx, size * 0.09);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-run2 / 2, -size * 0.09);
    ctx.lineTo(run2 / 2, -size * 0.09);
    ctx.moveTo(-run2 / 2, size * 0.09);
    ctx.lineTo(run2 / 2, size * 0.09);
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.metal;
    ctx.stroke();
    // Posts, and the barbed line above them.
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.metalDark;
    for (i = 0; i <= 4; i++) {
      var postX = -run2 / 2 + run2 * i / 4;
      ctx.beginPath();
      ctx.moveTo(postX, -size * 0.14);
      ctx.lineTo(postX, size * 0.12);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.8);
    ctx.beginPath();
    for (i = 0; i <= 20; i++) {
      var bx = -run2 / 2 + run2 * i / 20;
      var byy = -size * 0.17 + (i % 2) * size * 0.04;
      if (i === 0) ctx.moveTo(bx, byy); else ctx.lineTo(bx, byy);
    }
    ctx.stroke();

  } else if (model.kind === "palisade-gate") {
    // CLOSED, because leaked enemies are hammering on it. Two leaves, a heavy
    // brace and a bar across the middle. Renamed from "gate" on the merge with
    // the route-profile branch -- see the same case in gl-geometry.
    ctx.fillStyle = theme.metal;
    ctx.fillRect(-size * 0.13, -size * 0.62, size * 0.26, size * 1.24);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.95);
    ctx.strokeRect(-size * 0.13, -size * 0.62, size * 0.26, size * 1.24);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = theme.metalDark;
    ctx.beginPath();
    ctx.moveTo(-size * 0.13, 0);
    ctx.lineTo(size * 0.13, 0);
    ctx.moveTo(-size * 0.11, -size * 0.55);
    ctx.lineTo(size * 0.11, -size * 0.06);
    ctx.moveTo(-size * 0.11, size * 0.55);
    ctx.lineTo(size * 0.11, size * 0.06);
    ctx.stroke();

  } else if (model.kind === "lantern") {
    ctx.strokeStyle = theme.metalDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.6);
    ctx.lineTo(0, -size * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -size * 0.55, size * 0.30, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent", 0.85);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -size * 0.55, size * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent", 0.13);
    ctx.fill();

  } else if (model.kind === "depot") {
    // THE MOBILE WAREHOUSE. Drawn as a hull with a chamfered nose, a ribbed
    // roof, a freight door opening WEST and a lit interior behind it -- the
    // enemies walk out of that light, which is why the door is the brightest
    // thing on this half of the board.
    var hw = size * 0.62, hh = size * 0.46;
    ctx.beginPath();
    ctx.moveTo(-hw, -hh * 0.62);
    ctx.lineTo(-hw * 0.72, -hh);
    ctx.lineTo(hw * 0.86, -hh * 0.92);
    ctx.lineTo(hw, -hh * 0.42);
    ctx.lineTo(hw, hh * 0.60);
    ctx.lineTo(hw * 0.68, hh);
    ctx.lineTo(-hw * 0.70, hh * 0.94);
    ctx.lineTo(-hw, hh * 0.40);
    ctx.closePath();
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.95);
    ctx.stroke();
    // Ribs across the roof.
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.45);
    for (i = 1; i < 6; i++) {
      var rib = -hw * 0.7 + (hw * 1.5) * i / 6;
      ctx.beginPath();
      ctx.moveTo(rib, -hh * 0.88);
      ctx.lineTo(rib, hh * 0.88);
      ctx.stroke();
    }
    // The freight door: a dark bay with a hot interior behind it.
    ctx.fillStyle = "rgba(6,5,4,0.92)";
    ctx.fillRect(-hw * 1.02, -hh * 0.40, size * 0.13, hh * 0.80);
    ctx.fillStyle = themeRgba(theme, "accent", 0.55);
    ctx.fillRect(-hw * 0.99, -hh * 0.32, size * 0.06, hh * 0.64);
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeRgba(theme, "accent", 0.85);
    ctx.strokeRect(-hw * 1.02, -hh * 0.40, size * 0.13, hh * 0.80);

  } else if (model.kind === "depot-ramp") {
    // The plate the enemies walk down. Wider at the bottom, plated, and it
    // meets the road's first point.
    ctx.beginPath();
    ctx.moveTo(size * 0.5, -size * 0.30);
    ctx.lineTo(-size * 0.5, -size * 0.46);
    ctx.lineTo(-size * 0.5, size * 0.46);
    ctx.lineTo(size * 0.5, size * 0.30);
    ctx.closePath();
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.85);
    ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.45);
    for (i = 1; i < 5; i++) {
      var plate = -size * 0.5 + size * i / 5;
      ctx.beginPath();
      ctx.moveTo(plate, -size * (0.46 - 0.16 * (i / 5)));
      ctx.lineTo(plate, size * (0.46 - 0.16 * (i / 5)));
      ctx.stroke();
    }

  } else if (model.kind === "wheel") {
    // Running gear. It is what says the depot ARRIVED rather than was built.
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.46, size * 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#14110d";
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.20, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = theme.metal;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.6);
    for (i = 0; i < 6; i++) {
      var sp = i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(sp) * size * 0.18, Math.sin(sp) * size * 0.13);
      ctx.lineTo(Math.cos(sp) * size * 0.42, Math.sin(sp) * size * 0.31);
      ctx.stroke();
    }

  } else if (model.kind === "exhaust") {
    ctx.fillStyle = theme.metal;
    ctx.fillRect(-size * 0.16, -size * 0.55, size * 0.32, size * 1.1);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.85);
    ctx.strokeRect(-size * 0.16, -size * 0.55, size * 0.32, size * 1.1);
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.55, size * 0.20, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#0d0b08";
    ctx.fill();

  } else if (model.kind === "floodlight") {
    // COLD AND HOSTILE, against the settlement's amber. Same fixture, opposite
    // colour, which is the whole read of the board in one prop.
    ctx.strokeStyle = theme.metalDark;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, size * 0.7);
    ctx.lineTo(0, -size * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -size * 0.5, size * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,92,64,0.85)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -size * 0.5, size * 1.05, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,92,64,0.12)";
    ctx.fill();

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
    // THE LAMP IS ON A CORNER POST, not in the middle of the deck. It stood
    // dead centre until 2026-08-26 and read as a stool bolted to the platform
    // -- on a tower whose whole job is to have somebody standing on it. Same
    // light, same only-lit-thing-in-the-forest; it is just not in the way any
    // more. The 3D build makes the identical move.
    ctx.beginPath();
    ctx.arc(-size * 0.3, -size * 0.3, size * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = themeRgba(theme, "accent", 0.95);
    ctx.fill();
    // The ladder, on the opposite corner.
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.75);
    ctx.lineWidth = 1.4;
    for (i = 0; i < 4; i++) {
      var rung = size * (0.16 + i * 0.09);
      ctx.beginPath();
      ctx.moveTo(rung, size * 0.2);
      ctx.lineTo(rung * 0.86, size * 0.42);
      ctx.stroke();
    }
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
  } else if (model.kind === "bridge") {
    // From above a bridge is planks and two rails, and the rails are what say
    // "bridge" rather than "wide bit of road" -- so they are the strongest
    // line here even though in 3D they are the thinnest thing on it.
    var span = size * 1.5;
    var deck = size * 0.17;
    ctx.fillStyle = theme.metalDark;
    ctx.fillRect(-span / 2, -deck, span, deck * 2);
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.55);
    ctx.lineWidth = 1.4;
    for (i = 0; i < 13; i++) {
      var plank = -span / 2 + span * i / 12;
      ctx.beginPath();
      ctx.moveTo(plank, -deck);
      ctx.lineTo(plank, deck);
      ctx.stroke();
    }
    ctx.strokeStyle = theme.metal;
    ctx.lineWidth = 2.6;
    for (i = -1; i <= 1; i += 2) {
      ctx.beginPath();
      ctx.moveTo(-span * 0.47, deck * 0.94 * i);
      ctx.lineTo(span * 0.47, deck * 0.94 * i);
      ctx.stroke();
    }
    // The abutments, where the timber comes back down onto the bank.
    ctx.fillStyle = theme.metalDark;
    for (i = -1; i <= 1; i += 2) {
      ctx.fillRect(span * 0.47 * i - size * 0.07, -deck * 1.15,
        size * 0.14, deck * 2.3);
    }
  } else if (model.kind === "casket") {
    // The grave, and the light in it. `model.accent` is the one per-prop
    // colour override in the game -- see the prop in ENVIRONMENTS.test -- and
    // this board's own accent is deliberately NOT what lights this.
    var glow = model.accent || theme.accent;
    var boxL = size * 1.15, boxW = size * 0.62;
    var spill = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.55);
    if (spill) {
      spill.addColorStop(0, "rgba(" + glow + ",0.34)");
      spill.addColorStop(1, "rgba(" + glow + ",0)");
      ctx.fillStyle = spill;
    } else {
      ctx.fillStyle = "rgba(" + glow + ",0.14)";
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = theme.panel;
    ctx.fillRect(-boxL / 2, -boxW / 2, boxL, boxW);
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.strokeRect(-boxL / 2, -boxW / 2, boxL, boxW);
    // The mouth, and the violet standing in it.
    ctx.fillStyle = theme.metalDark;
    ctx.fillRect(-boxL / 2 + size * 0.2, -boxW / 2 + size * 0.2,
      boxL - size * 0.4, boxW - size * 0.4);
    ctx.fillStyle = "rgba(" + glow + ",0.92)";
    ctx.fillRect(-boxL / 2 + size * 0.26, -boxW / 2 + size * 0.26,
      boxL - size * 0.52, boxW - size * 0.52);
    // The lid, dragged clear.
    ctx.save();
    ctx.translate(boxL * 0.42, -boxW * 0.92);
    ctx.rotate(0.22);
    ctx.fillStyle = theme.panel;
    ctx.fillRect(-boxL * 0.36, -boxW * 0.4, boxL * 0.72, boxW * 0.8);
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.8);
    ctx.strokeRect(-boxL * 0.36, -boxW * 0.4, boxL * 0.72, boxW * 0.8);
    ctx.restore();
    // Four markers, lit at the tip.
    for (i = 0; i < 4; i++) {
      var mx = ((i & 1) ? 1 : -1) * boxL * 0.62;
      var my = ((i & 2) ? 1 : -1) * boxW * 1.05;
      ctx.beginPath();
      ctx.arc(mx, my, size * 0.075, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + glow + ",0.85)";
      ctx.fill();
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

// GAMEPLAY GEOMETRY ON THE FLAT BOARD, drawn from the shapes themselves.
//
// The 3D pass is GLGeometry.solid; this is its opposite number, and the two
// have exactly one thing they must agree on -- the silhouette at ground level
// IS the collision shape. Everything above that is each renderer's business.
//
// Jitter is seeded from position and only ever pulls INWARD, for the same
// reason it does in the 3D pass: a rock is allowed to be smaller than its
// hitbox nowhere, and larger than it nowhere either.
Maps.drawSolids = function (ctx, map, theme) {
  if (!map) return;
  var i, a;
  function jitterRing(cx, cy, radius, lobes, seed) {
    ctx.beginPath();
    for (i = 0; i <= lobes; i++) {
      a = i * Math.PI * 2 / lobes;
      var k = 0.84 + Math.abs(Math.sin(cx * 0.07 + cy * 0.05 + i * seed)) * 0.16;
      var px = cx + Math.cos(a) * radius * k;
      var py = cy + Math.sin(a) * radius * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  (map.blockers || []).forEach(function (b) {
    ctx.fillStyle = theme.metal;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.9);
    ctx.lineWidth = 2;
    if (b.shape === "circle") {
      jitterRing(b.x, b.y, b.radius, 11, 2.3);
      ctx.fill(); ctx.stroke();
      jitterRing(b.x, b.y, b.radius * 0.52, 9, 3.1);
      ctx.fillStyle = theme.panel; ctx.fill();
      return;
    }
    if (b.shape === "polygon") {
      ctx.beginPath();
      b.points.forEach(function (pt, k) {
        if (k === 0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
      });
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // The upper tier, stepped in toward the centroid.
      var cx = 0, cy = 0;
      b.points.forEach(function (pt) { cx += pt[0]; cy += pt[1]; });
      cx /= b.points.length; cy /= b.points.length;
      ctx.beginPath();
      b.points.forEach(function (pt, k) {
        var px = cx + (pt[0] - cx) * 0.55, py = cy + (pt[1] - cy) * 0.55;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fillStyle = theme.panel; ctx.fill();
      return;
    }
    if (b.shape === "capsule") {
      // The stadium, at exactly the capsule's radius: a thick round-capped
      // stroke is the same figure and cannot drift from it.
      ctx.lineCap = "round";
      ctx.lineWidth = b.radius * 2;
      ctx.strokeStyle = theme.metal;
      ctx.beginPath();
      ctx.moveTo(b.a.x, b.a.y);
      ctx.lineTo(b.b.x, b.b.y);
      ctx.stroke();
      ctx.lineWidth = b.radius * 0.7;
      ctx.strokeStyle = themeRgba(theme, "panelLine", 0.75);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
  });

  (map.platforms || []).forEach(function (pf) {
    // A CUT STUMP. The most readable object on the floor, because it is where
    // the player wants to put things -- and its rim is exactly the circle that
    // decides whether a tower fits, so it is drawn round rather than squashed.
    jitterRing(pf.x, pf.y, pf.radius, 13, 1.7);
    ctx.fillStyle = theme.metalDark;
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = themeRgba(theme, "panelLine", 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pf.x, pf.y, pf.radius * 0.86, 0, Math.PI * 2);
    ctx.fillStyle = "#b9a074";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pf.x, pf.y, pf.radius * 0.52, 0, Math.PI * 2);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "#8a734d";
    ctx.stroke();
  });
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

  // The channel cuts through the ground patches above and is crossed by a prop
  // below, so it goes between them -- the same order the 3D mesh is built in.
  if (map.river) drawRiver(ctx, map.river, theme, VIEW_HEIGHT / scale);

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

  // CULLED, because the 3D board and the flat one see very different amounts
  // of the world. Ironwood's forest runs three thousand units past the clearing
  // so that the 3D camera -- which can fly about nineteen hundred out -- never
  // reaches the edge of it. The 2D fallback has no such camera: it looks at the
  // 1280x720 board and nothing else, so nine hundred of those thousand-odd
  // props are painted every frame exactly where no one can see them.
  //
  // The margin is deliberately loose. It is not a viewport test -- this
  // function is not given the camera -- it is a "could this conceivably be on
  // screen" test, and 800 units past the board is well beyond anything the flat
  // camera shows at any zoom it allows.
  var cullW = VIEW_WIDTH / scale, cullH = VIEW_HEIGHT / scale;
  for (var modelIndex = 0; modelIndex < map.models.length; modelIndex++) {
    var mdl = map.models[modelIndex];
    var pad = 800 + (mdl.size || 0);
    if (mdl.x < -pad || mdl.y < -pad ||
        mdl.x > cullW + pad || mdl.y > cullH + pad) continue;
    drawModel(ctx, mdl, theme);
  }

  // The rocks and the stumps, from the shapes that ARE the rocks and stumps.
  Maps.drawSolids(ctx, map, theme);

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
  var nominalHalf = ul(ROAD_WIDTH_UL) / 2;
  for (var i = 0; i < gamePaths.length; i++) {
    var hit = gamePaths[i].closestToPoint(x, y);
    // `clearancePx` is the rule on a road at its NOMINAL width, which is the
    // only width six of the seven boards have. Where a route declares a width
    // profile the road's own half-width takes the place of the nominal one --
    // the same substitution `buildClearanceOn` makes in js/game.js, spelled
    // here in terms of the number this function is handed so that the caller
    // does not have to know which tower it is measuring with.
    var required = clearancePx - nominalHalf +
      roadHalfWidthAt(gamePaths[i], hit.progress);
    if (hit.distance < required) return false;
  }
  if (x < 0 || y < 0 || x > VIEW_WIDTH || y > VIEW_HEIGHT) return false;
  return slotAt(x, y) < 0;            // the build bar eats clicks beneath it
};

// How long a body walking at base speed takes to cross a route, in seconds.
//
// A route may hurry bodies down one stretch and hold them back on another (the
// `pace` profile, js/path.js), and a road like that does not have "a" speed --
// the crossing time is the integral of the reciprocal of the pace along it.
// Two hundred steps is a hundredth of the shortest leg on any authored board,
// which is finer than the ramps a profile can author.
//
// A route with no pace profile takes the division it always took, exactly:
// summing two hundred equal terms is not bit-identical to one divide, and a
// board's reported crossing time is not the place to introduce a wobble in the
// last decimal.
Maps.walkSeconds = function (gamePath) {
  var lengthUl = gamePath.length / UNIT_LENGTH;
  if (!gamePath.paceProfile || !gamePath.paceProfile.length) {
    return lengthUl / Enemy.BASE_SPEED_ULPS;
  }

  var steps = 200;
  var stepPx = gamePath.length / steps;
  var seconds = 0;
  for (var i = 0; i < steps; i++) {
    seconds += (stepPx / UNIT_LENGTH) /
      (Enemy.BASE_SPEED_ULPS * gamePath.paceScaleAt(stepPx * (i + 0.5)));
  }
  return seconds;
};

// Full geometric report for a map. Cached on the map object: the sampling is
// O(spots x samples) and the map select screen redraws every frame.
//
// Everything here is derived from the points plus the game's own constants.
// Nothing about a map's difficulty is typed in.
Maps.analyse = function (map) {
  if (map.analysis) return map.analysis;

  var definitions = Maps.routesOf(map);
  // THE SAME LINE THE GAME LOADS. A map with a curved road is measured along
  // the curve, because that is what the enemies walk and what the towers are
  // near -- analysing the authored polyline instead reported a route 42 u.l.
  // shorter than the one being played, and a test caught the two disagreeing.
  var gamePaths = definitions.map(function (route) {
    // THE SMOOTHED LINE, like every other GamePath on the board. This call
    // and the one in loadMap came from opposite branches and git merged them
    // without a word: this one kept the authored polyline, so the sampler
    // measured a route the enemies do not walk.
    return new GamePath(Maps.toWorld(Maps.walkablePoints(map, route.points)),
      Maps.profileOf(route));
  });
  var Reference = Maps.REFERENCE_TOWER();
  var rangePx = ul(Reference.BASE_RANGE_UL);
  var clearancePx = buildClearancePx(Reference);
  var roadStepPx = ul(Maps.ROAD_STEP_UL);
  var spotEvery = Math.max(1, Math.round(Maps.SPOT_STEP_UL / Maps.ROAD_STEP_UL));

  // THE MAP'S OWN GEOMETRY, if it has any.
  //
  // Until 2026-08-26 this measurement assumed every board was a polyline on an
  // empty floor, and for six of the seven it still is: `geo.any` is false for
  // them, every test below short-circuits, and their scores and tiers are
  // byte-identical to what they were. A test pins that, because a silent drift
  // in the old numbers would rewrite the difficulty labels on maps nobody
  // touched.
  //
  // Where a board DOES have geometry, the measurement has to see it or it is
  // measuring a map that does not exist -- counting spots inside a boulder and
  // crediting road the tower cannot see.
  var geo = Maps.geometryOf(map);
  var footprintPx = ul(Reference.FOOTPRINT_RADIUS_UL);
  var sight = geo.any && geo.sightBlockers.length ? geo.sightBlockers : null;

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
      //
      // The clearance HERE, not the nominal one: on a board with a plaza in it
      // the nominal offset lands the candidate spot on tarmac, every one of
      // them is refused, and the widest stretch of the route -- the one a
      // player most wants to know about -- contributes nothing at all to the
      // measurement. Identical to `clearancePx * 1.02` on a route with no
      // width profile.
      var offset = (clearancePx - ul(ROAD_WIDTH_UL) / 2 +
        roadHalfWidthAt(gamePaths[routeIndex], along[i].progress)) * 1.02;
      for (var side = -1; side <= 1; side += 2) {
        var x = along[i].x + (-ty / tlen) * side * offset;
        var y = along[i].y + (tx / tlen) * side * offset;
        if (!Maps.buildableSpot(gamePaths, x, y, clearancePx)) continue;
        // A spot inside a rock is not a spot. Inflated by the reference
        // tower's footprint, exactly as whyCannotBuild inflates it, so the
        // measurement and the game agree about what can be built.
        if (geo.any &&
            MapGeometry.containsAny(geo.noBuild, x, y, footprintPx)) continue;
        spots.push({
          x: x,
          y: y,
          routeIndex: routeIndex,
          progress: along[i].progress,
          coverageUl: Maps.coverageAt(samples, x, y, rangePx, sight)
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
  var soonestCrossing = Infinity;
  var bends = { count: 0, degrees: 0 };
  for (routeIndex = 0; routeIndex < gamePaths.length; routeIndex++) {
    var routeLengthUl = gamePaths[routeIndex].length / UNIT_LENGTH;
    totalLengthUl += routeLengthUl;
    shortestLengthUl = Math.min(shortestLengthUl, routeLengthUl);
    soonestCrossing = Math.min(soonestCrossing,
      Maps.walkSeconds(gamePaths[routeIndex]));
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

  // GRACE IS A CLOCK, AND LENGTH WAS ONLY EVER A PROXY FOR IT. The term exists
  // because a longer route gives the economy more time before the first leak
  // lands -- so on a route whose road hurries bodies along one stretch and
  // holds them on another, the honest measure is how long the crossing takes,
  // converted back into the distance a body would cover in that time at base
  // speed. A gauntlet that runs bodies in at half again their speed shortens
  // the grace exactly as cutting the route would.
  //
  // Taken from the length itself on every route that declares no pace profile,
  // which is six of the seven: `crossingSeconds * BASE_SPEED` is the same
  // number through two more floating point operations, and a board's published
  // score is not the place to move a last decimal for nothing.
  var pacedRoute = gamePaths.some(function (p) {
    return p.paceProfile && p.paceProfile.length;
  });
  var graceLengthUl = pacedRoute
    ? soonestCrossing * Enemy.BASE_SPEED_ULPS : shortestLengthUl;
  var graceRatio = Maps.referenceLengthUl() / graceLengthUl;
  var score = Math.pow(
    coverageRatio * coverageRatio * graceRatio * gamePaths.length, 1 / 3);

  map.analysis = {
    lengthUl: lengthUl,
    totalLengthUl: totalLengthUl,
    shortestLengthUl: shortestLengthUl,
    // WALKED, NOT DIVIDED. On a route that declares a pace profile the time to
    // cross is not the length over one speed, because there is no one speed --
    // see Maps.walkSeconds. Identical to the division on the six boards that
    // declare none, and it is still the SOONEST arrival that matters: the base
    // starts taking hits when the first body lands, not the average one.
    crossingSeconds: soonestCrossing,
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

// u.l. of road within rangePx of (x, y) THAT THE TOWER CAN ACTUALLY SEE.
//
// `sight` is the map's sight-blocking shapes, or null. Null is the old
// behaviour exactly -- a range test and nothing else -- which is what keeps the
// six mapless boards' numbers where they were.
//
// The distance test runs FIRST and the sight test only on what survives it.
// This function is called once per candidate spot against every road sample on
// the board, so the cheap test has to be the one that runs on everything.
Maps.coverageAt = function (samples, x, y, rangePx, sight) {
  var rangeSq = rangePx * rangePx;
  var hits = 0;
  for (var i = 0; i < samples.length; i++) {
    var dx = samples[i].x - x;
    var dy = samples[i].y - y;
    if (dx * dx + dy * dy > rangeSq) continue;
    if (sight && !MapGeometry.clearLine(sight, x, y, samples[i].x, samples[i].y)) continue;
    hits++;
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
