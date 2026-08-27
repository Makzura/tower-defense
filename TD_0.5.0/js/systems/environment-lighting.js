// THE CYCLE, TURNED INTO LIGHT. Colours live here; time lives next door.
//
// EnvironmentCycle answers "how far through the day is it". This answers "so
// what colour is everything", and it is the only file that knows both. The
// renderers read the composed result and never do phase arithmetic of their
// own -- the moment two of them derive a sky colour independently, they drift.
//
// EVERYTHING IS AUTHORED IN LINEAR LIGHT, because the world shader lights in
// linear and converts once at the end (see js/gl/gl-renderer.js). A palette
// authored in sRGB and handed straight to a light term is the washed-out
// mistake that file's own comment warns about, so `lin()` below is not
// optional decoration.
//
// NOTHING HERE INTERPOLATES ON A BAND EDGE. "dawn" and "dusk" are names for a
// look, not switches: every value is a continuous function of the sun's height
// and of the daylight ramp, so there is no phase at which a colour can step.
//
// Node-safe. No DOM, no canvas, no globals read.
var EnvironmentLighting = (function () {
  "use strict";

  function lin(hex) {
    var s = String(hex).replace("#", "");
    return [Math.pow(parseInt(s.substr(0, 2), 16) / 255, 2.2),
            Math.pow(parseInt(s.substr(2, 2), 16) / 255, 2.2),
            Math.pow(parseInt(s.substr(4, 2), 16) / 255, 2.2)];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t];
  }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function smoothstep(e0, e1, x) {
    if (e1 === e0) return x < e0 ? 0 : 1;
    var t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  }
  function norm(v) {
    var l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  // --- the palette ---------------------------------------------------------
  //
  // Three authored states and two continuous weights between them. Twilight is
  // not a third band with edges; it is a bump centred exactly on the horizon
  // crossing, so it rises and falls through both sunrise and sunset without
  // either one being a special case.
  var SKY = {
    dayZenith:    lin("#3f7fc4"),
    dayHorizon:   lin("#bcd6ea"),
    duskZenith:   lin("#3b3f77"),
    duskHorizon:  lin("#e07b3c"),
    duskBand:     lin("#b5628f"),
    dawnHorizon:  lin("#f0a663"),
    nightZenith:  lin("#0a1330"),
    nightHorizon: lin("#16223f")
  };

  var SUN_DAY = lin("#fff6e4");
  var SUN_LOW = lin("#ff9a4a");
  var MOON = lin("#c8d6f2");

  // THE SUN'S PATH IS A TILTED CIRCLE, and the tilt is what stops noon being
  // straight overhead. The board's camera sits on the -Y side, so the arc leans
  // that way: at noon the light comes down and slightly toward the viewer,
  // which is what puts a lit face on the side of a model anyone can see.
  var PATH_TILT = 32 * Math.PI / 180;

  // How far above the horizon the key light takes to come up. Both bodies use
  // it, so at the crossing BOTH are at zero -- which is the whole reason the
  // key may swap from sun to moon without a visible jump in light direction.
  // Ambient and fill carry the twilight across that moment.
  var KEY_LOW = -0.02;
  var KEY_HIGH = 0.30;
  var MOON_KEY = 0.26;                  // the moon is a weak sun, not a switch

  // Ambient and fill, day and night. Night is deliberately not dark: the board
  // has to stay playable, and a night that punishes visibility is a night
  // players turn off. It is COOLER and lower, not black.
  var AMBIENT_DAY = [0.125, 0.142, 0.180];
  var AMBIENT_NIGHT = [0.052, 0.068, 0.108];
  var AMBIENT_TWILIGHT = [0.108, 0.086, 0.096];
  var FILL_DAY = [0.075, 0.110, 0.155];
  var FILL_NIGHT = [0.034, 0.052, 0.086];
  var FILL_TWILIGHT = [0.086, 0.062, 0.062];

  var KEY_DAY_STRENGTH = 1.02;          // the renderer's authored daylight
  var KEY_TWILIGHT_TINT = lin("#ff8f45");

  function sunDirection(phase) {
    // East is +X. The path plane is spanned by east and a "noon" axis tilted
    // toward the camera, so the sun rises due east, passes high and slightly
    // toward the viewer, and sets due west.
    var a = phase * Math.PI * 2;
    var ca = Math.cos(a), sa = Math.sin(a);
    return norm([ca, -Math.sin(PATH_TILT) * sa, Math.cos(PATH_TILT) * sa]);
  }

  // --- the base environment, before any modifier ---------------------------
  function base(cycle) {
    var elev = cycle.sunElevation;
    var day = cycle.daylight;
    var night = cycle.nightAmount;

    // The twilight bump: a Gaussian on the sun's height, so it peaks exactly at
    // the horizon and is gone by the time the sun is properly up or down.
    var twilight = Math.exp(-(elev / 0.26) * (elev / 0.26));
    // Which side of the horizon we are approaching from. Dawn light is golder,
    // dusk is redder and carries the violet band; the two share everything else.
    var dawnness = smoothstep(-0.35, 0.35, Math.cos(cycle.phase * Math.PI * 2));

    var sunDir = sunDirection(cycle.phase);
    var moonDir = [-sunDir[0], -sunDir[1], -sunDir[2]];

    var sunKey = smoothstep(KEY_LOW, KEY_HIGH, elev);
    var moonKey = smoothstep(KEY_LOW, KEY_HIGH, -elev) * MOON_KEY;

    // The key follows whichever body is contributing more, and the swap can
    // only ever happen where both contribute nothing.
    var sunIsKey = sunKey >= moonKey;
    var keyDir = sunIsKey ? sunDir : moonDir;
    var keyStrength = (sunIsKey ? sunKey : moonKey) * KEY_DAY_STRENGTH;
    var sunColour = mix(SUN_LOW, SUN_DAY, smoothstep(0.02, 0.34, elev));
    var keyColour = sunIsKey
      ? mix(KEY_TWILIGHT_TINT, sunColour, smoothstep(0.05, 0.40, elev))
      : MOON;

    var twilightHorizon = mix(SKY.duskHorizon, SKY.dawnHorizon, dawnness);
    var zenith = mix(SKY.nightZenith, SKY.dayZenith, day);
    var horizon = mix(SKY.nightHorizon, SKY.dayHorizon, day);
    zenith = mix(zenith, SKY.duskZenith, twilight * 0.72);
    horizon = mix(horizon, twilightHorizon, twilight * 0.86);

    var ambient = mix(AMBIENT_NIGHT, AMBIENT_DAY, day);
    ambient = mix(ambient, AMBIENT_TWILIGHT, twilight * 0.55);
    var fill = mix(FILL_NIGHT, FILL_DAY, day);
    fill = mix(fill, FILL_TWILIGHT, twilight * 0.55);

    // Stars come up after the light has gone and are gone before it returns.
    // Driven off the sun's height rather than off the phase, so they can never
    // be caught shining through daylight.
    var stars = smoothstep(-0.02, -0.34, elev);

    return {
      cycle: cycle,
      tags: [],
      sun: { dir: sunDir, colour: sunColour, above: elev > 0,
             disc: smoothstep(-0.10, 0.02, elev) },
      moon: { dir: moonDir, colour: MOON, above: elev < 0,
              disc: smoothstep(0.10, -0.02, elev) },
      sky: {
        zenith: zenith,
        horizon: horizon,
        band: mix(SKY.nightHorizon, SKY.duskBand, twilight),
        bandAmount: twilight * 0.55,
        starIntensity: stars,
        sunGlow: 0.30 + 0.55 * day
      },
      light: {
        keyDir: keyDir,
        keyColour: keyColour,
        keyStrength: keyStrength,
        ambient: ambient,
        fillColour: fill,
        // The fill comes from behind and opposite the key, which is what a
        // bounce is. It follows the key so the two never converge into one
        // direction and flatten the models.
        fillDir: norm([-keyDir[0], -keyDir[1], 0.35])
      },
      // Everything a map's own emissive materials are multiplied by. One at
      // noon, several times that at midnight: the lanterns do not move, the
      // light they throw does.
      sceneryEmissive: 1 + night * 2.6,
      // How much of the map's own fog to blend toward the sky. A board with no
      // fog ignores this entirely.
      //
      // SMALL, and it was not on the first pass. At 0.85 the mist simply BECAME
      // the sky and every tree on the board took the horizon's colour: a
      // sunrise turned the whole forest orange out to the near canopy, which is
      // not weather, it is a filter. Mist is lit BY the sky; it does not turn
      // into it. A third of the way at noon and a fifth at midnight is enough
      // to keep the far edge sitting in the right air.
      fogSkyMix: 0.18 + 0.16 * day,
      fogDensityScale: 1 + night * 0.35
    };
  }

  // --- modifier composition ------------------------------------------------
  //
  // ORDERED BY PRIORITY, THEN BY ID, and both are required: priority is the
  // authored intent and the id is what makes two modifiers at the same priority
  // compose the same way on every machine and in every test. Sorting by
  // insertion order would be deterministic too, and wrong the moment a caller
  // adds them in a different order.
  //
  // A modifier states TARGETS and a weight, and each field is blended from
  // whatever the composition holds so far toward that target. That is the whole
  // contract: it cannot reach past the fields it names, and it cannot touch the
  // solar state at all. An eclipse may make noon black; it may not make noon
  // night. `solarPeriod` is astronomy and stays astronomy.
  function sortModifiers(list) {
    return list.slice().sort(function (a, b) {
      var pa = a.priority || 0, pb = b.priority || 0;
      if (pa !== pb) return pa - pb;
      return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
    });
  }

  function blendInto(target, key, value, w) {
    if (value === undefined) return;
    if (typeof value === "number") {
      target[key] = target[key] + (value - target[key]) * w;
    } else if (value && value.length === 3) {
      target[key] = mix(target[key], value, w);
    }
  }

  function compose(cycle, modifiers) {
    var env = base(cycle);
    var list = sortModifiers(modifiers || []);
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var w = clamp01(m.weight === undefined ? 1 : m.weight);
      if (w <= 0) continue;
      if (m.tags) {
        for (var t = 0; t < m.tags.length; t++) {
          if (env.tags.indexOf(m.tags[t]) < 0) env.tags.push(m.tags[t]);
        }
      }
      if (m.sky) {
        blendInto(env.sky, "zenith", m.sky.zenith, w);
        blendInto(env.sky, "horizon", m.sky.horizon, w);
        blendInto(env.sky, "band", m.sky.band, w);
        blendInto(env.sky, "bandAmount", m.sky.bandAmount, w);
        blendInto(env.sky, "starIntensity", m.sky.starIntensity, w);
        blendInto(env.sky, "sunGlow", m.sky.sunGlow, w);
      }
      if (m.light) {
        blendInto(env.light, "keyColour", m.light.keyColour, w);
        blendInto(env.light, "keyStrength", m.light.keyStrength, w);
        blendInto(env.light, "ambient", m.light.ambient, w);
        blendInto(env.light, "fillColour", m.light.fillColour, w);
      }
      if (m.fog) {
        blendInto(env, "fogSkyMix", m.fog.skyMix, w);
        blendInto(env, "fogDensityScale", m.fog.densityScale, w);
        if (m.fog.colour) env.fogColour = mix(env.fogColour || env.sky.horizon,
          m.fog.colour, w);
      }
      if (m.emissive !== undefined) {
        env.sceneryEmissive += (m.emissive - env.sceneryEmissive) * w;
      }
    }
    env.tags.sort();
    return env;
  }

  // The live modifier list. EMPTY, and deliberately: the seam exists so an
  // eclipse or a storm can be dropped in later without any of this moving, and
  // an unused eclipse implementation sitting here would be exactly the dead
  // content the brief forbids.
  var modifiers = [];

  return {
    compose: compose,
    base: base,
    sunDirection: sunDirection,

    add: function (modifier) {
      if (!modifier || !modifier.id) return function () {};
      modifiers.push(modifier);
      return function () {
        var i = modifiers.indexOf(modifier);
        if (i >= 0) modifiers.splice(i, 1);
      };
    },
    clear: function () { modifiers.length = 0; },
    list: function () { return sortModifiers(modifiers); },

    // What the renderers are handed: the composed environment for a cycle
    // state, through whatever modifiers are live.
    of: function (cycle) { return compose(cycle, modifiers); },

    // The one exposed palette constant anything outside needs: the strength the
    // renderer's authored daylight sits at, so a preview outside a run can ask
    // for it by name rather than by number.
    KEY_DAY_STRENGTH: KEY_DAY_STRENGTH,
    lin: lin,
    mix: mix,
    scale: scale,
    smoothstep: smoothstep
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = EnvironmentLighting;
}
