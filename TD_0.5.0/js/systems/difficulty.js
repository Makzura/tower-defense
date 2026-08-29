// ---------------------------------------------------------------------------
// Difficulty -- how hard a campaign is, as ONE number, measured rather than
// typed.
//
// 2026-08-29, at the owner's instruction: "scale according to difficulty. find
// online or create a difficulty function that takes into account map, bodies,
// hp, wave count, money etc". This is that function. Its first consumer is the
// meta reward (js/meta.js): a run pays what it was worth, and what it was worth
// is what this says.
//
// WHY A SECOND SCHEDULE MADE THIS NECESSARY. Every reward table in the game was
// authored against Easy -- a ladder gating on waves 10/15/20/25/30 and a clear
// worth 80 coins -- and those numbers are meaningless against a campaign of a
// different length and weight. Normal is 40 waves, 1 321 bodies and 131 595
// effective HP against Easy's 35 / 830 / 25 939, and it paid exactly the same.
//
// ---------------------------------------------------------------------------
// THE SHAPE OF IT, AND WHY IT IS THIS SHAPE
//
// A tower defense wave is cleared when
//
//     effective HP delivered  <=  seconds available x board DPS x coverage
//
// which is the identity the genre's balance writing keeps arriving at, and it
// is already the identity THIS repo is built on: `waveEffectiveHealth` is the
// left side, `Maps.analyse` measures the coverage term, and the purse is what
// buys the DPS. So difficulty is not a property of the schedule alone -- it is
// what the run ASKS divided by what the run GIVES, on the board it is played on.
//
// Six measures of the ask and the give, each a plain ratio against the same
// measure on the reference campaign, combined as a GEOMETRIC MEAN -- the same
// idiom `Maps.analyse` uses for its own score, and the right one for a product
// of ratios: no factor can dominate by having a big unit, and a factor that
// does not move contributes exactly 1.
//
//   demand     mean required DPS -- effective HP over the seconds the wave has
//              to be cleared in. This is the one that folds hp, bodies and
//              PACING together: forty bodies in ten seconds and forty in sixty
//              are not the same wave, and no count can tell them apart.
//   spike      peak required DPS. The wave that actually ends runs.
//   length     how many waves. The commitment, and the number of chances to die.
//   fragility  the mean body's health against the base's own. Every leak costs
//              the leaker's remaining health out of 100, and NOTHING in the
//              purse buys base HP back. This is the axis money cannot answer.
//   roster     the share of scheduled HP carried by a body that needs a
//              SPECIFIC answer -- flight, camo, armour, a shield, a revive, a
//              brood, an attack on your towers. Damage alone does not clear it.
//   relief     the purse, INVERTED, because money is the one thing that makes a
//              campaign easier. Capped at what a board can physically absorb --
//              see `boardCeiling`.
//
//   map        a seventh, when a board is named: `Maps.analyse(map).score`,
//              which is already normalised against a straight reference road
//              and already folds coverage, grace and route count.
//
// NORMALISED SO THE REFERENCE READS EXACTLY 1.00. The reference is Easy on the
// default board, so `rate(EASY_WAVES, DEFAULT_ID).rating === 1`, by
// construction and not by luck. That is what "scale the Normal rewards ON the
// Easy rewards" means: Easy is the unit.
//
// ---------------------------------------------------------------------------
// WHAT IT SAYS TODAY, and the part that is worth reading before retuning
// anything: Normal rates about 1.5, not the 5.07 its raw HP suggests. The
// reason is in the factors and it is not a fudge -- Normal sends 2.60x the DPS
// and hits 3.19x as hard per leak, but it also pays 2.80x the purse. A campaign
// that scales its own economy with its own threat is not five times harder; it
// is a bigger version of itself, and the honest number is the one that says so.
//
// ---------------------------------------------------------------------------
// EVERYTHING IS READ AT CALL TIME. This file loads with the systems, before
// game.js, so `WAVES`, `waveEffectiveHealth`, `STARTING_CASH` and `Maps` do not
// exist yet when it is evaluated -- the same arrangement
// `MetaProgress.constructorOf` documents at length. Nothing here runs until a
// caller asks.
// ---------------------------------------------------------------------------

var Difficulty = (function () {
  "use strict";

  // The campaign every other campaign is measured against, and the board it is
  // measured on. Named by id rather than held by reference so this file has no
  // load-order relationship with game.js at all.
  var REFERENCE_DIFFICULTY_ID = "easy";

  var cachedReference = null;
  var cachedCeiling = null;

  function scope() {
    return (typeof globalThis !== "undefined") ? globalThis
      : (typeof window !== "undefined") ? window
      : (typeof global !== "undefined") ? global : null;
  }

  function readGlobal(name) {
    var s = scope();
    return s ? s[name] : undefined;
  }

  // Is the world loaded enough to measure? Everything below needs game.js's
  // schedule helpers, and a caller may reasonably ask before then (the codex
  // builds its models on open; a test may boot only the systems).
  function available() {
    var Enemy = readGlobal("Enemy");
    return typeof readGlobal("waveEffectiveHealth") === "function" &&
      typeof readGlobal("waveGroups") === "function" &&
      // `Enemy` is a CONSTRUCTOR, so `typeof` is "function" -- what is wanted
      // is its two resolvers, which is what this actually calls.
      !!(Enemy && typeof Enemy.typeOf === "function" &&
         typeof Enemy.healthOf === "function");
  }

  // --- what a wave asks -----------------------------------------------------

  // The seconds a wave has to be cleared in. `duration` is the authored ceiling
  // and every wave carries one except the last, which is deliberately open --
  // there is no wave after it to hold up. For that one the honest span is when
  // its last body arrives, which is what `waveTimeline` reports.
  //
  // Never zero: a span of zero would put an infinity into a geometric mean and
  // take the whole rating with it.
  function waveSeconds(wave) {
    if (wave.duration !== undefined && wave.duration > 0) return wave.duration;
    var timeline = readGlobal("waveTimeline");
    if (typeof timeline === "function") {
      var events = timeline(wave);
      if (events && events.length) {
        return Math.max(1, events[events.length - 1].time);
      }
    }
    return 1;
  }

  // WHICH TRAITS COUNT AS "NEEDS A SPECIFIC ANSWER". Read as BLOCKS off the
  // type, never as a list of ids -- the same rule `Enemy.traitsOf` follows, and
  // for the same reason: a type that grows a new block gets counted here with
  // nothing edited. A body with none of these is answered by damage, and damage
  // is what `demand` already prices.
  function needsAnAnswer(type) {
    if (!type) return false;
    return !!(type.isFlying || type.isCamo || type.armor || type.defense ||
      type.shield || type.revive || type.spawns || type.support ||
      type.attack || type.attacks || type.sprint || type.deathEffect ||
      type.fractal || type.phases || type.disable);
  }

  // --- the raw measures -----------------------------------------------------
  //
  // One pass over a schedule. Everything is read through the game's own
  // resolvers -- waveEffectiveHealth, waveCount, Enemy.healthOf, the four
  // reward functions -- so a rating cannot disagree with what actually walks
  // out of the gate or with what the player is actually paid.
  function profileOf(schedule) {
    var effectiveHealth = readGlobal("waveEffectiveHealth");
    var count = readGlobal("waveCount");
    var groupsOf = readGlobal("waveGroups");
    var killBounty = readGlobal("waveKillBounty");
    var clearBounty = readGlobal("waveBounty");
    var progression = readGlobal("waveProgressionReward");
    var escalating = readGlobal("waveEscalatingReward");
    var Enemy = readGlobal("Enemy");

    var purse = readGlobal("STARTING_CASH") || 0;
    var hp = 0, bodies = 0, demanding = 0, dpsSum = 0, dpsPeak = 0;

    for (var i = 0; i < schedule.length; i++) {
      var wave = schedule[i];
      var number = i + 1;
      var waveHp = effectiveHealth(wave);
      var seconds = waveSeconds(wave);

      hp += waveHp;
      bodies += count(wave);

      var dps = waveHp / seconds;
      dpsSum += dps;
      if (dps > dpsPeak) dpsPeak = dps;

      var groups = groupsOf(wave);
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        if (!needsAnAnswer(Enemy.typeOf(group.type))) continue;
        demanding += group.count *
          Enemy.healthOf(group.type, group.health, group.tier);
      }

      purse += killBounty(wave) + clearBounty(wave) +
        progression(number) + escalating(number);
    }

    var waves = schedule.length || 1;
    return {
      waves: waves,
      bodies: bodies,
      hp: hp,
      purse: purse,
      // The four derived measures the factors are built from. Kept beside the
      // raw ones so a reader can check the arithmetic without re-deriving it.
      demand: dpsSum / waves,
      spike: dpsPeak,
      fragility: bodies ? hp / bodies : 0,
      roster: hp ? demanding / hp : 0
    };
  }

  // WHAT A BOARD CAN PHYSICALLY ABSORB, which is the ceiling on what money is
  // worth. Five slots (MetaProgress.SLOT_COUNT) and every tower capped at tier
  // 5 on one path and 2 on another, so past this figure a purse buys nothing at
  // all and a campaign that paid ten times as much would not be ten times
  // easier.
  //
  // The five CHEAPEST maxed towers, deliberately: it is a floor on what a full
  // board costs, and a floor is the safe end for a cap -- it binds sooner
  // rather than later. Read off each tower's own table (`UPGRADES` for the
  // hand-written ones, `config.paths` for the configured ones), because those
  // are the prices a player actually pays.
  //
  // IT DOES NOT BIND TODAY and that is worth knowing rather than hiding: the
  // cheapest full board is about 128 000 mana, Easy's whole purse is 35 831 and
  // Normal's is 100 480, so both campaigns are still money-limited and `relief`
  // is the plain purse ratio. The cap is here for the campaign that is not.
  //
  // Any failure to read a table gives Infinity -- no cap, which is exactly the
  // behaviour of not having written this.
  function boardCeiling() {
    if (cachedCeiling !== null) return cachedCeiling;

    var Meta = readGlobal("MetaProgress");
    var path = readGlobal("path");
    if (!Meta || typeof Meta.catalogue !== "function") return Infinity;

    var costs = [];
    try {
      Meta.catalogue().forEach(function (row) {
        var Type = Meta.constructorOf(row.id);
        if (!Type) return;

        var byBranch = {};
        if (Type.UPGRADES) {
          Type.UPGRADES.forEach(function (tier) {
            (byBranch[tier.branch] = byBranch[tier.branch] || []).push(tier.cost);
          });
        } else {
          var probe = new Type(-100000, -100000, path);
          var config = probe.core && probe.core.config;
          if (config && config.paths) {
            Object.keys(config.paths).forEach(function (branch) {
              byBranch[branch] = config.paths[branch].map(function (tier) {
                return tier.cost;
              });
            });
          }
        }

        var branches = Object.keys(byBranch);
        if (!branches.length) { costs.push(Type.COST || 0); return; }

        // The dearest legal build: one path to the top, and the best other
        // path to the crosspath cap of two.
        var dearest = 0;
        branches.forEach(function (main) {
          var spent = Type.COST || 0;
          byBranch[main].forEach(function (c) { spent += c; });
          var second = 0;
          branches.forEach(function (other) {
            if (other === main) return;
            var two = byBranch[other].slice(0, 2)
              .reduce(function (a, c) { return a + c; }, 0);
            if (two > second) second = two;
          });
          spent += second;
          if (spent > dearest) dearest = spent;
        });
        costs.push(dearest);
      });
    } catch (err) {
      cachedCeiling = Infinity;
      return cachedCeiling;
    }

    if (!costs.length) { cachedCeiling = Infinity; return cachedCeiling; }
    costs.sort(function (a, b) { return a - b; });
    var slots = Meta.SLOT_COUNT || 5;
    var total = 0;
    for (var i = 0; i < Math.min(slots, costs.length); i++) total += costs[i];
    cachedCeiling = total > 0 ? total : Infinity;
    return cachedCeiling;
  }

  // --- the factors ----------------------------------------------------------
  //
  // ORDER IS THE CONTRACT for the readout only; the rating is a product and
  // does not care. `invert` marks the one measure where MORE means EASIER.
  var FACTORS = [
    { key: "demand", label: "Demand",
      note: "mean HP per second the board has to remove" },
    { key: "spike", label: "Spike",
      note: "the worst single wave, same unit" },
    { key: "length", label: "Length",
      note: "waves, and so chances to die" },
    { key: "fragility", label: "Fragility",
      note: "what one leak costs, against a 100 HP base" },
    { key: "roster", label: "Roster",
      note: "share of HP that needs a specific answer, not just damage" },
    { key: "relief", label: "Relief", invert: true,
      note: "the purse, which is the only thing that makes it easier" }
  ];

  function measureOf(profile, key) {
    if (key === "length") return profile.waves;
    if (key === "relief") return Math.min(profile.purse, boardCeiling());
    return profile[key];
  }

  // The reference profile, measured once. Easy, and Easy is the unit.
  function reference() {
    if (cachedReference) return cachedReference;
    var difficulties = readGlobal("DIFFICULTIES");
    if (!difficulties) return null;
    for (var i = 0; i < difficulties.length; i++) {
      if (difficulties[i].id !== REFERENCE_DIFFICULTY_ID) continue;
      cachedReference = profileOf(difficulties[i].waves);
      return cachedReference;
    }
    return null;
  }

  // The reference board, so a map contributes 1.00 when it is the default one.
  function referenceMapScore() {
    var Maps = readGlobal("Maps");
    if (!Maps || typeof Maps.analyse !== "function") return null;
    var map = Maps.byId(Maps.DEFAULT_ID);
    if (!map) return null;
    var analysis = Maps.analyse(map);
    return (analysis && analysis.score) || null;
  }

  function mapScore(mapOrId) {
    var Maps = readGlobal("Maps");
    if (!mapOrId || !Maps || typeof Maps.analyse !== "function") return null;
    var map = (typeof mapOrId === "string") ? Maps.byId(mapOrId) : mapOrId;
    if (!map) return null;
    var analysis = Maps.analyse(map);
    return (analysis && analysis.score) || null;
  }

  // --- the CURVE, which is a different question from the rating -------------
  //
  // 2026-08-29, the owner's second instruction: "be sure it GETS harder, don't
  // make it impossible at the start". The rating is one number for a whole
  // campaign and cannot answer either half of that -- a campaign that opens
  // brutally and coasts to the finish rates the same as one that does the
  // opposite, and Normal was measurably the FIRST of those.
  //
  // So: per wave, the same ask-over-give the rating is built from, in the one
  // form that makes waves comparable to each other --
  //
  //     pressure(n) = required DPS at wave n / the purse the run has by then
  //
  // Required DPS is `waveEffectiveHealth / waveSeconds`, and the purse is every
  // coin the run has been paid up to and including that wave, through the same
  // four reward functions the game pays them with. A rising `pressure` means
  // the campaign is outrunning the player's wallet; a falling one means the
  // wallet is outrunning the campaign, which is what "it gets easier" is.
  function curveOf(schedule) {
    if (!schedule || !schedule.length || !available()) return [];
    var effectiveHealth = readGlobal("waveEffectiveHealth");
    var killBounty = readGlobal("waveKillBounty");
    var clearBounty = readGlobal("waveBounty");
    var progression = readGlobal("waveProgressionReward");
    var escalating = readGlobal("waveEscalatingReward");

    var purse = readGlobal("STARTING_CASH") || 0;
    var out = [];
    for (var i = 0; i < schedule.length; i++) {
      var wave = schedule[i];
      var number = i + 1;
      var hp = effectiveHealth(wave);
      var seconds = waveSeconds(wave);
      purse += killBounty(wave) + clearBounty(wave) +
        progression(number) + escalating(number);
      out.push({
        wave: number,
        hp: hp,
        seconds: seconds,
        purse: purse,
        demand: hp / seconds,
        pressure: purse > 0 ? (hp / seconds) / purse : 0
      });
    }
    return out;
  }

  // Does it get harder? Answered in THIRDS rather than wave by wave, and that
  // is a design decision rather than a statistical convenience: a campaign
  // SHOULD have breather waves -- Normal's pure camo wave, its pure flight
  // wave -- and a monotonic-per-wave rule would forbid them. What must rise is
  // the trend.
  //
  // THE LAST WAVE IS EXCLUDED, always. A finale carries no `duration` (there is
  // no wave after it to hold up), so its span is its last arrival and its
  // pressure is an order of magnitude above everything else -- Normal's reads
  // eight where no other wave reaches two. Left in, it would swamp the late
  // third and report any campaign as rising.
  function riseOf(schedule) {
    var curve = curveOf(schedule);
    if (curve.length < 6) return null;
    var body = curve.slice(0, curve.length - 1);
    var third = Math.floor(body.length / 3);
    function mean(rows) {
      var total = 0;
      for (var i = 0; i < rows.length; i++) total += rows[i].pressure;
      return rows.length ? total / rows.length : 0;
    }
    var early = mean(body.slice(0, third));
    var mid = mean(body.slice(third, third * 2));
    var late = mean(body.slice(third * 2));
    return {
      early: early, mid: mid, late: late,
      rise: early > 0 ? late / early : 0,
      // The two halves of the owner's brief, as booleans a test can hold.
      rises: late > mid && mid > early,
      gentlestAtTheStart: early <= mid && early <= late
    };
  }

  // --- the rating -----------------------------------------------------------
  //
  // Returns the number AND every factor behind it, because a single number
  // nobody can take apart is a number nobody can retune. `factors` is what the
  // index prints and what a test asserts against.
  //
  // A missing world, a missing reference or a zero anywhere gives a rating of
  // 1 -- the reference's own value -- rather than a NaN or an Infinity leaking
  // into a coin count.
  function rate(schedule, mapOrId) {
    var neutral = { rating: 1, factors: [], profile: null, map: null };
    if (!schedule || !schedule.length || !available()) return neutral;

    var base = reference();
    if (!base) return neutral;

    var here = profileOf(schedule);
    var factors = [];
    var product = 1;

    for (var i = 0; i < FACTORS.length; i++) {
      var spec = FACTORS[i];
      var mine = measureOf(here, spec.key);
      var theirs = measureOf(base, spec.key);
      if (!(mine > 0) || !(theirs > 0)) continue;
      var ratio = spec.invert ? (theirs / mine) : (mine / theirs);
      factors.push({ key: spec.key, label: spec.label, note: spec.note,
        value: mine, reference: theirs, ratio: ratio });
      product *= ratio;
    }

    var mine2 = mapScore(mapOrId);
    var theirs2 = referenceMapScore();
    if (mine2 > 0 && theirs2 > 0) {
      var mapRatio = mine2 / theirs2;
      factors.push({ key: "map", label: "Board", note: "coverage, grace and routes",
        value: mine2, reference: theirs2, ratio: mapRatio });
      product *= mapRatio;
    }

    if (!factors.length || !(product > 0) || !isFinite(product)) return neutral;

    return {
      rating: Math.pow(product, 1 / factors.length),
      factors: factors,
      profile: here,
      map: mine2 || null
    };
  }

  // The rating for a difficulty by id, which is what every caller outside this
  // file actually has. Falls back to the reference's own 1.00 for an unknown
  // id, so a stale saved string cannot pay a player nothing.
  function rateDifficulty(difficultyId, mapOrId) {
    var difficulties = readGlobal("DIFFICULTIES");
    if (!difficulties) return { rating: 1, factors: [], profile: null, map: null };
    for (var i = 0; i < difficulties.length; i++) {
      if (difficulties[i].id === difficultyId) {
        return rate(difficulties[i].waves, mapOrId);
      }
    }
    return rate(null, mapOrId);
  }

  // Just the number, for the reward layer.
  function scaleFor(difficultyId, mapOrId) {
    return rateDifficulty(difficultyId, mapOrId).rating;
  }

  // Measurements are cached because they walk two schedules and a board; the
  // sandbox retunes both at runtime, and a test builds its own campaigns.
  function reset() {
    cachedReference = null;
    cachedCeiling = null;
  }

  return {
    REFERENCE_DIFFICULTY_ID: REFERENCE_DIFFICULTY_ID,
    available: available,
    profileOf: profileOf,
    boardCeiling: boardCeiling,
    factors: function () { return FACTORS.slice(); },
    rate: rate,
    rateDifficulty: rateDifficulty,
    curveOf: curveOf,
    riseOf: riseOf,
    scaleFor: scaleFor,
    reset: reset
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Difficulty;
}
