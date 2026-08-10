// Upgrade effects -- what an upgrade DOES, before you buy it.
//
// Two audiences, one source:
//
//   describe()  the short line ON the button      "+15 dmg, +100 u.l. range"
//   card()      the full hover card beside it     Damage 35 -> 50 (+15), and
//                                                 a sentence per ability
//
// Derived, never typed. Every config already says what a tier changes: a bag
// of numeric deltas and a list of named grants/mechanics. Writing a prose
// description beside those would be a second source of truth that drifts the
// first time someone retunes a number and forgets the sentence. So this reads
// the same data the tower reads and renders it.
//
// The one thing that IS written down here is what a named mechanic MEANS --
// "pierce falloff" costs damage per enemy passed through. A name is not a
// number: it cannot go stale when a number is retuned, and the numbers inside
// each sentence are interpolated from the config's own mechanic parameters
// rather than repeated. An unnamed mechanic still shows up, spelled as its
// raw key, because a mechanic the player is never told about is worse than an
// ugly one.
//
// The Smasher reaches the same place by a different route -- it DIFFS a stat
// snapshot taken either side of a hypothetical purchase
// (Smasher.prototype.previewUpgrade) -- because its upgrades set absolute
// values rather than offsets, so "what changes" can only be answered by asking
// the tower. Both routes end in the same two shapes, formatted by the same
// functions below.

var UpgradeEffects = {

  // How each numeric field is spelled. `label`/`unit`/`one` build the short
  // line on the button; `title` and `show` build the hover card's before/after
  // row. Order here is the order they appear -- damage first, because that is
  // what the player is buying.
  //
  // Everything in a delta bag is a DELTA in the config's own units. critChance
  // and critDamage are already stored as percentage points (see the base stats
  // in long-range-dps.config.js), so they are NOT scaled -- doing so printed
  // "+2000% crit" for a 20-point bump, which is how this list earned a test.
  //
  // `fireRate` is spelled "atk/s" rather than the bare "/s" it used to be:
  // every tower now reports its rate of attack in attacks per second (see
  // js/systems/tower-stats.js), and "+0.25" with no noun attached could have
  // been anything.
  FIELDS: [
    { key: "damage",      label: "dmg",      title: "Damage" },
    // `ad` is the beam spec's word for the same thing. The FIELD keeps its
    // name (the config is the spec's, not ours); the LABEL does not, because
    // the panel row above the button says "Damage" for every tower.
    { key: "ad",          label: "dmg",      title: "Damage" },
    { key: "range",       label: "range",    title: "Range",       unit: " u.l.",
      show: function (v) { return TowerStats.distance(v); } },
    { key: "fireRate",    label: "atk/s",    title: "Attack speed",
      show: function (v) { return TowerStats.rate(v); } },
    { key: "attackRate",  label: "atk/s",    title: "Attack speed",
      show: function (v) { return TowerStats.rate(v); } },
    { key: "pierce",      label: "pierce",   title: "Pierce" },
    { key: "maxTargets",  label: "targets",  title: "Targets", one: "target" },
    { key: "critChance",  label: "crit",     title: "Crit chance",  unit: "%",
      show: function (v) { return v + "%"; } },
    { key: "critDamage",  label: "crit dmg", title: "Crit damage",  unit: "%",
      show: function (v) { return v + "%"; } },
    { key: "coneArcDeg",  label: "arc",      title: "Cone arc",     unit: "°",
      show: function (v) { return v + "°"; } },
    { key: "deadzone",    label: "deadzone", title: "Deadzone",     unit: " u.l.",
      show: function (v) { return TowerStats.distance(v); } },
    { key: "hp",          label: "HP",       title: "Tower HP" }
  ],

  // Short names for the flags a tier can grant, for the one line on the button.
  // A grant with no entry here is shown as-is rather than silently dropped.
  GRANTS: {
    camoDetection: "sees camo",
    pierceFalloff: "pierce falloff",
    infinitePierce: "infinite pierce",
    killStackAttackSpeed: "kill stacks",
    coneShape: "cone",
    deadzoneRemoved: "no deadzone",
    reload: "reload",
    executeScaling: "execute",
    tentativeExecuteFlat: "execute",
    guaranteedReloadShotCrit: "reload crit",
    activeAbility: "ability",

    ramp_per_target: "damage ramp",
    def_pierce: "defense pierce",
    charge_to_gold: "charges → gold",
    gold_to_power: "gold → power",
    hp_scaling: "HP scaling",
    lifesteal: "lifesteal",
    slow: "slow",
    death_denial: "death denial",

    fullCircle: "full circle",
    explodeOnSlowedKill: "blast on kill",
    earthquake: "earthquake",

    defenseFlatPierce: "defense pierce",
    recruits: "recruits",

    swarmBuff: "swarm buff",
    miniBlubs: "mini blubs",
    summonToggle: "summon toggles",
    hungryBlub: "hungry blub",
    weakenDebuff: "weakening",
    superBlub: "superblub",
    coagulation: "coagulation",

    // The third spelling (see grantsOf): a plain stat flag rather than a named
    // mechanic. `camoDetection` and `seesCamo` are the same promise made by
    // two configs in two vocabularies, so they get the same words.
    seesCamo: "sees camo",
    seesFlying: "sees flying"
  },

  // What each of those actually MEANS, in a sentence, for the hover card.
  // `text` may be a function of the mechanic's own parameters, so every number
  // in the sentence comes from the config rather than being repeated here.
  MECHANICS: {
    camoDetection: {
      text: "Can see and shoot camouflaged enemies, which are invisible to towers without it."
    },
    pierceFalloff: {
      text: function (p) {
        return "A shot loses damage with each enemy it passes through" +
          (p && p.decay ? ", keeping about " + Math.round(p.decay * 100) + "% of it per enemy." : ".");
      }
    },
    infinitePierce: {
      text: "Shots never stop at an enemy. They fly on through the whole line behind it, though falloff still wears them down."
    },
    killStackAttackSpeed: {
      text: function (p) {
        if (!p) return "Kills make this tower fire faster for a while.";
        return "Every kill adds " + Math.round(p.perStackBonus * 100) + "% attack speed for " +
          p.stackDurationSeconds + " s, stacking up to " + p.maxStacks + " times.";
      }
    },
    coneShape: {
      text: "Range stops being a circle and becomes a cone you point yourself. Re-aim it from this panel."
    },
    deadzoneRemoved: {
      text: "Removes the blind spot around the tower, so it can shoot enemies standing right beside it."
    },
    reload: {
      text: function (p) {
        if (!p) return "Fires a magazine, then pauses to reload.";
        return "Fires " + p.shotsBeforeReload + " shots, then reloads for " +
          p.reloadDurationSeconds + " s. The pause is fixed and does not shorten with attack speed.";
      }
    },
    executeScaling: {
      text: function (p) {
        if (!p) return "Wounded enemies take extra damage.";
        return "Wounded enemies take up to " + Math.round(p.maxBonus * 100) +
          "% extra damage, scaling up as their health falls.";
      }
    },
    tentativeExecuteFlat: {
      text: function (p) {
        if (!p) return "Wounded enemies take extra damage.";
        return "Enemies below " + Math.round(p.hpFractionThreshold * 100) + "% health take " +
          Math.round(p.flatBonus * 100) + "% extra damage. Replaced outright by the scaling version later on.";
      }
    },
    guaranteedReloadShotCrit: {
      text: "The last shot before each reload always crits and always lands the full execute bonus, whatever the target's health."
    },
    activeAbility: {
      text: function (p) {
        if (!p) return "Unlocks an ability you fire from this panel.";
        return "Unlocks a button on this panel: " + p.damage + " damage in a " + p.aoeRadius +
          " u.l. blast that ignores defense, for " + p.stunSeconds + " s stunned and " +
          p.maxHpLoss + " tower HP lost permanently.";
      }
    },

    ramp_per_target: {
      text: function (p) {
        if (!p) return "Damage builds up the longer a beam stays on one enemy.";
        return "Damage builds by " + Math.round(p.rampRate * 100) + "% a second while a beam holds an enemy, up to +" +
          Math.round(p.rampCap * 100) + "%. It resets when the beam moves on.";
      }
    },
    def_pierce: {
      text: function (p) {
        return "Ignores " + Math.round(((p && p.defPierce) || 0) * 100) +
          "% of an enemy's defense, so armoured targets stop shrugging the beam off.";
      }
    },
    charge_to_gold: {
      text: function (p) {
        if (!p) return "Damage builds charges that multiply the gold this tower earns.";
        return "Damage banks charges (first at " + p.firstThreshold + ", each next one " +
          p.growth + "x bigger) and each charge multiplies this tower's gold, up to x" +
          p.capTotal + ". Charges drain one per " + p.decaySeconds + " s out of combat.";
      }
    },
    gold_to_power: {
      text: "The gold in your bank becomes damage: the richer you are, the harder this tower hits and the more each charge pays. It moves both ways."
    },
    hp_scaling: {
      text: function (p) {
        if (!p) return "Healthy enemies take extra damage.";
        return "Enemies at full health take " + Math.round(p.maxBonus * 100) +
          "% extra damage, fading to nothing by " + Math.round(p.floorFraction * 100) + "% health.";
      }
    },
    lifesteal: {
      text: function (p) {
        return "Heals your base for " + Math.round(((p && p.ratio) || 0) * 100) +
          "% of the damage this tower deals. Base HP has no ceiling.";
      }
    },
    slow: {
      text: function (p) {
        var pct = Math.round(((p && p.fraction) || 0) * 100);
        return (p && p.seconds)
          ? "Enemies hit are slowed by " + pct + "% for " + p.seconds.toFixed(1) + " s."
          : "Enemies held by a beam move " + pct + "% slower, and speed back up shortly after it lets go.";
      }
    },
    death_denial: {
      text: function (p) {
        if (!p) return "Saves the run once when your base would be destroyed.";
        return "Once per game, the run does not end when your base falls: time rewinds, every enemy is dragged " +
          p.knockbackUl + " u.l. back down the road, and your base is left on " +
          p.restoreBaseHpTo + " HP. This tower is spent doing it.";
      }
    },

    fullCircle: {
      text: "The swing stops being a wedge and covers the whole circle, so nothing walks past behind it."
    },
    explodeOnSlowedKill: {
      text: "An enemy killed while it is already slowed bursts, damaging everything close to it — and anything that DIES to that burst bursts in turn, so a tight column can go up end to end. Each body can only explode once."
    },
    earthquake: {
      text: function (p) {
        if (!p) return "Stops every enemy on the map, then leaves them slowed.";
        return "The machine jumps, and every enemy ON THE WHOLE MAP stops dead for " +
          p.stunSeconds + " s — no radius, no line of sight. When they come round they " +
          "move " + Math.round(p.slowFraction * 100) + "% slower for another " +
          p.slowSeconds + " s. Ready again after " + p.cooldownSeconds +
          " s. It does not damage anything, and it does not catch enemies that " +
          "arrive after it fires.";
      }
    },

    // Renamed from `armorPierce` on 2026-07-30, when the Rifleman's B4 moved
    // off flat armor and onto percentage defence -- see js/systems/mitigation.js.
    defenseFlatPierce: {
      text: function (p) {
        var points = (p && p.points) || 0;
        return "Every shot ignores " + points + " percentage points of an enemy's defense, " +
          "so a target that normally shrugs off 20% of a hit only shrugs off " +
          Math.max(0, 20 - points) + "%. It cannot go below zero, so an enemy with no " +
          "defense at all takes exactly normal damage rather than extra.";
      }
    },
    recruits: {
      text: function (p) {
        if (!p) return "Unlocks a button that calls in temporary soldiers.";
        var rate = p.shotsPerSecond === undefined
          ? "a second"
          : "at " + p.shotsPerSecond.toFixed(2) + "/s";
        return "Unlocks a button on this panel: " + p.count + " temporary soldiers spawn at the " +
          "END of the road and march back towards the start. " + p.damage + " damage " + rate +
          " and " + p.hp + " HP each. They STOP while they shoot, so each one holds the ground " +
          "where it met the wave. An enemy that walks through one spends the recruit's " +
          "remaining health as damage and kills it. " + p.cooldownSeconds + " s cooldown.";
      }
    },

    // The Summoner's six (js/blub.js). Each one is a sentence rather than a
    // number for the same reason the rest are: the figures live in
    // BlubTower.UNITS and BlubTower.UPGRADES, and repeating them here would be
    // a second source of truth for the first retune to break.
    swarmBuff: {
      text: "Every living blub gives each OTHER blub of this summoner +5% damage " +
        "and +5% attack speed. Capped at +50% here, which is eleven blubs on the " +
        "board; A4 raises the ceiling to +100%. Blubs called by a different " +
        "summoner do not count."
    },
    miniBlubs: {
      text: "A second summon line starts up alongside the first: small, fast " +
        "blubs on their own short cycle, independent of everything else this " +
        "tower is calling."
    },
    summonToggle: {
      text: "Each summon line gets its own ON/OFF switch on this panel. A line " +
        "switched off stops producing; blubs already on the board keep going."
    },
    hungryBlub: {
      text: "A third summon line: one heavy blub that hits an area and grows " +
        "4% stronger with every attack it makes, compounding, for as long as " +
        "its charges last. The bonus belongs to that one body and dies with it."
    },
    weakenDebuff: {
      text: "Every enemy hit by a blub of this summoner takes +0.1% damage from " +
        "ALL sources for 5 seconds, stacking to +100%. Each hit carries its own " +
        "five seconds and expires on its own."
    },
    superBlub: {
      text: "A second line for the machine branch: one enormous blub with the " +
        "longest reach on the board, which fires a piercing lance instead of " +
        "its ordinary shot every tenth attack. The lance is free -- it costs no " +
        "charge -- so it gets exactly five of them."
    },
    coagulation: {
      text: "A button on this panel: every living blub merges into one monster " +
        "blub at the tower, pooling their CURRENT charges and their raw damage. " +
        "The pooled total picks its tier, permanently. From tier 3 the tower " +
        "fuses with it and stops summoning; tier 4 needs a pool of exactly 6666. " +
        "300 s cooldown."
    },

    seesCamo: {
      text: "Can see and shoot camouflaged enemies, which are invisible to towers without it."
    },
    seesFlying: {
      text: "Can shoot flying enemies, which are out of reach for towers without it."
    }
  },

  // Every flag a tier switches on, under all THREE spellings a config may use
  // (see StatResolver, which reads the same three): `grants` is a list of flag
  // names, `mechanics` a list of module keys, and `flags` an object of named
  // booleans. They behave identically -- a tier turns them on and they stay on
  // -- so a description that reads only one of them silently drops the rest.
  // The beam's B1 grants camo detection through `flags` and its button said
  // nothing but "+150 HP" until this looked there too.
  grantsOf: function (tier) {
    var names = (tier.grants || []).concat(tier.mechanics || []);
    var flags = tier.flags || {};
    Object.keys(flags).forEach(function (key) {
      if (flags[key]) names.push(key);
    });
    return names;
  },

  // A signed number, trimmed: 0.25 -> "+0.25", -0.15 -> "-0.15", 5 -> "+5".
  signed: function (value) {
    var rounded = Math.round(value * 100) / 100;
    return (rounded >= 0 ? "+" : "") + rounded;
  },

  fieldFor: function (key) {
    for (var i = 0; i < UpgradeEffects.FIELDS.length; i++) {
      if (UpgradeEffects.FIELDS[i].key === key) return UpgradeEffects.FIELDS[i];
    }
    return null;
  },

  // deltas: { damage: 15, range: 50, ... }   grants: ["coneShape", ...]
  // Returns "" when a tier changes nothing describable, which the caller
  // should treat as "print the price alone" rather than an empty second line.
  describe: function (deltas, grants) {
    var parts = [];

    UpgradeEffects.FIELDS.forEach(function (field) {
      if (!deltas) return;
      var raw = deltas[field.key];
      if (raw === undefined || raw === 0) return;

      var label = (field.one && Math.abs(raw) === 1) ? field.one : field.label;
      parts.push(UpgradeEffects.signed(raw) + (field.unit || "") + " " + label);
    });

    (grants || []).forEach(function (name) {
      parts.push(UpgradeEffects.GRANTS[name] || name);
    });

    return parts.join(", ");
  },

  // The damage/rate pair out of a RESOLVED stat block, or null if it does not
  // carry one.
  //
  // Two spellings, because two configs use two vocabularies for one idea: the
  // Longshot says damage/fireRate and the beam spec says ad/attackRate. That
  // split already exists in FIELDS above, which lists both and gives both the
  // same title -- this is the same union taken once more, in the one place
  // that needs the pair rather than the individual rows.
  attackPair: function (stats) {
    if (!stats) return null;
    var damage = (typeof stats.damage === "number") ? stats.damage : stats.ad;
    var rate = (typeof stats.fireRate === "number") ? stats.fireRate : stats.attackRate;
    if (typeof damage !== "number" || typeof rate !== "number") return null;
    if (!isFinite(damage) || !isFinite(rate)) return null;
    return { damage: damage, rate: rate };
  },

  // "DPS  3 → 5  (+2)" for the hover card, or null when the tier does not move
  // it (2026-07-29, at the owner's request).
  //
  // The reason this is worth a row of its own: damage and attack speed are the
  // two numbers a player is really trading between, and neither one answers
  // the question on its own. "+6 dmg" on a slow tower and "+0.4 atk/s" on a
  // fast one are the same purchase, and the only way to see that from the two
  // rows above was to multiply them in your head, twice, before deciding.
  //
  // DERIVED from the same two stats the Damage and Attack speed rows print, by
  // the same definition TowerStats.dps uses for the panel -- damage x attacks
  // per second against ONE enemy. So the three rows on the card always
  // multiply out, and a tower that hits several at once still reports what it
  // does to each rather than quietly redefining DPS.
  dpsChange: function (before, after) {
    var was = UpgradeEffects.attackPair(before);
    var now = UpgradeEffects.attackPair(after);
    if (!was || !now) return null;

    var from = was.damage * was.rate;
    var to = now.damage * now.rate;
    if (from === to) return null;

    return {
      label: "DPS",
      from: TowerStats.dpsText(from),
      to: TowerStats.dpsText(to),
      delta: UpgradeEffects.signed(to - from)
    };
  },

  // Before/after rows for the hover card, from two RESOLVED stat blocks --
  // which is what makes them honest about crosspathing: A3's "+100 range" is
  // measured on the tower standing on the map, not read off the table.
  //
  // Fields are walked in FIELDS order and only the ones that moved are kept,
  // so a tier that changes four stats produces four rows and no filler.
  statChanges: function (before, after) {
    var rows = [];

    UpgradeEffects.FIELDS.forEach(function (field) {
      var was = before[field.key];
      var now = after[field.key];
      if (was === undefined || now === undefined || was === now) return;

      var show = field.show || function (v) { return TowerStats.number(v); };
      var numeric = (typeof was === "number" && typeof now === "number" &&
        isFinite(was) && isFinite(now));

      rows.push({
        label: field.title,
        from: show(was),
        to: show(now),
        delta: numeric ? UpgradeEffects.signed(now - was) : ""
      });
    });

    // Not a number and not a delta, but the single most visible thing A4 does
    // to a Longshot: its range stops being a circle.
    if (before.targetShape !== after.targetShape) {
      rows.push({ label: "Shape", from: before.targetShape, to: after.targetShape, delta: "" });
    }

    // DPS LAST, which is the same order the inspection panel puts it in (see
    // TowerStats: totals, damage, range, attack speed, the type's own rows,
    // then DPS). It is the summary of the rows above it, so it reads as one.
    var dps = UpgradeEffects.dpsChange(before, after);
    if (dps) rows.push(dps);

    return rows;
  },

  // One entry per ability a tier switches on: its short name and the sentence
  // that says what it does. `mechanics` is the RESOLVED mechanics block after
  // the purchase, so every number quoted is the one that tier will actually
  // run with (B4 raising B3's execute cap reads as 60%, not 40%).
  abilities: function (grants, mechanics) {
    return (grants || []).map(function (name) {
      var entry = UpgradeEffects.MECHANICS[name];
      var text = entry ? entry.text : null;
      if (typeof text === "function") text = text(mechanics ? mechanics[name] : null);

      return {
        name: UpgradeEffects.GRANTS[name] || name,
        text: text || "No description written for this one yet."
      };
    });
  },

  // The hover card model, normalised so the drawing code can rely on every
  // field existing. Towers build the parts they alone can measure; the shape
  // is fixed here so one piece of drawing code serves every tower.
  card: function (spec) {
    return {
      title: spec.title || "",
      subtitle: spec.subtitle || "",
      changes: spec.changes || [],
      abilities: spec.abilities || [],
      note: spec.note || null
    };
  }
};

if (typeof module !== "undefined" && module.exports) {
  var TowerStats = require("./tower-stats.js");
  module.exports = UpgradeEffects;
}
