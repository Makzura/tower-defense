// ---------------------------------------------------------------------------
// Enemy
//
// A single walker. Moves along the path at a speed defined in u.l./s, dies at
// 0 HP, and is removed when it reaches the end.
//
// There is one Enemy constructor and a TABLE OF TYPES -- see Enemy.TYPES. A
// type is only data (health, relative speed, colour); no type has behaviour of
// its own, so nothing branches on which one an enemy is.
//
// Nine opt-in mechanics on a type turn that data into behaviour, and each is read by
// asking whether the enemy HAS one, never which type it is:
//
//   attack   swings at the nearest tower in reach, and    (attackTowers,
//            optionally (`facesTarget`) stops to turn      beginAttackPosture)
//            toward it, strike, and turn back first
//   shield   a pool that soaks damage first, and what     (takeDamage,
//            breaking it does to the enemy                breakShield)
//   revive   gets back up once, at full health            (tryRevive)
//   spawns   seeds a brood as it walks                    (spawnMinions)
//   support  helps OTHER enemies on a timer -- shields    (supportAllies)
//            them, or heals them
//   fractal  owns a tier and splits into four smaller      (splitOnDeath)
//            copies when it dies
//   aoeDamageReduction
//            reduces explicitly tagged area damage         (takeDamage)
//   phases   changes at authored health thresholds          (checkPhases)
//   sprint   moves faster over an opening stretch           (currentSpeedUlps)
//
// Adding a tenth mechanic means one more data field and one function that reads it,
// not a branch in an existing one.
// ---------------------------------------------------------------------------

// `overrides` is per-SPAWN state that the type does not decide. It began as
// `{ armor, defense }` for the debug spawner and grew a shield and a bounty
// flag in v0.4.7, when the Hive needed its brood to be ordinary normals
// carrying a shield and paying nothing -- properties of how they were BORN,
// not of what a normal is. Putting them on the `normal` row would have given
// every normal in the campaign a shield.
function Enemy(path, health, typeId, overrides) {
  var defenses = overrides;          // the old name, kept for the two fields it owned
  var type = Enemy.typeOf(typeId);

  this.path = path;
  this.routeId = overrides && overrides.routeId ? overrides.routeId : "main";

  // WHICH SCHEDULED WAVE THIS BODY BELONGS TO. 1-based, matching the number the
  // player is shown; 0 means "no wave put it here" -- a sandbox spawn, a codex
  // sprite, a test fixture.
  //
  // This is what ends a wave (see waveStillOnTheRoad in js/game.js), so it has
  // to reach every body a wave is ultimately responsible for, not just the ones
  // the scheduler itself constructs. THREE PLACES IN THIS FILE MAKE AN ENEMY
  // OUT OF ANOTHER ENEMY -- spawnMinions (a Hive's brood), splitOnDeath (a
  // Fractal Slime's four children) and summon (the wave-35 boss's roar) -- and
  // each one copies this field across, which is why origin is INHERITED here
  // rather than read from a global.
  //
  // Reading a global "current wave" in the child would be actively wrong, not
  // merely indirect: a T5 slime leaves 84 descendants across five generations
  // and a Hive drops five hatchlings every seven seconds, so those bodies
  // routinely outlive the wave that scheduled their ancestor. They belong to
  // that ancestor's wave, however many waves later they are born, and that is
  // the difference between "the wave you beat is over" and a wave that can
  // never be closed because the next one keeps re-parenting its leftovers.
  //
  // A Revenant needs no code at all: it gets back up as the SAME object, so it
  // keeps the origin it was born with for free. That is worth knowing before
  // anyone goes looking for the branch that handles it.
  this.waveId = (overrides && overrides.waveId) || 0;

  this.type = type;
  this.typeId = type.id;
  // A fractal's tier is instance state: every generation is still the SAME
  // roster type, with its health derived from T0 = 1 and x4 per tier. Keeping
  // the tier on the spawn avoids six near-identical type rows and makes the
  // death split a simple Tn -> four T(n-1) operation.
  this.fractalTier = Enemy.fractalTierOf(type, overrides && overrides.tier);
  this.fractalSizeScale = type.fractal
    ? type.fractal.minSizeScale + this.fractalTier * type.fractal.sizeStep
    : 1;
  this.fractalSplitDone = false;
  this.maxHealth = Enemy.healthOf(typeId, health, this.fractalTier);
  this.health = this.maxHealth;

  // Speed comes from the base walking speed scaled by the type, so retuning
  // BASE_SPEED_ULPS moves the whole roster together and keeps their relative
  // pacing intact.
  this.speedUlps = Enemy.BASE_SPEED_ULPS * type.speedMultiplier;

  // Where this one walks ACROSS the road: a signed offset from the centreline,
  // in u.l., handed out by the deterministic sequence below. Big enemies keep
  // nearer the middle (`laneSpread` on the type), a swarm uses the full width.
  this.laneIndex = Enemy.nextLaneIndex();
  this.laneOffsetUl = Enemy.laneOffsetFor(this.laneIndex) *
    Enemy.LANE_SPREAD_UL * (type.laneSpread === undefined ? 1 : type.laneSpread);

  this.progress = 0;                 // distance travelled ALONG the road, in px
  this.pos = this.positionAt(0);

  // --- things that happen TO an enemy, rather than things it IS -------------
  //
  // Everything below is instance state moved by a `shield`, `revive` or
  // `spawns` block on the type. Each one is read by asking "does this enemy
  // have a shield / a revive / a brood", never "is this enemy a Bulwark" --
  // the same rule the `attack` block above follows, and the reason the file's
  // founding promise (nothing branches on which type an enemy is) survives
  // three more mechanics.

  // A pool that soaks damage before health does. Sized as a MULTIPLE of this
  // enemy's own health rather than as a flat number, so a wave that scales the
  // type up with a `health` override scales its shield in step -- a Bulwark is
  // "twice its own health in shield" at every point in the campaign, and there
  // is no second number to forget to retune.
  //
  // The ratio comes from the type, OR from the spawn that made this one: a
  // Hive's brood is ordinary normals wearing a shield, which is a fact about
  // their birth rather than about the normal type.
  var shieldRatio = (overrides && overrides.shieldRatio !== undefined)
    ? overrides.shieldRatio
    : (type.shield ? type.shield.ratio : 0);
  this.shieldMax = this.maxHealth * shieldRatio;
  this.shield = this.shieldMax;
  this.shieldFlash = 0;              // cosmetic, 1 -> 0, set when it breaks

  // HAS THIS BODY'S SHIELD EVER EMPTIED. One-way, set by `breakShield` and
  // never cleared, and it is not the same claim as `shield <= 0`.
  //
  // A shield is REFILLABLE by something outside this enemy: a Shieldbearer's
  // pulse picks the ten strongest bodies on the road and hands each a plate,
  // and a broken Bulwark standing among them is exactly the kind of body that
  // pulse picks. `shield <= 0` goes false again at that moment; what the
  // Bulwark got back is 20 points of soak, NOT its shield -- `speedScale` was
  // doubled permanently by `onBreak` below and nothing puts it back.
  //
  // So this is the fact the renderer needs, and reading the pool instead would
  // have put the halo back onto a body that is still running at 90 u.l./s.
  // Same argument, and the same one-way shape, as `revived` on the Revenant:
  // gl-world.js::enemyModel swaps the mesh off both.
  this.shieldBroken = false;

  // IS THE SHIELD DOWN RIGHT NOW, which is the OTHER question, and the two are
  // not interchangeable in either direction.
  //
  // `shieldBroken` is one-way and permanent -- "this body has stood without its
  // shield", the fact the Bulwark's stripped mesh depicts, and it stays true
  // forever because what the Bulwark lost is not coming back. `shieldOut` goes
  // false again the moment anything hands this body a shield, because the
  // Vanguard's IS coming back: it shields ITSELF every seven seconds
  // (`support.pick === "self"`), so its shield is a rhythm rather than an
  // event, and a mesh swap keyed on the permanent flag would leave the fast
  // boss in its wreckage for the rest of the run.
  //
  // NOT `shield <= 0` EITHER, and that is the trap on the other side. A body
  // that has never been given a shield has an empty pool too -- the Vanguard
  // spawns with `shieldMax` 0 and waits out its first seven seconds -- and it
  // has not been broken, it has not arrived yet. Reading the pool would walk
  // the boss onto the board already in pieces.
  this.shieldOut = false;

  // HOW LONG THE CURRENT GAP LASTS, captured when the shield goes, and it is a
  // captured VALUE rather than a countdown of its own so that nothing has to
  // tick it. `supportTimer` is already counting toward the pulse that will
  // refill the pool; recording what it read at the break gives both ends of the
  // window, and `shieldReformProgress` is then a division rather than a second
  // clock that could drift from the first. Zero for every body that does not
  // bring its own shield back.
  this.shieldGapSeconds = 0;

  // WHERE THE BOARD WAS WHEN IT WENT. Presentation reads this and the
  // simulation never does: the shards a broken shield throws land on the ROAD
  // and are left behind by a boss that does not stop, so the renderer needs the
  // point they were thrown from and cannot reconstruct it from a body that has
  // since run 500 u.l. down the map. Null until the first break.
  this.shieldBreakAt = null;

  // A BODY THAT SHIELDS ITSELF ARRIVES WITH IT UP (2026-08-26, at the owner's
  // instruction: "he should also spawn in with his shield").
  //
  // `supportTimer` starts at a full interval, so a self-shielding type used to
  // walk on bare and stand there for seven seconds before its own first pulse
  // -- which reads as a boss that has forgotten its defining mechanic, and on
  // the Vanguard it is worse than that: the opening sprint is 400 u.l. and at
  // 175 u.l./s that is most of the window, so the ONE stretch of road where
  // the shield matters most was the stretch it did not have one.
  //
  // THROUGH `grantShield`, NOT BY ASSIGNMENT, so the non-stacking rule and the
  // `shieldMax` bookkeeping have exactly one implementation. The flash is put
  // back to zero straight after: `shieldFlash` means "this body JUST gained a
  // shield", and a body that arrived with one did not gain it in front of the
  // player.
  //
  // ONLY FOR `pick: "self"`. A Shieldbearer's pulse is aimed at other bodies
  // and hands out nothing at spawn; reading `support.shield` alone would have
  // armoured every supporter with the plate it exists to give away.
  var ownShield = type.support;
  if (ownShield && ownShield.pick === "self" && ownShield.shield > 0) {
    this.grantShield(ownShield.shield, ownShield.stacks !== false);
    this.shieldFlash = 0;
  }

  // What happens when that shield empties, if anything. Read off the instance
  // rather than the type for the same reason: a shield that came from a spawn
  // has no type row to look it up in.
  this.shieldOnBreak = (type.shield && type.shield.onBreak) || null;

  // Does killing this one pay? Same story -- the Hive's brood pays nothing
  // because of where it came from, not because normals are worthless.
  this.noBounty = (overrides && overrides.noBounty !== undefined)
    ? !!overrides.noBounty : !!type.noBounty;

  // Second wind. Each revive puts the enemy back to `healFraction` of full
  // instead of killing it. `roots` freezes it where it fell -- see tryRevive
  // for why that is not a soft lock.
  this.revivesLeft = type.revive ? type.revive.times : 0;
  this.revived = false;
  this.reviveFlash = 0;

  // The brood timer, for types that seed more enemies as they walk. Starts
  // FULL like the attack timer, so a spawner does not empty a litter onto the
  // road the instant it appears.
  this.spawnTimer = type.spawns ? type.spawns.intervalSeconds : 0;
  this.spawnFlash = 0;

  // The support timer, for types that help the enemies around them (the
  // Shieldbearer's shields, the Healer's regeneration, the Vanguard's own
  // shield). FULL at birth for the same reason the two above are: a support
  // enemy that pulsed the instant it walked in would give the player nothing
  // to react to, and the first pulse is the one you most want to see coming.
  this.supportTimer = type.support ? type.support.intervalSeconds : 0;
  this.supportFlash = 0;

  // Regeneration PUT ON this enemy by a support pulse: how fast, and for how
  // long. Instance state rather than type data -- the same distinction the
  // timed slow above makes, and for the same reason. See applyHeal.
  this.healPerSecond = 0;
  this.healTimer = 0;
  this.healFlash = 0;

  // Health that has been HEALED BACK, and which damage-led mechanics have
  // therefore already counted once. It sits on top of `health`, so it is the
  // first thing a blow takes off and is not reported twice. See takeDamage.
  this.healedHealth = 0;

  // Bodies this enemy has produced but not yet handed to the board. Filled by
  // a phase change (the boss's roar); drained by spawnMinions, which is what
  // the main loop already asks every enemy every step.
  this.pendingSpawns = null;

  // How many `phases` rows have already fired. Phases are one-way and in
  // order, so a counter is enough and an enemy healed back above a threshold
  // cannot re-trigger one.
  this.phasesEntered = 0;
  this.phaseFlash = 0;

  // A permanent multiplier on walking speed, and a permanent stop. Kept
  // separate from `slowMultiplier` (which is a timed debuff that expires) and
  // from `speedUlps` (which is what the TYPE walks at): this is what the run
  // has done to this particular body.
  this.speedScale = 1;
  this.rooted = false;

  // Attacking enemies. A type carries either a single `attack` block (the
  // Angry) or a POOL of them in `attacks` (the boss) -- the same
  // one-or-many arrangement a wave has with `groups`, and reconciled in one
  // place by Enemy.attacksOf, so nothing downstream cares which form it got.
  //
  // Copied onto the instance because the pool GROWS: the boss's roar appends a
  // second attack to it. Sliced, so the array on the type is never the one
  // being mutated.
  this.attacks = Enemy.attacksOf(type).slice();
  this.attackIndex = 0;              // which of the pool comes next; it cycles
  this.attack = this.attacks[0] || null;   // the first one, for readouts

  // The timer starts FULL rather than at zero, so an attacker does not land a
  // free hit the instant it walks into reach -- there is always a wind-up you
  // can react to.
  this.attackTimer = this.attack ? this.attack.intervalSeconds : 0;
  this.attackFlash = 0;              // cosmetic, 1 -> 0, set when it swings

  // Wind-up. An attack with `windUpSeconds` makes the enemy STOP for that long
  // before it resolves -- a telegraph, and the reason a heavy attack is fair.
  // `windUpAttack` is the spec it committed to, so the attack that lands is
  // always the one that was announced.
  this.windUpTimer = 0;
  this.windUpAttack = null;
  this.shockwaveFlash = 0;           // cosmetic, for a leap's landing
  this.attackBeam = null;            // cosmetic, {x, y, life} -- where a shot went

  // THE TETHERS A SUPPORT PULSE THREW, and the one place in this file that
  // holds a reference to another enemy.
  //
  // Cosmetic, like `attackBeam` above, and shaped differently for a reason the
  // difference between the two makes plain. A Hedger shoots a TOWER, which
  // cannot move, so a fixed `{x, y}` is the whole truth about where the shot
  // went and holding the tower would be pointless. A Healer threads a body that
  // is still walking, and a line drawn to where that body was a second ago is a
  // line to nothing. So each entry is `{ target, life }` and the target is the
  // enemy itself, re-read every frame.
  //
  // WHAT KEEPS THAT FROM BEING A LEAK. Entries are dropped by update() the
  // instant the target is dead, has leaked, or the tether's own life runs out
  // -- under a second and a half, against a support interval of eight -- so the
  // list is empty far more often than not and nothing here outlives the pulse
  // that made it. The array is also per-SUPPORTER: only a body with a `support`
  // spec that asks for tethers ever puts anything in it.
  this.supportLinks = [];

  // Facing posture. An attack spec with `facesTarget: true` makes the enemy
  // stop, turn to face what it is about to hit, strike, and turn back --
  // instead of swinging through its own gesture at whatever angle it happened
  // to be walking. null when not posturing; see beginAttackPosture and
  // headingVec. Entirely separate from windUpTimer/windUpAttack above: a spec
  // that carries both composes them (turn, THEN wind up, THEN strike) inside
  // this one state machine, and a spec with neither is untouched by any of it.
  this.attackPosture = null;

  // Camo: this enemy is invisible to towers without detection. A property of
  // the TYPE, copied onto the instance because that is where every consumer
  // looks (RangeFilter duck-types `{ x, y, isCamo }`, and it has since v0.3.5
  // -- the roster simply had nothing camouflaged to feed it until now).
  this.isCamo = !!type.isCamo;
  // Air units follow the same deterministic path but fail closed for any tower
  // that does not explicitly advertise flying reach.
  this.isFlying = !!type.isFlying;

  this.dead = false;                 // killed by the player
  this.leaked = false;               // reached the end of the path
  this.flash = 0;                    // hit feedback, 1 -> 0

  // Damage already on its way here in the form of bullets in flight. Bullets
  // claim it when fired and give it back when they land or lose the target.
  this.incomingDamage = 0;

  // Physical damage absorbed by the most recent hit, including shields and
  // restored health. TowerScore reads this for the lifetime damage counter.
  // It is deliberately separate from takeDamage()'s return value, which stays
  // restricted to damage-led economy mechanics such as Siphon charge/healing.
  this.lastDamageTaken = 0;

  // Movement slow. One slow at a time, never stacked -- see applySlow.
  this.slowMultiplier = 1;           // 1 = full speed, 0.35 = 65% slowed
  this.slowTimer = 0;                // seconds of slow remaining

  // A TIMED movement stun (2026-07-30, for the Warbringer's B5 earthquake).
  // Distinct from all three of the other ways an enemy can be stopped, and
  // deliberately so:
  //
  //   rooted        PERMANENT, set by a revive. Never comes back.
  //   windUpTimer   the enemy's OWN doing -- it stopped to aim.
  //   slowMultiplier a fraction of speed, never all of it.
  //   stunTimer     something the PLAYER did to it, for a fixed span.
  //
  // Movement only. A stunned Tyrant still aims and still shoots: the ability
  // that grants this was specified as "enemies stop moving", and an attack
  // lockout is a much bigger promise than the words carry.
  this.stunTimer = 0;
  this.stunFlash = 0;

  // Defensive stats. Read from the type, overridable per spawn. Both default
  // to zero, so every enemy that predates the mitigation system takes damage
  // exactly as it always did.
  //
  //   armor    flat damage removed from every hit
  //   defense  percentage removed after that, capped at 99
  //
  // See js/systems/mitigation.js for the order and for why there is no
  // damage floor.
  this.armor = (defenses && defenses.armor !== undefined)
    ? defenses.armor : (type.armor || 0);
  this.defense = (defenses && defenses.defense !== undefined)
    ? defenses.defense : (type.defense || 0);
}

Enemy.BASE_HEALTH = 4;
Enemy.BASE_SPEED_ULPS = 50; // u.l./s

// The roster. Adding a type is one row here and nothing else -- no code in the
// game asks what type an enemy is.
//
// Health is authored ABSOLUTELY (a fast is 2 HP, not "half a normal") because
// each figure is a balance decision in its own right. Speed is authored as a
// MULTIPLIER of BASE_SPEED_ULPS because the types are defined relative to the
// normal walker: a fast is "1.75x the walking speed", and it should stay that
// way if the walking speed is ever retuned.
//
// `color` is the body colour before hit-flash and slow-tint are blended in
// (see draw). `outlineWidth` gives a cue that survives the slow tint, which
// drags every body towards blue: a fast is thin-shelled, a slow is armoured.
// Both are cosmetic pixel values inside a draw(), which is allowed.
//
// SIZE (`sizeScale`) used to be forbidden per-type, because the hover ring's
// clearance from the frost ring was hand-checked against one fixed RADIUS_PX.
// v0.4.5 needed a swarm of specks and a boss, so both rings are now DERIVED
// from the instance's own radius (see radiusPx / draw): the clearance holds by
// construction at any size, which is what the old rule was really protecting.
// The three original types are left at scale 1, so their sprites, hit boxes
// and health bars are pixel-for-pixel what they always were.
//
// DEFENCES (`armor` flat, `defense` percent) go on the type; the constructor
// copies them onto the instance and js/systems/mitigation.js applies them to
// every damage source. `isCamo` marks an enemy no tower can target without
// detection -- see Targeting.sees.
Enemy.TYPES = {
  normal: {
    id: "normal",
    displayName: "Normal",
    health: Enemy.BASE_HEALTH,
    bounty: 3,
    speedMultiplier: 1,
    color: { r: 222, g: 79, b: 84 },
    outlineWidth: 2
  },
  fast: {
    id: "fast",
    displayName: "Fast",
    health: 2,
    bounty: 3,
    speedMultiplier: 1.75,          // 87.5 u.l./s -- crosses the map fast
    color: { r: 240, g: 199, b: 71 },
    outlineWidth: 1.5
  },
  slow: {
    id: "slow",
    displayName: "Slow",
    health: 7,
    bounty: 5,
    // 0.7 since 2026-08-19, at the owner's instruction ("change the slow enemy
    // speed to 0.7x"). It was 0.8. The type's whole job is to be the body the
    // board has time to work on, and the plodder that now walks it (see
    // `enemy-slow`, imported from slow.glb the same day) reads as heavier than
    // the tun it replaced -- 35 u.l./s is that body's own pace.
    speedMultiplier: 0.7,           // 35 u.l./s -- the slow, tanky one
    color: { r: 152, g: 96, b: 196 },
    outlineWidth: 3.5,
    // The tanky type is NOT the armored one. Armor lives on `armored` and
    // `brute` below, which exist for exactly that job; leaving this at zero
    // keeps every wave that already used a slow behaving as it did.
    armor: 0,
    defense: 0
  },

  // --- v0.4.5 -------------------------------------------------------------

  // The swarm. One hit point each and a lot of them: the counter to a tower
  // that kills one big thing per second, and the reason lane offsets exist
  // (thirty of these on one line is a caterpillar, not a swarm). Cheap per
  // body, so a full swarm wave is worth barely more than a handful of normals.
  swarm: {
    id: "swarm",
    displayName: "Swarm",
    health: 1,
    bounty: 1,
    speedMultiplier: 1.3,           // 65 u.l./s
    color: { r: 126, g: 214, b: 122 },
    outlineWidth: 1,
    sizeScale: 0.55,
    laneSpread: 1
  },

  // One type, six tiers. T0 is the terminal 1 HP body; every tier above it
  // has four times the health and breaks into four copies of the tier below.
  // T1 is the ordinary/base specimen shown in the index. A T5 is therefore
  // 1024 HP without inventing five more enemy definitions.
  //
  // OUT OF THE CAMPAIGN SINCE 2026-08-29, at the owner's instruction: "take out
  // the fractal slime, all of them, from easy mode". EASY_WAVES is the only
  // schedule, so `sandboxOnly` is the honest way to say it -- the flag means
  // "keep this out of the fixed campaign", and tests/run.js reads it in BOTH
  // directions, so a slime creeping back into a wave fails there rather than
  // passing unnoticed. Everything below is untouched: the ladder, the division,
  // the AoE resistance and the half bounty are all still live, still in the
  // index, and still sendable from the sandbox. The ten roots it used to carry
  // were replaced point for point -- see the block above wave 16 in js/game.js
  // for which body took which.
  fractal_slime: {
    id: "fractal_slime",
    displayName: "Fractal Slime",
    description: "A dividing slime whose tier determines both its health and what it leaves behind.",
    sandboxOnly: true,
    health: 4,                       // T1, the default/base specimen
    bounty: 2,                       // half its old bounty at base T1
    bountyStep: 0.5,                 // lets terminal T0 pay the exact half: $0.50
    aoeDamageReduction: 0.5,         // Warbringer AoE and Sniper B5 deal half
    speedMultiplier: 0.8,
    color: { r: 83, g: 224, b: 154 },
    outlineWidth: 2.5,
    sizeScale: 1,
    laneSpread: 0.8,
    fractal: {
      minTier: 0,
      maxTier: 5,
      defaultTier: 1,
      tierZeroHealth: 1,
      healthMultiplier: 4,
      splitCount: 4,
      minSizeScale: 0.65,
      sizeStep: 0.35,
      splitSpreadBaseUl: 18,
      splitSpreadPerTierUl: 8,
      spawnStunMinSeconds: 0.5,
      spawnStunMaxSeconds: 1
    }
  },

  // Normal health, 20% defense. Percentage mitigation, so it scales with the
  // hit that lands on it: the gunner's 1 becomes 0.8, the Longshot's 10
  // becomes 8. It taxes everything evenly and blocks nothing outright.
  armored: {
    id: "armored",
    displayName: "Armored",
    health: 4,
    bounty: 4,
    speedMultiplier: 0.95,
    color: { r: 132, g: 170, b: 200 },
    outlineWidth: 3,
    sizeScale: 1.05,
    defense: 20
  },

  // The big slow one: a lot of health behind 5 FLAT armor. Flat armor has no
  // damage floor by design (js/systems/mitigation.js), so a gunner's 1 damage
  // and the beam's 1-ten-times-a-second do literally nothing to it. That is
  // the counter working as specified, not a bug -- a brute wave has to be
  // answered with the Smasher's 12 or the Longshot's 10.
  brute: {
    id: "brute",
    displayName: "Brute",
    health: 40,
    bounty: 40,
    speedMultiplier: 0.55,          // 27.5 u.l./s
    color: { r: 198, g: 116, b: 58 },
    outlineWidth: 4,
    sizeScale: 1.5,
    laneSpread: 0.35,
    armor: 5
  },

  // Colossus. The deliberately simple tank: no armor, shield, revive or
  // support effect, just 550 health moving slowly enough for the player to
  // focus it down. Its bounty is intentionally lower than its health; two
  // Shieldbearers in wave 29 replace the missing $300 of scheduled income.
  colossus: {
    id: "colossus",
    displayName: "Colossus",
    description: "A pure health tank with no special ability. It is slow, enormous, and takes sustained damage to bring down.",
    health: 550,
    bounty: 250,
    speedMultiplier: 0.35,          // 17.5 u.l./s
    color: { r: 100, g: 112, b: 142 },
    outlineWidth: 6,
    sizeScale: 2.1,
    laneSpread: 0.1
  },

  // Camo. Same numbers as the types they shadow -- the whole difficulty is
  // that nothing can SEE them. Only the Longshot's A1 and the beam's B1 grant
  // detection, so a board of gunners and smashers watches these walk past.
  camo_normal: {
    id: "camo_normal",
    displayName: "Camo Normal",
    health: 4,
    bounty: 4,
    speedMultiplier: 1,
    color: { r: 96, g: 140, b: 108 },
    outlineWidth: 2,
    isCamo: true
  },
  camo_fast: {
    id: "camo_fast",
    displayName: "Camo Fast",
    health: 2,
    bounty: 3,
    speedMultiplier: 1.75,
    color: { r: 122, g: 152, b: 96 },
    outlineWidth: 1.5,
    isCamo: true
  },

  // SCHEDULED since 2026-07-30. It was sandbox-only ("until it is deliberately
  // scheduled into a campaign wave") and this is that deliberate scheduling:
  // wave 24 is a pure Wisp wave, and they ride along in 31, 34, 35 and the
  // Tyrant's roar. `sandboxOnly` is GONE rather than set to false, because the
  // flag means "keep this out of the fixed campaign" and the tests read it as
  // exactly that -- a false one would be a claim nobody needs to make.
  //
  // The type itself is untouched: 6 HP, 1.2x, and no ground-only tower can
  // target it at all (Targeting.sees fails closed on flight). The waves carry
  // `health` overrides, the way every other scaled type does.
  flying: {
    id: "flying",
    displayName: "Aether Wisp",
    health: 6,
    bounty: 6,
    speedMultiplier: 1.2,
    color: { r: 108, g: 190, b: 246 },
    outlineWidth: 2,
    sizeScale: 0.85,
    laneSpread: 0.8,
    isFlying: true
  },

  // The one that hits BACK. Every other enemy walks past your towers; this
  // one stops, turns to face what it is about to hit, strikes, and turns
  // back before it resumes (2026-08-14, at the owner's instruction: "when an
  // enemy attacks -- like the angry -- he should stop, turn toward the
  // attacked tower, attack, turn back, walk back"). See `facesTarget` below
  // and Enemy.prototype.beginAttackPosture.
  //
  // The behaviour is DATA, not a branch on the type id. `attack` is read by
  // Enemy.prototype.attackTowers, which asks "does this enemy have an attack"
  // (and, for the posture, "does this SPEC carry facesTarget") and never "is
  // this enemy angry" -- so the rule in this file's header ("no type has
  // behaviour of its own, so nothing branches on which one an enemy is")
  // still holds. A second attacking type, or a second attack on this one, is
  // one more row/flag here, never a new branch in attackTowers.
  //
  // Tuned to be a threat to POSITION, not a race: 20 damage every 2.5 s at
  // 47.5 u.l. reach means a gunner (60 HP) standing in its path dies in three
  // swings, but only if it is left standing there. It cannot reach a tower
  // built at the far side of a loop. The posture's own worst-case stopped
  // time (a full turn out, the strike, a full turn back) is 1.6 s against
  // this 2.5 s interval -- see Enemy.assertAttackPostureBudget, which is
  // what actually enforces that this stays true.
  angry: {
    id: "angry",
    displayName: "Angry",
    health: 14,
    bounty: 15,
    speedMultiplier: 0.7,           // 35 u.l./s -- it dawdles where it can hit
    color: { r: 232, g: 108, b: 62 },
    outlineWidth: 3.5,
    sizeScale: 1.25,
    laneSpread: 0.5,
    attack: {
      damage: 20,
      reachUl: 47.5,                // a little past a gunner's own footprint
      intervalSeconds: 2.5,
      facesTarget: true             // stop, turn, strike, turn back -- see above
    }
  },

  // The early midboss: one enemy, 250 HP behind 10% defense, walking at under
  // half a normal's pace so there is time to bring it down. It is a CHECK, not
  // a filler wave -- 250 remaining health against a 100 HP base means letting
  // it through ends the run, so wave 11 asks whether the board has been built.
  //
  // (Wave 11 is its only appearance, and one body walks in. The wave-11 row in
  // EASY_WAVES overrides the 250 UPWARDS, so the figures below are the type's
  // floor rather than what arrives -- read the override off that row, not from
  // here. Neither the body count per difficulty nor the override value is
  // repeated in this paragraph any more: the first died when the Normal and
  // Hard derivations were deleted on 2026-08-12 and EASY_WAVES became the only
  // schedule, and the second is a schedule number that moves independently of
  // this type.)
  midboss: {
    id: "midboss",
    displayName: "Midboss",
    health: 250,
    bounty: 250,
    speedMultiplier: 0.45,          // 22.5 u.l./s
    color: { r: 214, g: 74, b: 138 },
    outlineWidth: 5,
    sizeScale: 1.8,
    laneSpread: 0,                  // dead centre; it fills the road anyway
    defense: 10,
    // Puts a named bar across the top of the screen while it is alive. A FLAG
    // on the type, not a check for `id === "midboss"`, so the wave-35 boss
    // gets the same treatment by adding one line to its row.
    showHealthBanner: true
  },

  // --- v0.4.7: the three that arrive AFTER the midboss --------------------
  //
  // All three are gated behind wave 11 on purpose. Each one asks a question
  // the first ten waves have no vocabulary for, and each is a little stronger
  // per body than the type it stands beside -- they are the second half of the
  // campaign's roster, not more of the first.

  // Bulwark. Twice its own health again in shield, and when that shield goes
  // it stops being the slow one and becomes the fastest thing on the road.
  //
  // The design is a TEMPO trap rather than a wall: overkilling the shield with
  // a big slow weapon is fine, but a board tuned to grind it down at range
  // suddenly has a 90 u.l./s runner on its hands with the same health left as
  // a slow. The counter is to have the damage ready when the shield pops, not
  // to have more of it.
  shielded: {
    id: "shielded",
    displayName: "Bulwark",
    health: 12,
    bounty: 20,
    speedMultiplier: 0.9,           // 45 u.l./s while shielded
    color: { r: 118, g: 196, b: 214 },
    outlineWidth: 4,
    sizeScale: 1.15,
    laneSpread: 0.6,
    shield: {
      ratio: 2,                     // shield = 2x its own health, whatever that is
      onBreak: { speedMultiplier: 2 }   // 90 u.l./s -- past the Fast type's 87.5
    }
  },

  // Revenant. Killing it once does not finish it: it comes back to full health
  // and never takes another step.
  //
  // Rooting it is what keeps the mechanic honest. A second walk at the base
  // would just be "16 HP that is really 32"; standing still turns it into a
  // toll on the board's ATTENTION -- a body parked in a tower's circle that
  // keeps soaking shots that would otherwise be spent on the wave behind it.
  revenant: {
    id: "revenant",
    displayName: "Revenant",
    health: 16,
    bounty: 20,
    speedMultiplier: 0.85,          // 42.5 u.l./s
    color: { r: 206, g: 214, b: 176 },
    outlineWidth: 3,
    sizeScale: 1.2,
    laneSpread: 0.55,
    revive: { times: 1, healFraction: 1, roots: true }
  },

  // Hive. 150 HP, walking at two fifths of a normal pace, seeding five normals
  // every seven seconds.
  //
  // THE BROOD IS WHERE THE COST IS, not the Hive. Each hatchling is an ordinary
  // normal that carries a SHIELD EQUAL TO ITS OWN LIFE and PAYS NOTHING -- so
  // every seven seconds the road gains 40 points of effective health that the
  // player has to remove and is not paid a penny for. Killing the Hive is
  // ordinary work that pays ordinarily; leaving it alive is the expense.
  //
  // Those two properties are on the SPAWN, not on the `normal` row, because
  // they are facts about how these particular bodies were born. Putting them
  // on the type would have shielded every normal in the campaign. The Enemy
  // constructor takes them as per-spawn overrides -- see its `overrides`
  // argument.
  //
  // `noBounty` is enforced in Enemy.takeDamage's return value, the one door
  // every damage source already comes through, so a hatchling also feeds the
  // beam tower no lifesteal and no charges.
  hive: {
    id: "hive",
    displayName: "Hive",
    health: 150,
    bounty: 175,
    speedMultiplier: 0.4,           // 20 u.l./s -- ~93 s to cross the reference route
    color: { r: 92, g: 168, b: 150 },
    outlineWidth: 5,
    sizeScale: 1.6,
    laneSpread: 0.2,
    spawns: {
      count: 5,
      type: "normal",
      intervalSeconds: 7,
      shieldRatio: 1,               // each hatchling wears its own life again in shield
      noBounty: true                // and none of them pay
    }
  },

  // --- THE BOSS. Wave 35, arriving in the middle of it. ---------------------
  //
  // 5000 HP, the slowest thing in the game, and it fights in DELIBERATE,
  // TELEGRAPHED BEATS rather than on a fast tick. Each attack begins by
  // stopping it dead for a second or so -- the seconds it spends aiming are
  // seconds it is not advancing, which is what makes a heavy attack fair and
  // what makes the fight readable.
  //
  // It opens with ONE attack and its roar unlocks a SECOND into the pool,
  // after which it alternates between them.
  //
  //   AIMED SHOT   it stops, picks the tower with the HIGHEST DPS on the whole
  //                board -- not the nearest -- and hits it for 45 and a 2 s
  //                stun. Going for the best tower rather than the closest is
  //                the entire character of the move: it is answered by having
  //                depth, not by having a bodyguard.
  //
  //                NO RANGE LIMIT since 2026-07-30, at the owner's request
  //                ("the long range attack shouldn't have range limit"). It
  //                used to reach 220 u.l., which on the longer routes meant a
  //                board built well ahead of it was simply out of the fight --
  //                the boss walked half the map silent and the move that gives
  //                it its character never fired. `reachUl` is omitted rather
  //                than set to a big number: attackCandidates reads a missing
  //                reach as the whole map, the same way a support pulse does.
  //   LEAP         (after the roar) it stops, JUMPS 90 u.l. up the road, and
  //                lands with a shockwave that hits every tower within 120 u.l.
  //                for 80 and a 3 s stun. The jump is the threat -- it buys
  //                back the ground the wind-up cost it and then some, and it
  //                carries the fight into a cluster that was safe a moment ago.
  //                It is the HEAVIER of the two moves; see the note on the
  //                phase block for why every figure in it went up together.
  //
  // At half health it ROARS -- see `phases`. Everything the roar does is data
  // in that block and nothing about it is special-cased anywhere: a 1000 point
  // shield out of nowhere, a third again its walking speed, a faster rhythm,
  // the leap unlocked, and a crowd called in from the roster -- a running mob
  // with a support court behind it.
  //
  // DISPLAY NAME: the owner has not named it. "Tyrant" is a placeholder and
  // changing it is one line here -- nothing derives from it but the label on
  // the health banner and the index card.
  boss: {
    id: "boss",
    displayName: "Tyrant",
    // 5000 since 2026-07-30, at the owner's instruction ("give the final boss
    // 5k hp instead"). It was 2500. The roar still fires at half, which is now
    // 2500.
    //
    // THE SHIELD'S SHARE OF THE FIGHT WENT UP, NOT DOWN, AND THIS COMMENT USED
    // TO ARGUE THE OPPOSITE. It read that a fixed 200 point shield against a
    // doubled body made the phase "a smaller fraction of the fight than it
    // used to be, deliberately". The 2026-08-01 retune took the shield to 1000
    // and reversed that intent: it was 200/2500 = 8% at the start, the old
    // comment described 200/5000 = 4%, and it is 1000/5000 = 20% today -- two
    // and a half times the ORIGINAL share, five times what the comment claimed.
    // The phase is now a bigger part of the fight than it has ever been. Do not
    // restore the old reading; it records an intent that was abandoned on
    // purpose. See `phases[0].shield` below, which is the live number.
    health: 5000,
    bounty: 3000,
    speedMultiplier: 0.3,           // 15 u.l./s -- the slowest thing in the game
    color: { r: 236, g: 92, b: 76 },
    outlineWidth: 6,
    sizeScale: 2.4,
    laneSpread: 0,                  // dead centre; it more than fills the road
    showHealthBanner: true,
    // No armor and no defense. Its 5000 is meant to be a wall you grind, not a
    // wall that also taxes you -- and a percentage on top of that much health
    // would quietly invalidate whole tower builds at the last moment.
    attacks: [{
      id: "aimed",
      windUpSeconds: 1.3,           // it stops, and you can see it coming
      // 12 s since 2026-08-01, at the owner's instruction ("make the tyrant
      // attack less often"). It was 8, and before that 3.5. Slowing the
      // RHYTHM is what buys the individual blows the room to be heavy: the
      // leap below hits nearly three times as hard as it used to, and a heavy
      // blow every twelve seconds is a fight you can play around where the
      // same blow every eight is just attrition.
      intervalSeconds: 12,
      // NO reachUl. A missing reach is the WHOLE MAP -- there is nowhere on
      // any route a tower can stand and be out of this. See the note above.
      target: "highestDps",         // your BEST tower, not your nearest
      targets: 1,
      damage: 45,                   // two of these kill a 60 HP gunner
      stunSeconds: 2,
      // IT FIRES FROM ITS EYES (2026-08-19, at the owner's instruction). All
      // four numbers are MEASURED off `enemy-boss` rather than chosen, so a
      // re-import at a different height moves them with it:
      //
      //   liftRadii 2.62   the sensor band sits at model z 0.871..0.942 of a
      //                    1.076 u body -- 69.2 px at this type's sizeScale of
      //                    2.4, against a radiusPx of 26.4
      //   spreadRadii 0.235  the outer two of the three `Tower_Threat_Sensor`
      //                    lenses are at source x +/-0.335, which is +/-6.2 px
      //                    once scaled
      //
      // ON THE SPEC AND NOT ON THE TYPE, so the leap that joins the pool at the
      // roar does not inherit them. See emitEyeBeam.
      eyeBeam: {
        liftRadii: 2.62,
        spreadRadii: 0.235,
        tint: "255,96,72",          // the Tyrant's own red, not a shot tint
        blastRadiusUl: 18
      }
    }],
    phases: [{
      atHealthFraction: 0.5,
      // 1000 since 2026-08-01, at the owner's instruction ("make the shield
      // 1000hp instead"). It was 200, which against a 5000 HP body was two
      // seconds of a finished board's fire -- the roar announced a wall and
      // then did not put one up. A fifth of its own health, conjured at the
      // halfway line, is a wall.
      shield: 1000,                 // flat, conjured -- not a ratio of anything
      speedMultiplier: 1.35,        // 20.25 u.l./s -- "a little faster"
      attackIntervalMultiplier: 0.75,  // every 9 s instead of every 12
      announceSuffix: " COMMITS ITS RESERVES",
      announceDetail: "1000 shield, faster, leaping — and forty more bodies spent, healers and hives among them",
      // The second attack, unlocked here. From now on the pool cycles.
      //
      // THE LEAP IS THE MENACE (2026-08-01, at the owner's instruction: "make
      // his second attack the jumping one more menacing"). Every figure in it
      // went up together, because half a leap is not frightening -- it has to
      // arrive somewhere it was not, and it has to matter when it lands:
      //
      //   distance 50 -> 90 u.l.   it clears its own wind-up and then some,
      //                            so it can jump INTO a cluster rather than
      //                            merely closing on one
      //   radius   90 -> 120 u.l.  a landing that catches a whole emplacement
      //   damage   30 -> 80        more than the aimed shot. The leap is now
      //                            the heavier of the two moves, which is the
      //                            right way round: the aimed shot picks the
      //                            best tower, the leap takes the whole corner
      //   stun      2 -> 3 s       three seconds of silence on everything it
      //                            reached is what the player is buying room
      //                            from when they spread out
      //   reach   150 -> 220 u.l.  it commits far more often, instead of
      //                            falling through to the aimed shot
      //
      // The wind-up grew with them (1.1 -> 1.5 s). That is the fairness half
      // of the same change and is not optional: a blow this size has to be
      // visible coming, and the seconds it spends crouching are seconds it is
      // not walking.
      addAttack: {
        id: "leap",
        windUpSeconds: 1.5,
        intervalSeconds: 12,
        reachUl: 220,               // how far away a tower may be to be worth leaping at
        damage: 80,
        stunSeconds: 3,
        leap: {
          distanceUl: 90,
          radiusUl: 120             // what the landing shockwave reaches
        }
      },
      summon: {
        speedMultiplier: 1.5,       // everything it calls in RUNS
        trailUl: 16,
        // Drawn from the roster the player has spent the campaign learning,
        // at wave-35 health. Same shape as a wave's groups on purpose.
        //
        // THE SECOND HALF OF THE CROWD IS A SUPPORT COURT (2026-08-01, at the
        // owner's instruction: "spawning hives shieldbearer and healers as
        // well as collosus"). The first five rows are the running mob the roar
        // has always called -- thirty bodies and 600 HP, cheap to kill and
        // meant to be killed. The four new rows are not:
        //
        //   Hive          keeps seeding shielded, unpaying brood for as long
        //                 as it lives, so the crowd does not simply thin out
        //   Shieldbearer  stacks 20 points onto the ten strongest bodies every
        //                 ten seconds, and the strongest body on the road is
        //                 the boss -- so the roar's 1000 shield is not the
        //                 last shield the player has to chew through
        //   Healer        puts 60 points back into whatever the board has just
        //                 spent its shots on, three at a time
        //   Colossus      1100 HP of pure body between the board and everything
        //                 behind it
        //
        // That takes the roar from 600 HP across thirty bodies to 2780 across
        // forty, and changes its SHAPE: it used to be a rush you outlast, and
        // it is now a formation you have to take apart in the right order.
        // The support types are the ones to remove first, and the roar is the
        // one moment in the campaign that asks the player whether they learnt
        // that.
        groups: [
          { count: 8,  type: "fast",         health: 20 },
          { count: 10, type: "swarm",        health: 6 },
          { count: 6,  type: "normal",       health: 30 },
          { count: 4,  type: "angry",        health: 40 },
          { count: 2,  type: "flying",       health: 20 },
          { count: 2,  type: "hive",         health: 150 },
          { count: 3,  type: "shieldbearer", health: 60 },
          { count: 3,  type: "healer",       health: 200 },
          { count: 2,  type: "colossus",     health: 550 }
        ]
      }
    }]
  },

  // --- v0.4.9: the last four types -----------------------------------------
  //
  // ALL FOUR ARE SCHEDULED, and all four arrive late in the campaign. They
  // were added on 2026-07-30 for the index and the sandbox first -- the owner
  // asked to look at them before anything was built around them -- and were
  // fitted into the schedule afterwards.
  //
  // The wave numbers are NOT repeated here: read them off EASY_WAVES in
  // js/game.js, which is the only schedule. The list that used to sit here was
  // wrong twice over -- it credited a Normal and a Hard that no longer exist
  // (those derivations were deleted on 2026-08-12), and it gave each type a
  // single wave when the Shieldbearer alone appears in several.
  //
  // Nothing carries `sandboxOnly` any more. The flag still works and is still
  // the way to park a type in the index and the sandbox, but the test "every
  // enemy type is scheduled, and every scheduled type exists" (tests/run.js)
  // enforces BOTH directions: without the flag a type must appear in the
  // campaign, with it a type must not.
  //
  // Three of them carry a `support` block -- an ability on a timer that acts
  // on enemies rather than on towers. Two of those act on OTHERS (Shieldbearer,
  // Healer); the Vanguard's picks itself. See Enemy.prototype.supportAllies.

  // Shieldbearer. It fights nothing. Every ten seconds it hands 20 points of
  // shield to the ten strongest bodies on the road, and those grants STACK --
  // so a wave it walks in the middle of gets steadily harder to remove for as
  // long as it is alive, and the answer is to kill the support rather than to
  // out-damage what it is propping up.
  //
  // Since 2026-07-30 a shield pays NOTHING (see takeDamage), so every point it
  // hands out is work the player does for free. That is the whole cost of
  // leaving it alive, and it is the same shape as the Hive's: the enemy itself
  // is ordinary, what it PRODUCES is the expense.
  shieldbearer: {
    id: "shieldbearer",
    displayName: "Shieldbearer",
    health: 60,
    bounty: 75,
    speedMultiplier: 0.45,          // 22.5 u.l./s -- it dawdles at the back
    color: { r: 138, g: 186, b: 226 },
    outlineWidth: 4.5,
    sizeScale: 1.35,
    laneSpread: 0.3,
    // IT IS A BEACON, AND A BEACON HAS NO LEGS.
    //
    // The body became `shieldbearer.glb` on 2026-08-18, replacing the
    // four-legged Tender this repo built in Blender, and that is what puts a
    // `hover` block on this row. It is the Healer's argument applied to a
    // second body and not a new one: a cycle is driven by DISTANCE for a body
    // with a foot on the road, and a legless one left on the tarmac would
    // skate -- `tools/check-gait-slip.js` measures a group planted in every
    // frame while the body advances as a full cycle of slip. `hover` hands the
    // animation a clock instead, and both boards read `liftRadii` through
    // Enemy.prototype.visualBodyLift.
    //
    // IT IS NOT `isFlying`, and the distinction matters as much here as it does
    // on the Healer: this is a height, not a targeting fact. Every ground tower
    // can still shoot a Shieldbearer, and killing it first is still the answer
    // to the waves it walks in.
    //
    // 0.55 radii is 8.2 px of clearance -- a plinth floating just clear of the
    // road, not the Wisp's 3.45 radii of air. The number is also what keeps the
    // type's silhouette the height it was: the beacon is imported at 1.40 u so
    // that 1.40 * 31.8032 * 1.35 + 8.2 = 68.3 px, against the 68.4 px the
    // Tender stood. 0.18 Hz turns its broadcast once every five and a half
    // seconds, slower than the Healer's drift, because this one dawdles.
    hover: { liftRadii: 0.55, animHz: 0.18 },
    support: {
      intervalSeconds: 10,
      targets: 10,
      pick: "strongest",            // most life still standing, shield included
      shield: 20,
      stacks: true,
      // A CORD PER BODY SHIELDED, AND IT IS A DIFFERENT MARK FROM THE HEALER'S.
      //
      // At the owner's instruction (2026-08-18): "draw a clear curve towards
      // each enemy he shields", with "an animation of the shields going out to
      // that enemy". Until now this type had only the expanding ring, which
      // says something happened to a lot of bodies at once and does not say
      // WHICH -- and ten grants at a time is exactly the case where that
      // question is worth answering, because the answer is the argument for
      // shooting the beacon rather than the wall it just built.
      //
      // `arc` is what separates it from the Healer's straight cord: a bowed
      // curve reads as something LOBBED rather than aimed, which is the right
      // grammar for a plate of shield being handed over, and ten of them
      // leaving one body at once stay legible because the bows separate where
      // ten straight lines would overlap into a star. Measured as a fraction
      // of the span, so a close target gets a small bow and a distant one a
      // big one.
      //
      // `chips` are the shields themselves, travelling. They are the half the
      // owner asked for by name, and they are the half that says the direction:
      // a curve alone is ambiguous about which end is giving.
      //
      // 1.8 s against a ten-second interval, so the board is clear of them for
      // four fifths of the cycle. Longer than the Healer's 1.4 because these
      // travel a bow rather than a straight line.
      tether: { seconds: 1.8, color: { r: 150, g: 214, b: 255 },
                arc: 0.34, chips: 3 }
    }
  },

  // Healer. High health, slow, and every eight seconds it puts a four-second
  // regeneration of 15 HP/s on the three enemies MISSING the most health --
  // 60 points a piece, to whoever your board has just spent its shots on.
  //
  // Healed HP is not reported twice to lifesteal, charges or damage counters.
  // The fixed kill bounty never changes when a heal lands. `healedHealth` on
  // the instance is where the damage-led half is enforced.
  //
  // It picks the most WOUNDED rather than the strongest on purpose. That is
  // what makes it the exact opposite of the Shieldbearer: one makes the front
  // of a wave harder to start on, the other makes it harder to finish.
  healer: {
    id: "healer",
    displayName: "Healer",
    health: 200,
    bounty: 250,
    speedMultiplier: 0.4,           // 20 u.l./s -- the Hive's pace
    color: { r: 126, g: 210, b: 158 },
    outlineWidth: 4.5,
    sizeScale: 1.45,
    laneSpread: 0.25,
    // IT FLIES (2026-08-26, at the owner's instruction: "make the healer a
    // flying unit"), AND THAT IS A TARGETING FACT BEFORE IT IS A HEIGHT.
    //
    // This row carried a `hover` block and an explicit argument for why it was
    // NOT `isFlying`: hover is only a picture, every ground tower could still
    // shoot a Healer, and killing it first was the whole lesson of wave 32.
    // That ruling is REVERSED, not qualified. `isFlying` is read by
    // Targeting.sees and by RangeFilter, both of which fail closed, so the
    // Healer is now answerable only by a tower with air reach -- the Arcane
    // Sniper, which has it at base, and the Warbringer once its beam path buys
    // it. The lesson of wave 32 becomes the Aether Wisp's lesson applied to a
    // body that heals: bring air reach or watch it undo your damage.
    //
    // THE `hover` BLOCK IS DELETED RATHER THAN LEFT BESIDE IT. Every reader
    // takes the flying branch FIRST -- `visualBodyLift` here,
    // `bodyLift` and `clockRate` in gl-world.js -- so a surviving `hover` would
    // have been a declaration nothing reads, sitting next to a comment
    // explaining why the thing it declares is deliberately not the other thing.
    // Height now comes from `Enemy.FLIGHT_LIFT_RADII` and the drift rate from
    // the flier's own `HOVER_HZ`, which is the same pair the Wisp uses.
    //
    // `tools/check-gait-slip.js` needs no edit: `enemy-healer` is on its
    // `HOVERS` table already, and that table is about "this body's frames are
    // clock-driven", which is as true of a flier as it was of a hoverer.
    //
    // (The deleted block was `{ liftRadii: 1.25, animHz: 0.32 }` -- 20 px of
    // clearance under a 16 px radius, "a thing drifting a foot above the
    // tarmac". It now rides the Wisp's 3.45 radii, which is air.)
    isFlying: true,
    support: {
      intervalSeconds: 8,
      targets: 3,
      pick: "mostMissingHealth",
      heal: { perSecond: 15, seconds: 4 },
      // WHAT A PULSE LOOKS LIKE, and it is authored HERE because the answer to
      // "who is putting that health back" has to be one decision that both
      // boards read, not a colour typed into each renderer.
      //
      // A TETHER PER TARGET, NOT A RING. The Shieldbearer's expanding ring says
      // "something happened to a lot of bodies at once", which is the right
      // shape for ten simultaneous grants from a body standing in the middle of
      // them. Three heals to the three most wounded is a different claim -- it
      // names WHICH three -- and a line from the healer to each one is the only
      // mark that can make it. That is also the mark that says which body to
      // shoot: follow the lines back.
      //
      // 1.4 s, against a heal that runs for 4. The tether is the DELIVERY and
      // the target's own green ring is the effect; drawing the line for the
      // whole four seconds would leave nine cords standing across the board on
      // a wave carrying three Healers, and the cue that names three bodies
      // stops naming anything once it is drawn most of the time.
      //
      // The colour is the model's own -- `healer.glb` is cyan from its
      // core to its tail tips -- and NOT the type's `color`, which stays the
      // green the codex swatch, the minimap dot and the kill burst have always
      // used. Those answer "which enemy is this"; a tether answers "this one is
      // doing that, now", and the two are not the same question. Sitting under
      // `support` rather than beside `color` is that distinction written down:
      // it belongs to the pulse, not to the body.
      tether: { seconds: 1.4, color: { r: 142, g: 232, b: 255 } }
    }
  },

  // THE FAST BOSS. 750 HP, and the opposite threat to the Tyrant: that one is
  // a wall you grind while it silences your board, this one is a body you have
  // a fixed and very short number of seconds to remove.
  //
  // It SPRINTS the opening stretch. For the first 400 u.l. -- about a fifth of
  // the reference route -- it runs at twice its own speed, 175 u.l./s, which is
  // the fastest anything in the game moves. Past that it settles to 87.5, the
  // Fast type's pace. So the ground where a board is thinnest is the ground it
  // crosses quickest, and everything after that is an ordinary fast enemy with
  // a boss's health.
  //
  // Every seven seconds it takes 100 points of shield, and those do NOT stack:
  // the pulse refreshes the pool back up to 100, it never builds a wall out of
  // them. What that costs the player is TEMPO -- a board that cannot remove
  // 100 shield plus a slice of health inside seven seconds never gets to touch
  // the body underneath, however long it fires. Burst answers it; a trickle
  // does not.
  //
  // DISPLAY NAME: a placeholder, like the Tyrant's. Nothing derives from the
  // string but the banner label and the index card.
  boss_fast: {
    id: "boss_fast",
    displayName: "Vanguard",
    health: 750,
    bounty: 1100,
    speedMultiplier: 1.75,          // 87.5 u.l./s once the sprint is spent
    color: { r: 250, g: 176, b: 72 },
    outlineWidth: 5,
    sizeScale: 1.9,
    laneSpread: 0.15,
    showHealthBanner: true,
    // The opening sprint. Measured on PROGRESS ALONG THE ROAD, not on a timer,
    // so it is the same stretch of map every time however slowed it gets --
    // see currentSpeedUlps.
    sprint: {
      untilUl: 400,
      speedMultiplier: 2            // 175 u.l./s for the first 400 u.l.
    },
    support: {
      intervalSeconds: 7,
      pick: "self",
      shield: 100,
      stacks: false                 // refreshed back to 100, never piled up
    }
  },

  // Camo Heavy. The camo types above shadow a normal and a fast; this one
  // shadows nothing -- it is the first camo body with real defences, 5 FLAT
  // armor behind 20% defense.
  //
  // The owner's words were "20% armor and 5 blindage". In this codebase
  // `defense` is the percentage and `armor` is the flat subtraction (see
  // js/systems/mitigation.js), so the percentage is written as defense: 20 and
  // the flat plating as armor: 5.
  //
  // That combination is deliberately nasty and deliberately answerable: armor
  // has no damage floor, so the cheap detection (the Soldier's B3) buys you
  // sight of something a Soldier still cannot hurt. Seeing it and killing it
  // are two separate purchases.
  camo_heavy: {
    id: "camo_heavy",
    displayName: "Camo Heavy",
    health: 20,
    bounty: 30,
    speedMultiplier: 0.65,          // 32.5 u.l./s -- heavy, so it plods
    color: { r: 104, g: 132, b: 118 },
    outlineWidth: 4,
    sizeScale: 1.4,
    laneSpread: 0.35,
    isCamo: true,
    armor: 5,
    defense: 20
  }
};

Enemy.DEFAULT_TYPE = "normal";

// Look a type up, LOUDLY. An unknown id can only come from a typo in code, and
// silently handing back a normal enemy would hide it behind a balance mystery.
Enemy.typeOf = function (typeId) {
  var id = typeId === undefined || typeId === null ? Enemy.DEFAULT_TYPE : typeId;
  var type = Enemy.TYPES[id];
  if (!type) throw new Error("unknown enemy type: " + id);
  return type;
};

// Validate and resolve the tier of a fractal spawn. Non-fractal types carry
// `null`, so passing a tier through a generic wave/spawn path changes nothing
// for the rest of the roster.
Enemy.fractalTierOf = function (typeOrId, tier) {
  var type = typeof typeOrId === "string" ? Enemy.typeOf(typeOrId) : typeOrId;
  if (!type.fractal) return null;

  var resolved = tier === undefined || tier === null
    ? type.fractal.defaultTier : tier;
  if (resolved !== Math.floor(resolved) ||
      resolved < type.fractal.minTier || resolved > type.fractal.maxTier) {
    throw new Error("invalid " + type.displayName + " tier: " + resolved);
  }
  return resolved;
};

// The health an enemy of this type spawns with, unless something overrides it.
// The override exists for the debug spawner and for ordinary waves that want a
// tougher version of a type; it changes health only, never speed. A fractal
// tier takes precedence because its health ladder is the mechanic, not an
// arbitrary override. Shared with the constructor so wave accounting cannot
// disagree with what actually spawns.
Enemy.healthOf = function (typeId, override, tier) {
  var type = Enemy.typeOf(typeId);
  if (type.fractal && tier !== undefined && tier !== null) {
    var resolvedTier = Enemy.fractalTierOf(type, tier);
    return type.fractal.tierZeroHealth *
      Math.pow(type.fractal.healthMultiplier, resolvedTier);
  }
  return override === undefined || override === null
    ? type.health
    : override;
};

// Cash for killing one body at the health it actually spawned with.
//
// Each roster row owns an authored bounty at its BASE health. That value
// prices the whole threat -- speed, defenses, shields, revives and abilities,
// not just raw HP. A wave health override then scales the value in step with
// the tougher body it creates. This keeps a 30 HP finale Normal worth more
// than a 4 HP opening Normal without making cash proportional to every point
// of damage during the fight. A fractal tier uses the same scaling against its
// exact tier-derived health. `bountyStep` can opt a type into a finer rounding
// unit; the Fractal Slime uses $0.50 so even its 1 HP T0 is exactly half price.
Enemy.bountyOf = function (typeId, healthOverride, tier) {
  var type = Enemy.typeOf(typeId);
  var health = Enemy.healthOf(typeId, healthOverride, tier);
  var raw = type.bounty * health / type.health;
  var step = type.bountyStep || 1;
  return Math.round(raw / step) * step;
};

// How big the body is drawn, and therefore how big it is to point at. In
// PIXELS, deliberately: an enemy is a sprite, not a thing that occupies space
// in the world -- nothing collides with it and no gameplay rule measures it, so
// it must stay the same size to the eye however long the map is.
// Contrast Tower.FOOTPRINT_RADIUS_UL, which IS a world distance because
// placement rules are derived from it.
Enemy.RADIUS_PX = 11;

// How far off the centreline an enemy may walk, in u.l.
//
// In U.L. AND NOT PIXELS, unlike RADIUS_PX above, and the difference matters:
// the offset moves the enemy in the WORLD, so every tower measures its range
// to the offset position. A pixel-fixed offset would not scale with
// UNIT_LENGTH, and tests/run.js's "changing UNIT_LENGTH" group -- same run,
// same kills and leaks at half the constant -- would stop holding.
//
// **7 since 2026-07-29, up from 4**, at the owner's request, alongside the
// laneOffsetFor rewrite above. Four was chosen to keep every sprite fully on
// the tarmac, and the result was a column that barely deviated from the
// centreline -- which, combined with the old evenly-spaced sequence, is what
// made a wave read as one object moving rather than as a crowd.
//
// 7 is a little under two thirds of the road's half-width (ROAD_WIDTH_UL / 2).
// Both are u.l., so that relationship holds at any UNIT_LENGTH.
//
// **Full-size enemies now extend past the edge of the road**, and that is the
// accepted cost rather than an oversight: ANY visible spread overhangs, and 4
// did too, just less. Small bodies -- the swarm, at the roster's smallest
// sizeScale -- stay on comfortably, which is where the scattering reads best
// anyway. If this ever needs to be undone, the real fix is a wider road, not a
// narrower spread.
//
// How far anything overhangs is deliberately not quoted, and it is not a fixed
// fact: the gameplay circle is per-type and pinned in px (Enemy.RADIUS_PX,
// radiusPx), while the road's width comes from u.l. through ul(). Retune
// UNIT_LENGTH and the road changes width while the circles do not, so the
// overhang is a property of the current UNIT_LENGTH rather than of this
// constant. Throughout, that circle is the gameplay/hit-test one -- what a
// renderer draws is a separate question from what the simulation measures.
//
// Per-type `laneSpread` still scales this: the midboss sits at 0, the brute at
// 0.35, a swarm takes the full width.
Enemy.LANE_SPREAD_UL = 7;

// How far apart, ALONG the road, a spawner's brood trails behind it. In u.l.
// like every other world distance, so it scales with UNIT_LENGTH.
//
// 12 puts a brood of five over 48 u.l., a bit over half a body-width between
// each. Judged by eye: at 5 the five overlapped into one blob, and much past
// 12 a brood stops reading as a litter and starts reading as a queue. It
// exists so a litter that shares a spawn instant AND a walking speed does not
// spend its whole life in a rank abreast -- see spawnMinions.
Enemy.BROOD_TRAIL_UL = 12;

// The lane sequence. DETERMINISTIC, and that is not a detail: Math.random()
// lives in js/effects.js and nowhere else in the simulation (see AGENTS.md),
// because a random gameplay value would make every pinned kill/leak/base-HP
// number in the suite a coin toss. The same run always produces the same walk.
//
// restartGame() resets it, so run N and run N+1 are identical.
Enemy.laneSequence = 0;

Enemy.resetLanes = function () { Enemy.laneSequence = 0; };

Enemy.nextLaneIndex = function () { return Enemy.laneSequence++; };

// Where the nth enemy walks across the road, in -1..1.
//
// **2026-07-29: this was a low-discrepancy sequence and it looked WRONG.** It
// used the fractional parts of multiples of the golden ratio, on the reasoning
// that consecutive spawns should land far apart and therefore look scattered.
// They do land far apart. That is the problem. The first twenty offsets it
// produced were
//
//   +0.24 -0.53 +0.71 -0.06 -0.82 +0.42 -0.35 +0.89 +0.12 -0.64 ...
//
// which is a near-perfect alternation with a regular amplitude staircase, and
// on screen it reads as a column of enemies weaving down the road in a sine
// wave. The owner's words: "they just look like a wave, not random at all,
// which is very unnatural."
//
// A low-discrepancy sequence is DESIGNED never to cluster, and clustering is
// most of what randomness looks like. Two enemies side by side and then a gap
// is what a crowd does; perfect spacing is what a machine does. Measured over
// 4000 spawns, the golden sequence put ZERO consecutive pairs within 0.12 of
// each other and flipped sides 76% of the time. That is the waveform.
//
// So this is a HASH now, not a sequence: index in, offset out, no state. Over
// the same 4000 spawns it flips sides 49% of the time -- a coin -- and 479
// consecutive pairs land close together. The MEAN amplitude is unchanged at
// 0.50, which is what keeps the balance figures comparable: enemies are spread
// across the road exactly as widely as before, they are simply no longer
// spread EVENLY.
//
// **Still perfectly deterministic**, so every pinned kill/leak/base-HP figure
// in the suite is as reproducible as it was.
//
// **The mixer is 32-bit integer arithmetic, on purpose.** `Math.imul`, `^` and
// `>>>` are all exactly specified on 32-bit integers, so this gives
// bit-identical results in every JS engine. Do not "simplify" it to something
// built on Math.sin: the spec lets engines approximate the transcendental
// functions differently, and the same run would then walk differently on
// different machines. (`Math.imul` is the one non-ES5 thing in the codebase.
// It is used because a plain `*` on two 32-bit values overflows a double's
// exact range; it has been in every browser since 2013 and needs no
// transpilation, so the no-toolchain rule is intact.)
Enemy.laneOffsetFor = function (n) {
  var h = (n + 1) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;   // -1 .. 1
};

// Extra slack on the hover target only. What the pointer is tested against is
// the GAMEPLAY circle -- Enemy.radiusPx(), in board px, the space `pos` is in
// and the space the camera then scales to the screen. It is per-type and
// per-instance (sizeScale, fractalSizeScale), so there is no one body size to
// quote; and it is not the drawn body, which is whatever the active renderer
// puts on screen and is its own question entirely. A small target that moves
// is a chore to point at exactly, hence the pad. It costs nothing: hovering is
// read-only, so a slightly generous target can never cause a misclick.
//
// No width and no crossing speed are quoted here, on purpose. Both are
// per-type -- read the size off radiusPx and the speed off BASE_SPEED_ULPS --
// and the speed is converted from u.l. by ul() at the moment of use, so any
// px/s figure written down here is one UNIT_LENGTH retune away from being
// false. The pair that used to sit in this paragraph read as constants
// measured off the roster, and were neither.
//
// The exact value clears the frost ring. The hover ring is drawn at
// radiusPx() + this; the frost and camo rings sit at radiusPx() + 4 -- so the
// two are 5 px apart at EVERY sprite size, which is what stops a slowed,
// hovered enemy reading as a smear rather than as two separate states. Both
// used to be raw constants (20 and 15) that only cleared each other at the one
// body size the roster had. If you move either ring, keep them apart.
Enemy.HOVER_PAD_PX = 9;

// How big THIS enemy is drawn. Everything that needs the sprite's extent --
// the body, the frost ring, the hover ring, the hit test, the health bar --
// asks this one function, so a per-type size cannot make any two of them
// disagree. At the default scale of 1 it returns exactly Enemy.RADIUS_PX.
Enemy.prototype.radiusPx = function () {
  return Enemy.RADIUS_PX * (this.type.sizeScale || 1) * this.fractalSizeScale;
};

// Where this enemy stands, given how far along the road it has walked: the
// point on the centreline, pushed sideways by its own lane offset along the
// road's normal. The ONE place progress becomes a position, so the walk, the
// spawn and knockBack cannot each compute it differently.
Enemy.prototype.positionAt = function (progress) {
  var centre = this.path.pointAt(progress);
  if (!this.laneOffsetUl) return centre;

  // Normal = tangent turned 90 degrees. ul() converts the offset once, here,
  // at the point of use -- the same edge-of-the-system rule every other
  // distance follows.
  var t = this.path.tangentAt(progress);
  // THE SPREAD IS A FRACTION OF THE ROAD, NOT A FIXED DISTANCE.
  //
  // `laneOffsetUl` is authored against the road at its nominal width, and on a
  // route that narrows to a gate it would put half the column in the ditch
  // either side -- the column would not read as squeezing through the gap, it
  // would read as walking straight past it. Scaling by the road's own width
  // here is what makes a chokepoint DO something visible: bodies fall into
  // single file through it and spread out again in the plaza beyond, and the
  // lane each one holds is still the lane its deterministic sequence gave it.
  //
  // 1 on every route that declares no width profile (js/path.js), so this is
  // the same offset it has always been on six of the seven boards.
  var offset = ul(this.laneOffsetUl) * this.path.widthScaleAt(progress);
  return { x: centre.x - t.y * offset, y: centre.y + t.x * offset };
};

// Put pos back in step with progress. Anything that moves an enemy by writing
// `progress` directly (knockBack, the sandbox's spacing, the tests) calls this
// rather than path.pointAt, or the enemy would snap onto the centreline and
// lose its lane.
Enemy.prototype.refreshPos = function () {
  this.pos = this.positionAt(this.progress);
};

// Which way this body is FACING, as a unit {x, y} -- distinct from where it
// is (positionAt) and derived, never stored, for the same reason the road
// itself has no stored heading: read fresh, it cannot go stale.
//
// Three cases, in order:
//
//   no posture, a path       -> EXACTLY this.path.tangentAt(this.progress).
//                                Not equivalent, identical: the same call,
//                                so a caller that switches to this method is
//                                a provable no-op whenever nothing is
//                                posturing, and js/path.js's corner-snap
//                                (see GamePath.prototype.tangentAt) reaches
//                                every reader through this one seam.
//   an active attackPosture  -> the slewed facing tickAttackPosture is
//                                maintaining, which is what makes a stop,
//                                turn, strike and turn-back visible at all.
//   no path                  -> null, the same fallback js/gl/gl-world.js and
//                                js/gl/enemy-wreck.js already use at their
//                                own `e.path && e.path.tangentAt` guards.
//
// Nothing here goes through ul(): a facing is a unit vector, dimensionless,
// not a distance, and the turn RATE this composes with is degrees per
// second -- an angle, never converted. See Enemy.ATTACK_TURN_RADIANS_PER_SECOND.
Enemy.prototype.headingVec = function () {
  if (this.attackPosture) return this.attackPosture.facing;
  if (!this.path || !this.path.tangentAt) return null;
  return this.path.tangentAt(this.progress);
};

// How fast this enemy is walking RIGHT NOW: what its type walks at, times the
// timed slow on it, times whatever the run has permanently done to it (a
// broken shield doubles it, a revive stops it dead).
//
// The one place those three are combined. Movement reads it, and so does the
// "fastest" targeting mode -- which used to multiply the first two inline and
// would therefore have called a rooted Revenant a live target moving at full
// speed.
Enemy.prototype.currentSpeedUlps = function () {
  if (this.rooted) return 0;
  // Stunned by something the player did (the Warbringer's earthquake). Read
  // before the slow rather than folded into it, because it is not a fraction
  // of speed -- it is all of it.
  if (this.stunTimer > 0) return 0;
  // Winding up an attack means STANDING STILL. That is what makes a heavy
  // telegraphed attack fair -- the seconds it spends aiming are seconds it is
  // not advancing, so the trade is legible from the board.
  if (this.windUpTimer > 0) return 0;
  // Stopped to face, strike and turn back -- see attackPosture. Every phase
  // of it, including the two turns, holds speed at zero; only phase 5 (the
  // posture clearing to null) gives it back.
  if (this.attackPosture) return 0;

  var speed = this.speedUlps * this.slowMultiplier * this.speedScale;

  // A FARM'S FIELD, and it is a THIRD channel rather than a slow. `applySlow`
  // takes the strongest and refreshes it, which is right for a timed debuff a
  // tower applies; a B4/B5 Farm projects a standing field instead, and the
  // brief asks for it to stack ADDITIVELY with the other kinds. Routing it
  // through applySlow would have let a Warbringer's 65% swallow it entirely.
  // Multiplied here so a body under both is slowed by both.
  if (typeof Farms !== "undefined" && this.pos) {
    var field = Farms.slowAt(this.pos.x, this.pos.y);
    if (field > 0) speed *= 1 - field;
  }

  // A `sprint` block: faster over the OPENING STRETCH of the road, and then
  // never again. Keyed on progress rather than on a timer, deliberately -- it
  // is a fact about which part of the MAP the enemy is on, so a slowed sprinter
  // still gets its full 400 u.l. of running rather than having the boost tick
  // away while it crawls. `progress` is a world distance and `untilUl` is a
  // u.l. one, so the comparison goes through ul() like every other.
  var sprint = this.type.sprint;
  if (sprint && this.progress < ul(sprint.untilUl)) {
    speed *= sprint.speedMultiplier;
  }

  // AND WHAT THE ROAD ITSELF DOES TO A BODY WALKING IT.
  //
  // The same shape of fact as `sprint` directly above -- keyed on where on the
  // map the body is, not on a clock -- and deliberately the other side of the
  // same seam: `sprint` is a property of the TYPE ("this thing charges the
  // first stretch"), pace is a property of the ROUTE ("nothing crosses that
  // basin quickly"). A board can therefore hurry bodies down a final run at
  // the base without every enemy in the game carrying a note about it.
  //
  // Multiplied, not substituted: a slow applied by a tower still halves the
  // speed of something running a fast stretch. 1 on every route that declares
  // no pace profile.
  return speed * this.path.paceScaleAt(this.progress);
};

// Is this enemy still in the opening sprint? Its own function because the draw
// wants to know (a sprinting body gets a trail) and so do the tests, and
// neither should have to repeat the comparison above.
Enemy.prototype.isSprinting = function () {
  var sprint = this.type.sprint;
  return !!sprint && this.progress < ul(sprint.untilUl);
};

// Everything still standing between this enemy and death: shield first, then
// health. Shields are HEALTH for every purpose that counts one -- targeting,
// claiming, the bar over its head and what the player is paid -- so there is a
// single function saying so rather than a `+ shield` sprinkled at each site.
Enemy.prototype.remainingHealth = function () {
  return this.shield + this.health;
};

Enemy.prototype.maxRemainingHealth = function () {
  return this.shieldMax + this.maxHealth;
};

// What killing this enemy is worth. Paid once, on the final death -- never per
// hit -- so a shield, a heal and a Revenant's first life cannot print money.
// Those mechanics are already priced into the type's authored base bounty.
// A Hive brood keeps its per-spawn `noBounty` override and therefore pays $0.
Enemy.prototype.bounty = function () {
  return this.noBounty ? 0 : Enemy.bountyOf(this.typeId, this.maxHealth);
};

Enemy.prototype.update = function (dt) {
  // Weakening stacks age here, on this enemy's own clock. See
  // js/systems/damage-amp.js for why each stack keeps its own five seconds
  // rather than sharing one refreshed window. Guarded by typeof so an enemy
  // stepped in a fixture that does not load the module behaves as it always
  // did -- with no amplification at all.
  if (typeof DamageAmp !== "undefined") DamageAmp.tick(this, dt);

  if (this.stunTimer > 0) {
    this.stunTimer -= dt;
    if (this.stunTimer <= 0) this.stunTimer = 0;
  }

  if (this.slowTimer > 0) {
    this.slowTimer -= dt;
    if (this.slowTimer <= 0) {
      this.slowTimer = 0;
      this.slowMultiplier = 1;
    }
  }

  // Regeneration put on by a Healer. Ticked HERE rather than by the Healer
  // itself, which is what makes it survive the Healer's death: the heal is a
  // four-second effect on this body, not a beam somebody has to keep holding.
  if (this.healTimer > 0) {
    this.healTimer -= dt;
    // The last tick is partial, so a 4.0 s heal at 15 HP/s restores exactly 60
    // however the step boundaries fall.
    var span = this.healTimer < 0 ? dt + this.healTimer : dt;
    this.heal(this.healPerSecond * span);
    if (this.healTimer <= 0) {
      this.healTimer = 0;
      this.healPerSecond = 0;
    }
  }

  this.progress += ul(this.currentSpeedUlps()) * dt;
  this.pos = this.positionAt(this.progress);

  if (this.flash > 0) {
    this.flash = Math.max(0, this.flash - dt * 5);
  }
  if (this.attackFlash > 0) {
    // Same rate a facesTarget spec's strike phase is timed against -- see
    // Enemy.ATTACK_STRIKE_SECONDS. One constant, not two numbers that happen
    // to agree today.
    this.attackFlash = Math.max(0, this.attackFlash - dt * Enemy.ATTACK_FLASH_DECAY_PER_SECOND);
  }
  if (this.shieldFlash > 0) {
    this.shieldFlash = Math.max(0, this.shieldFlash - dt * 1.5);
  }
  if (this.reviveFlash > 0) {
    this.reviveFlash = Math.max(0, this.reviveFlash - dt * 1.2);
  }
  if (this.spawnFlash > 0) {
    this.spawnFlash = Math.max(0, this.spawnFlash - dt * 2);
  }
  // 0.6 -- the SLOWEST decay in this block, deliberately slower than the
  // phaseFlash roar at 0.7, and the reason is duty cycle rather than taste.
  //
  // TWO READERS, and retuning for one means checking the other.
  //
  // The Fieldwright's signal mast holds raised while this stays above 0.1:
  // 1.5 s here, against 0.64 s at the old 1.4. A healer is on the road ~100 s
  // and pulses ~12 times, so the mast reads for ~18% of that life instead of
  // ~7%. "Kill the support first" is meant to be learnable by watching, and a
  // player scanning a wave rather than a single body misses several 0.64 s
  // events in a row.
  //
  // The second reader is the support ring in this file's draw, which expands
  // to radius + 64 as this value falls. That ring is already specified "wide
  // and slow" so that ten simultaneous shields read as one body's doing, and a
  // slower decay serves the same intent -- but note it is on the 2D FALLBACK
  // only: game.js runs the whole per-actor 2D pass under `if (!world3D)`, so on
  // the WebGL board Enemy.prototype.draw is never called and that ring is not
  // on screen at all. The mast is this field's first reader there.
  if (this.supportFlash > 0) {
    this.supportFlash = Math.max(0, this.supportFlash - dt * 0.6);
  }
  if (this.healFlash > 0) {
    this.healFlash = Math.max(0, this.healFlash - dt * 2);
  }
  if (this.stunFlash > 0) {
    this.stunFlash = Math.max(0, this.stunFlash - dt * 1.5);
  }
  if (this.phaseFlash > 0) {
    this.phaseFlash = Math.max(0, this.phaseFlash - dt * 0.7);   // a long, slow roar
  }
  if (this.shockwaveFlash > 0) {
    this.shockwaveFlash = Math.max(0, this.shockwaveFlash - dt * 1.6);
  }
  // The tethers a support pulse threw, aged and swept. A target that died or
  // leaked mid-heal drops its cord immediately rather than fading it: the body
  // it was drawn to is gone from the board on the same step, and a line to
  // nothing is worse than no line.
  for (var li = this.supportLinks.length - 1; li >= 0; li--) {
    var link = this.supportLinks[li];
    link.life -= dt / link.span;
    if (link.life <= 0 || link.target.dead || link.target.leaked) {
      this.supportLinks.splice(li, 1);
    }
  }

  if (this.attackBeam) {
    this.attackBeam.life -= dt * 4;
    if (this.attackBeam.life <= 0) this.attackBeam = null;
  }

  if (this.progress >= this.path.length) {
    this.leaked = true;
  }
};

// Seed the road with this enemy's brood, if it is the kind that has one and
// its timer has come round. Returns the new enemies, or null.
//
// SEPARATE FROM update(dt), and returning the brood rather than pushing it
// anywhere, for the same reason attackTowers is separate: update() needs
// nothing but the path, and the enemy list belongs to the main loop. An enemy
// that reached into a global `enemies` array would spawn into the codex's
// parked sprites and into every test that only wanted something to walk.
Enemy.prototype.spawnMinions = function (dt) {
  // Anything a PHASE queued since the last step goes out first. Drained here
  // rather than through a second hook because this is already the question the
  // main loop asks every enemy every step -- "did you make anything" -- and one
  // door means the boss's roar and a Hive's brood reach the board by the same
  // path, sweep and all.
  var queued = null;
  if (this.pendingSpawns && this.pendingSpawns.length) {
    queued = this.pendingSpawns;
    this.pendingSpawns = null;
  }

  var spec = this.type.spawns;
  if (!spec || this.dead || this.leaked) return queued;

  this.spawnTimer -= dt;
  if (this.spawnTimer > 0) return queued;
  this.spawnTimer = spec.intervalSeconds;
  this.spawnFlash = 1;

  // Whatever the spawn block says about the bodies it makes, beyond which type
  // they are: a shield, a bounty, defences. Passed as the constructor's
  // per-spawn overrides, so the type row stays the description of the type.
  var born = {
    shieldRatio: spec.shieldRatio,
    noBounty: spec.noBounty,
    armor: spec.armor,
    defense: spec.defense,
    routeId: this.routeId,
    // The brood belongs to whatever wave brought the Hive in, and it has to,
    // or a Hive left alive across a break would keep minting bodies that
    // belong to nothing and the wave that scheduled it would already have been
    // declared over with its hatchlings still walking.
    waveId: this.waveId
  };

  var brood = [];
  for (var i = 0; i < spec.count; i++) {
    var minion = new Enemy(this.path, spec.health, spec.type, born);
    // They fall out of the parent WHERE IT STANDS, not at the mouth of the
    // road. A spawner that seeded the start of the map would just be a wave on
    // a timer; dropping them at its feet is what makes killing it early
    // actually save you the walk they would have had.
    //
    // Staggered BACKWARDS along the road, a few u.l. apart. Without this all
    // five share one progress value, and since they also share a speed they
    // stay in a perpendicular rank for the rest of their lives -- five bodies
    // walking in a line abreast, which is exactly the unnatural look the lane
    // offsets exist to avoid. Trailing them behind the parent reads as a brood
    // coming out of it. Clamped at 0 so a Hive killed near the start of the
    // road cannot push its last hatchling off the back of it.
    minion.progress = Math.max(0, this.progress - ul(i * Enemy.BROOD_TRAIL_UL));
    minion.refreshPos();
    brood.push(minion);
  }
  return queued ? queued.concat(brood) : brood;
};

// A dead fractal divides once. The board owns the enemy list, so this method
// returns the children for game.js's death sweep to append after it removes
// the parent; it never reaches into global state itself.
//
// T0 is terminal. T1..T5 make exactly four copies of the same type at T-1.
// The copies occupy a whole interval centred on the parent's death point,
// clamped onto the route near either end. Spacing grows with the CHILD tier,
// because a T4 child is visibly much larger than a T0. Fresh lane offsets add
// lateral separation too, so the generation reads as four bodies rather than
// one puddle.
Enemy.prototype.splitOnDeath = function () {
  var spec = this.type.fractal;
  if (!spec || !this.dead || this.fractalTier <= spec.minTier ||
      this.fractalSplitDone) return null;

  this.fractalSplitDone = true;
  var childTier = this.fractalTier - 1;
  var spacingUl = spec.splitSpreadBaseUl +
    childTier * spec.splitSpreadPerTierUl;
  var spanPx = ul(spacingUl * (spec.splitCount - 1));
  var latestStart = Math.max(0, this.path.length - spanPx);
  var startProgress = Math.max(0,
    Math.min(this.progress - spanPx / 2, latestStart));
  var children = [];
  for (var i = 0; i < spec.splitCount; i++) {
    var child = new Enemy(this.path, undefined, this.typeId, {
      tier: childTier,
      routeId: this.routeId,
      // Five generations deep, the last T0 is still the wave-25 slime's doing.
      // Inheriting rather than re-reading the schedule is what keeps that true
      // for a cascade that takes longer to finish than the wave it came from.
      waveId: this.waveId,
      // Preserve a per-spawn $0 rule if a future summon creates a fractal.
      noBounty: this.noBounty
    });
    child.progress = startProgress + ul(i * spacingUl);
    child.refreshPos();
    // Born disoriented: deterministic 0.5 / 0.67 / 0.83 / 1.0 s movement
    // stuns spread the moment they start walking as well as where they stand.
    var stunFraction = spec.splitCount <= 1 ? 0 : i / (spec.splitCount - 1);
    child.applyStun(spec.spawnStunMinSeconds +
      (spec.spawnStunMaxSeconds - spec.spawnStunMinSeconds) * stunFraction);
    children.push(child);
  }
  return children;
};

// --- support: the enemies that help OTHER enemies ---------------------------
//
// The sixth mechanic block (2026-07-30). `attack` acts on your towers;
// `support` acts on the road itself -- it hands out shields or regeneration on
// a timer. Like every other block it is read by asking whether the enemy HAS
// one, never which type it is, so a second supporter is one more row in
// Enemy.TYPES and nothing else.
//
// THE SHAPE OF A SUPPORT PULSE, all of it data on the block:
//
//   intervalSeconds  how often it pulses
//   pick             who it picks: "strongest" (most life still standing),
//                    "mostMissingHealth" (whoever your board has just hurt),
//                    or "self"
//   targets          how many it takes, best first; ignored by "self"
//   reachUl          how far it can reach; omitted means THE WHOLE MAP
//   shield           points of shield granted, with `stacks` deciding whether
//                    they pile up or merely refresh a pool of that size
//   heal             { perSecond, seconds } -- regeneration put on the target,
//                    which then ticks in ITS OWN update and outlives the
//                    supporter that granted it
//
// SEPARATE FROM update(dt) for exactly the reason attackTowers and spawnMinions
// are: movement needs nothing but the path, and this needs the whole enemy
// list. Threading that through update() would make every caller that only
// wants an enemy to walk supply a board it does not have.

// Who a pulse would reach, best first. `enemies` is the live board; the
// supporter's own body is a candidate like any other, which is why a wounded
// Healer will top itself up and why the Shieldbearer is usually one of the ten
// it shields.
Enemy.prototype.supportCandidates = function (spec, enemies) {
  var out = [];
  var reachPx = spec.reachUl === undefined ? Infinity : ul(spec.reachUl);

  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    // A body already dead or gone is swept out at the end of this same step;
    // shielding it would be the same wasted work as a bullet landing on a
    // corpse.
    if (e.dead || e.leaked) continue;
    // A SUPPORTER DOES NOT PICK ITSELF (2026-08-26, at the owner's
    // instruction: "the shieldbearer should not shield himself").
    //
    // It used to, and on the Shieldbearer it did so reliably rather than
    // occasionally: `pick: "strongest"` sorts on life still standing, the
    // beacon has 60 HP against a swarm's 1 and a normal's 4, and its own
    // stacking plate makes it the strongest body on the board by a wider
    // margin after every pulse it fires. So one of its ten plates went on
    // itself every ten seconds, compounding, and the support type designed to
    // make everything ELSE expensive was quietly the hardest thing to remove.
    //
    // THIS IS THE `supportCandidates` PATH ONLY, WHICH IS THE WHOLE OF WHAT
    // "does not shield himself" CAN MEAN HERE. `pick: "self"` does not come
    // through this function at all -- `supportAllies` short-circuits to
    // `[this]` -- so the Vanguard, whose entire mechanic is shielding itself,
    // is untouched. A supporter aimed at others now never lands on itself, and
    // one aimed at itself still does.
    if (e === this) continue;
    if (reachPx !== Infinity) {
      var dx = e.pos.x - this.pos.x;
      var dy = e.pos.y - this.pos.y;
      if (dx * dx + dy * dy > reachPx * reachPx) continue;
    }
    out.push(e);
  }

  if (spec.pick === "mostMissingHealth") {
    // MISSING health, not lowest health: a 200 HP Healer at 150 is worth more
    // of a heal than a 4 HP normal at 1, and "whoever your board has just spent
    // its shots on" is the enemy this is meant to describe. Ties break on the
    // bigger body, so the pick cannot flicker between two identical ones.
    out.sort(function (a, b) {
      return ((b.maxHealth - b.health) - (a.maxHealth - a.health)) ||
        (b.maxHealth - a.maxHealth);
    });
    // Nobody hurt is nobody to heal -- a pulse spent on a wave at full health
    // would be a pulse wasted, and the timer is what the player is racing.
    out = out.filter(function (e) { return e.health < e.maxHealth; });
  } else {
    // "strongest" -- the most life STILL STANDING, shield included, which is
    // the same measure the strongest targeting mode uses. Ties break on the
    // bigger body, for the same reason.
    out.sort(function (a, b) {
      return (b.remainingHealth() - a.remainingHealth()) ||
        (b.maxHealth - a.maxHealth);
    });
  }
  return out;
};

// Pulse, if this enemy is the kind that does and its timer has come round.
// Returns the bodies it helped, or null -- returned rather than logged so the
// tests and the sandbox can see exactly who was picked.
Enemy.prototype.supportAllies = function (dt, enemies) {
  var spec = this.type.support;
  if (!spec || this.dead || this.leaked) return null;

  this.supportTimer -= dt;
  if (this.supportTimer > 0) return null;
  this.supportTimer = spec.intervalSeconds;

  var picked;
  if (spec.pick === "self") {
    picked = [this];
  } else {
    picked = this.supportCandidates(spec, enemies)
      .slice(0, spec.targets === undefined ? 1 : spec.targets);
  }

  // Nothing to help: the timer has already been reset, so a Healer walking
  // beside a healthy wave still waits out its full eight seconds before
  // looking again. That is deliberate -- an ability that retried every frame
  // would fire the instant the first shot landed, which is not a rhythm the
  // player can read.
  if (!picked.length) return null;

  this.supportFlash = 1;

  for (var i = 0; i < picked.length; i++) {
    if (spec.shield > 0) picked[i].grantShield(spec.shield, spec.stacks !== false);
    if (spec.heal) picked[i].applyHeal(spec.heal.perSecond, spec.heal.seconds);
    // A CORD PER BODY HELPED, if this supporter's spec asks for them. Recorded
    // rather than drawn, because the pulse resolves in the simulation and the
    // two boards draw it in their own space -- and because `picked` is thrown
    // away by every caller but the tests. A supporter that pulses again before
    // its last cords have faded simply carries both sets: they are per-target
    // and a target cannot be picked twice in one pulse.
    if (spec.tether) {
      this.supportLinks.push({ target: picked[i], life: 1,
                               span: spec.tether.seconds });
    }
  }
  return picked;
};

// Put shield on this enemy.
//
// STACKING is the Shieldbearer's, and it is what makes leaving one alive
// expensive: every grant is more health the player has to remove and is not
// paid a penny for. NON-stacking is the fast boss's -- the pool is refreshed
// back up to `amount` and never piles higher, so what it costs is tempo rather
// than an ever-growing wall.
//
// `shieldMax` moves with it either way, because it is what the shield bar is
// drawn against; a grant that raised `shield` alone would draw a full pool as
// a sliver, or overflow the bar entirely.
Enemy.prototype.grantShield = function (amount, stacks) {
  if (!(amount > 0)) return;
  if (stacks) {
    this.shieldMax += amount;
    this.shield += amount;
  } else {
    if (this.shieldMax < amount) this.shieldMax = amount;
    if (this.shield < amount) this.shield = amount;
  }
  this.shieldFlash = 1;
  // THE GAP IS OVER, whoever closed it. A Shieldbearer's plate ends a
  // Vanguard's reform exactly as its own pulse does -- the body has a shield
  // again, which is the whole of what this flag claims. `shieldBroken` is
  // deliberately NOT cleared here; see the field for why the two differ.
  this.shieldOut = false;
};

// Put regeneration on this enemy: `perSecond` HP for `seconds`, ticked by its
// own update().
//
// Taken, never stacked -- the same rule applySlow follows and for the same
// reason: a stronger heal replaces a weaker one, an equal one refreshes the
// duration, and a weaker one cannot dilute what is already running. Two
// Healers on one wave therefore make the heal LAST rather than double, which
// keeps "15 HP/s" a number the index can state truthfully.
Enemy.prototype.applyHeal = function (perSecond, seconds) {
  if (!(perSecond > 0) || !(seconds > 0)) return;
  if (perSecond < this.healPerSecond) return;
  this.healPerSecond = perSecond;
  this.healTimer = seconds;
};

// Restore health, clamped at this body's maximum.
//
// Everything restored is banked in `healedHealth`, which is what stops the
// player being paid twice for the same point of life -- see takeDamage. The
// dead and the leaked cannot be healed: an enemy is removed at the end of the
// step it dies in, and reviving one out of a regeneration tick would be a
// second, undocumented way back from the dead alongside `revive`.
Enemy.prototype.heal = function (amount) {
  if (!(amount > 0) || this.dead || this.leaked) return 0;
  var restored = Math.min(amount, this.maxHealth - this.health);
  if (restored <= 0) return 0;
  this.health += restored;
  this.healedHealth += restored;
  this.healFlash = 1;
  return restored;
};


// A type's attacks, whichever form they were written in. `attacks` is the pool
// form and a single `attack` is the one-element case -- the same arrangement a
// wave has with `groups`, reconciled in one place so nothing downstream cares.
Enemy.attacksOf = function (type) {
  if (type.attacks) return type.attacks;
  return type.attack ? [type.attack] : [];
};

// --- facing posture -----------------------------------------------------
//
// `facesTarget: true` on any element of an attack pool (single `attack` or
// either entry of `attacks`) makes that ONE spec stop, turn to face what it
// is about to hit, strike, and turn back -- see Enemy.prototype.attackTowers
// and tickAttackPosture below. Every other spec, including the Tyrant's
// (spelled `attacks:`, plural, and read through the same Enemy.attacksOf
// above), is untouched: the flag is read off the SPEC, never off a type id,
// so opting one attack in never opts in a pool it shares a type with.
//
// A turn rate is an ANGLE per second, not a distance -- it must never go
// through ul(). The facing it produces is a unit vector, dimensionless, for
// the same reason.
Enemy.ATTACK_TURN_DEGREES_PER_SECOND = 300;
Enemy.ATTACK_TURN_RADIANS_PER_SECOND =
  Enemy.ATTACK_TURN_DEGREES_PER_SECOND * Math.PI / 180;

// The strike beat's length is NOT a second duration invented for this: it is
// exactly attackFlash's own life. attackFlash is set to 1 in resolveAttack
// and decayed at `dt * Enemy.ATTACK_FLASH_DECAY_PER_SECOND` in update(),
// which is the same drive js/gl/gl-world.js's strike gesture already runs
// on -- so the body stands still for precisely as long as that gesture
// plays, by construction, and retuning the decay rate retunes the stop to
// match rather than leaving the two to drift apart.
Enemy.ATTACK_FLASH_DECAY_PER_SECOND = 2.5;
Enemy.ATTACK_STRIKE_SECONDS = 1 / Enemy.ATTACK_FLASH_DECAY_PER_SECOND;

// Shortest signed distance from one angle to another, in radians, in
// (-PI, PI] -- the turn never goes the long way round.
Enemy.shortestAngleDelta = function (fromRadians, toRadians) {
  var delta = (toRadians - fromRadians) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

Enemy.unitVectorForAngle = function (radians) {
  return { x: Math.cos(radians), y: Math.sin(radians) };
};

// The worst a `facesTarget` spec can cost in stopped time: a full 180-degree
// turn out, the strike window, a full 180-degree turn back, and any wind-up
// -- which for a facesTarget spec is spent inside this same posture rather
// than the separate windUpTimer path (see beginAttackPosture). 180 is the
// most any single turn can ever be, by construction of shortestAngleDelta.
Enemy.worstCaseAttackPostureSeconds = function (spec) {
  var halfTurnSeconds = Math.PI / Enemy.ATTACK_TURN_RADIANS_PER_SECOND;
  return halfTurnSeconds * 2 + Enemy.ATTACK_STRIKE_SECONDS +
    (spec.windUpSeconds || 0);
};

// HARD INVARIANT: a facesTarget attack's worst-case stopped time must stay
// strictly below its own intervalSeconds. If it does not, attackTimer can
// expire again before the posture has ever finished returning the body to
// its walk, so the body stops dead the instant it has ever had a target and
// never advances again. Thrown, not logged, and called for every attack of
// every type at the bottom of this section -- so retuning the turn rate, the
// strike window or an attack's own intervalSeconds without checking this
// trips it at load, on every boot, rather than shipping a road-blocker.
Enemy.assertAttackPostureBudget = function (spec, label) {
  if (!spec || !spec.facesTarget) return;
  var worst = Enemy.worstCaseAttackPostureSeconds(spec);
  if (!(worst < spec.intervalSeconds)) {
    throw new Error("facesTarget attack " + label + " can stop for " +
      worst.toFixed(3) + "s worst case, which is not strictly less than " +
      "its own intervalSeconds (" + spec.intervalSeconds + "s) -- it would " +
      "never finish returning to its walk once it had a target.");
  }
};

(function assertEveryAttackPostureBudget() {
  for (var typeId in Enemy.TYPES) {
    if (!Enemy.TYPES.hasOwnProperty(typeId)) continue;
    var pool = Enemy.attacksOf(Enemy.TYPES[typeId]);
    for (var i = 0; i < pool.length; i++) {
      Enemy.assertAttackPostureBudget(pool[i], typeId + "[" + i + "]");
    }
  }
})();

// How much damage per second a tower puts out, through the vocabulary EVERY
// tower type answers (js/systems/tower-stats.js). That contract is what makes
// "shoot the strongest tower" possible without the enemy knowing what a
// Longshot is.
//
// A tower that somehow answers neither scores zero rather than throwing: an
// attack picking a target is not the place to discover a broken tower type.
Enemy.towerDps = function (tower) {
  if (typeof tower.attackDamage !== "function") return 0;
  if (typeof tower.attacksPerSecond !== "function") return 0;
  return tower.attackDamage() * tower.attacksPerSecond();
};

// The towers an attack would hit, best first. `spec.target` picks the ordering:
// "highestDps" for the boss's aimed shot, nearest for everything else.
Enemy.prototype.attackCandidates = function (spec, towers, radiusUl, from) {
  // A MISSING REACH IS THE WHOLE MAP, stated rather than stumbled into. This
  // used to be a plain ul(undefined), which is NaN, and every distance
  // comparison against NaN is false -- so an unbounded attack worked, by
  // accident, through a hole in the arithmetic. The Tyrant's aimed shot has
  // relied on that deliberately since 2026-07-30, so it is now spelled the
  // same way supportCandidates spells it.
  var reachPx = radiusUl === undefined || radiusUl === null ? Infinity : ul(radiusUl);
  var origin = from || this.pos;
  var out = [];

  for (var i = 0; i < towers.length; i++) {
    var t = towers[i];
    // A tower already at zero is a corpse waiting to be swept out this step;
    // hitting it again would waste the swing, exactly as a bullet landing on
    // a dead enemy does.
    if (t.isDestroyed && t.isDestroyed()) continue;
    // SUMMONS ARE NOT TARGETS. The Summoner's blubs live in `towers` because
    // that is what makes them occupy space and take stuns (see js/blub.js), but
    // the owner's brief is flat about it: "les blubs ne peuvent pas etre cibles
    // ni attaques par les ennemis". Excluding them HERE rather than at each
    // attack is what keeps `targets` honest as well -- an aimed shot that took
    // "the two highest-DPS towers" must not spend one of them on a blub it
    // cannot hurt. The one exception says so itself: a fused monster blub sets
    // `enemyTargetable`.
    if (t.isSummon && !t.enemyTargetable) continue;
    var dx = t.x - origin.x;
    var dy = t.y - origin.y;
    var d = dx * dx + dy * dy;
    if (reachPx !== Infinity && d > reachPx * reachPx) continue;
    out.push({ tower: t, d: d, dps: Enemy.towerDps(t) });
  }

  if (spec.target === "highestDps") {
    // Distance breaks a DPS tie, so the pick cannot flicker between two
    // identical towers frame to frame -- the same reason Targeting.pick has a
    // tie-break at all.
    out.sort(function (a, b) { return (b.dps - a.dps) || (a.d - b.d); });
  } else {
    out.sort(function (a, b) { return a.d - b.d; });
  }
  return out;
};

// Attack, if this enemy is the kind that does and something is worth hitting.
// Returns the FIRST tower hit, or null.
//
// SEPARATE FROM update(dt) on purpose. Movement depends on nothing but the
// path; this depends on the tower list, and threading `towers` through
// update() would make every caller that only wants an enemy to walk (the
// tests, the codex's parked sprites) supply a board it does not have.
//
// THE SHAPE OF AN ATTACK, all of it data on the spec:
//
//   windUpSeconds   the enemy STOPS for this long first, then it resolves
//   target          "highestDps", or nearest by default
//   targets         how many it takes; 1 unless stated
//   damage/stunSeconds   independent -- an attack may carry either or both
//   leap            { distanceUl, radiusUl } -- jump forward, then hit
//                   everything within radiusUl of where it LANDED
//   facesTarget     stop, turn to face what it is about to hit, strike, turn
//                   back -- see beginAttackPosture. Composes with
//                   windUpSeconds (turn, THEN wind up, THEN strike); a spec
//                   with neither is bit-identical to before this existed.
//
// The pool CYCLES. The boss opens with one attack and its roar appends a
// second, after which it alternates: shot, leap, shot, leap. Deterministic on
// purpose -- `attackIndex` is a counter, never Math.random, for the same
// reason lane offsets are not random.
//
// AN ATTACK WITH NOTHING IN REACH IS SKIPPED, NOT WAITED OUT (2026-07-30).
// The cycle steps past it to the next attack that has a target, so the
// alternation is "shot, leap, shot, leap" whenever both can fire and never a
// silence when only one can. `reachUl` omitted means the whole map, which is
// how the Tyrant's aimed shot guarantees there is always something to step to.
Enemy.prototype.attackTowers = function (dt, towers) {
  if (!this.attacks.length || this.dead || this.leaked) return null;

  // Mid posture: turning, striking or turning back (see currentSpeedUlps,
  // which is why it is standing still for all of it). Nothing else this
  // function does applies while this is set -- the attack was already
  // chosen at commit; only the posture's own clock runs.
  if (this.attackPosture) {
    return this.tickAttackPosture(dt, towers);
  }

  // Mid wind-up: it is standing still (see currentSpeedUlps) and the clock is
  // running on the attack it already committed to. The attack that lands is
  // always the one that was telegraphed.
  if (this.windUpTimer > 0) {
    this.windUpTimer -= dt;
    if (this.windUpTimer > 0) return null;
    this.windUpTimer = 0;
    var committed = this.windUpAttack;
    this.windUpAttack = null;
    return this.resolveAttack(committed, towers);
  }

  this.attackTimer -= dt;
  if (this.attackTimer > 0) return null;

  // IT NEVER SKIPS ITS TURN WHILE THERE IS ANYTHING TO HIT (2026-07-30, at the
  // owner's instruction: "make sure he never stops attacking but keep his
  // attack speed the same"). The pool still cycles in order, but a spec with
  // nothing in reach no longer ENDS the turn -- it steps to the next one and
  // the enemy attacks with that instead. For the Tyrant that means the leap,
  // which only fires at a tower inside its own `reachUl`, falls through to the
  // aimed shot, which since this same change reaches the whole map. So the
  // fight has no quiet stretches in it any more.
  //
  // The leap's reach is NOT repeated here -- read it off the spec. This
  // sentence carried "150 u.l." until 2026-08-12 while the spec said 220, one
  // retune behind, in the exact clause that defines the fall-through rule.
  //
  // AND THE SELECTION IS ROUND-ROBIN, NOT A PRIORITY ORDER. It takes the FIRST
  // option from `attackIndex` that has candidates, so when the index points at
  // the aimed shot, aimed fires and the leap is never consulted whatever is in
  // its reach. "Aimed fired while the leap had targets" is therefore ORDINARY
  // -- it means it was not the leap's turn. Only "the leap's turn came up, it
  // had candidates at that instant, and something else fired" is a defect.
  //
  // The RATE is untouched: whichever attack lands sets the timer to its own
  // intervalSeconds, exactly as before. This makes the boss attack more often
  // in practice only in the sense that it no longer misses turns it used to.
  //
  // Checked BEFORE the wind-up so a boss does not stand still telegraphing at
  // an empty stretch of road.
  var spec = null;
  var candidates = null;
  for (var i = 0; i < this.attacks.length; i++) {
    var option = this.attacks[(this.attackIndex + i) % this.attacks.length];
    var found = this.attackCandidates(option, towers, option.reachUl);
    if (found.length) {
      spec = option;
      candidates = found;          // reused below rather than searched twice
      this.attackIndex += i;      // a skipped attack loses its turn, it does not queue
      break;
    }
  }

  // Nothing worth attacking anywhere: the timer stays expired, so it acts the
  // instant something comes into reach rather than waiting out another full
  // interval. With the aimed shot unbounded this now means one thing only --
  // there are no towers left standing.
  if (!spec) return null;

  this.attackIndex++;
  this.attackTimer = spec.intervalSeconds;

  // Opt-in on the SPEC, never on the type id (see the header on Enemy.TYPES):
  // a plural `attacks` pool may carry the flag on one element and not the
  // other, and only that element ever postures.
  if (spec.facesTarget) {
    return this.beginAttackPosture(spec, candidates[0].tower, towers);
  }

  if (spec.windUpSeconds > 0) {
    this.windUpTimer = spec.windUpSeconds;
    this.windUpAttack = spec;
    return null;                     // it lands when the wind-up runs out
  }
  return this.resolveAttack(spec, towers);
};

// LASERS OUT OF ITS EYES, AND A BLAST WHERE THEY LAND (2026-08-19, at the
// owner's instruction: "when the tyrant attacks a tower, he shoots lasers out
// of his eyes at that tower and it creates an explosion on impact").
//
// PRESENTATION ONLY, and it has to be: this is called from resolveAttack, which
// is simulation, so the same rule the top of js/effects.js states applies here
// -- an Effects-free game must play identically. Nothing below is read back,
// the damage and the stun above are unaffected by whether any of it drew, and
// the guard means a headless run (every suite) simply skips it.
//
// OPT-IN ON THE SPEC, NEVER ON THE TYPE ID, which is the rule `facesTarget`
// already follows fifteen lines down: the Tyrant's pool holds an aimed shot AND
// a leap, and only the aimed one has eyes to fire from. A check for
// `typeId === "boss"` would put beams on the leap as well.
//
// TWO BEAMS, NOT ONE. The model carries three `Tower_Threat_Sensor` lenses
// across the brow; a single line from the head centre reads as a gun barrel,
// and the pair is what says "it looked at you". The renderers draw the pair
// from `spreadPx`; this function does not compute either endpoint's offset,
// because where a lens sits on a face is a fact about the picture and belongs
// with the drawing.
//
// THE HEIGHT IS IN RADII, like FLIGHT_LIFT_RADII and a hover's own liftRadii,
// so it survives the sizeScale the Tyrant is drawn at instead of being a pixel
// count that is right at one size only.
Enemy.prototype.emitEyeBeam = function (spec, tower) {
  if (typeof Effects === "undefined" || !Effects.aoeImpact) return;
  var eye = spec.eyeBeam;
  var radius = this.radiusPx();
  var liftPx = radius * (eye.liftRadii || 2.6);

  // The beam itself. `particles: false` because a clean energy line should not
  // throw debris out of thin air along its length -- the debris belongs at the
  // far end, and the blast below is what makes it. Centred on the midpoint with
  // half the length as its radius, exactly as `lance-remnant` is, so the impact
  // cap and the cull treat it like any other mark.
  Effects.aoeImpact((this.pos.x + tower.x) * 0.5, (this.pos.y + tower.y) * 0.5,
    Math.max(8, Math.hypot(tower.x - this.pos.x, tower.y - this.pos.y) * 0.5),
    "tyrant-gaze", {
      particles: false,
      life: eye.life || 0.34,
      x1: this.pos.x, y1: this.pos.y, x2: tower.x, y2: tower.y,
      liftPx: liftPx,
      spreadPx: radius * (eye.spreadRadii || 0.235),
      tint: eye.tint || "255,96,72"
    });

  // The explosion, at the tower. NO renderer is registered for this kind on
  // either board, and that is deliberate rather than unfinished: an
  // unrecognised kind falls through to the circular shockwave-and-debris path
  // that both `drawAoeImpacts` and gl-world's `drawEffects` already end in,
  // which is exactly the shape an explosion wants. Naming it anyway is what
  // lets a skin pack claim it later without touching this file.
  Effects.aoeImpact(tower.x, tower.y, ul(eye.blastRadiusUl || 18),
    "tyrant-blast", { life: eye.blastLife || 0.5 });
};

// Land an attack that has finished winding up (or had no wind-up).
Enemy.prototype.resolveAttack = function (spec, towers) {
  if (!spec) return null;
  this.attackFlash = 1;

  var hits;

  if (spec.leap) {
    // JUMP FORWARD, then hit whatever is near where it landed. The order
    // matters and is the whole feel of the move: the shockwave belongs to the
    // landing, not to where it took off from.
    //
    // Clamped at the end of the road. A leap that carries it past the base is
    // a leak, and it is meant to be -- nothing here gets to cheat the one rule
    // every other enemy lives by.
    this.progress = Math.min(this.path.length, this.progress + ul(spec.leap.distanceUl));
    this.refreshPos();
    this.shockwaveFlash = 1;
    this.lastBlastRadiusUl = spec.leap.radiusUl;
    hits = this.attackCandidates(spec, towers, spec.leap.radiusUl);
    // A shockwave takes EVERYTHING it reaches. `targets` is for aimed attacks.
  } else {
    hits = this.attackCandidates(spec, towers, spec.reachUl)
      .slice(0, spec.targets || 1);
    if (hits.length) {
      // Cosmetic only: where the shot went, so the player can see what was
      // picked. Read nowhere by the simulation.
      //
      // A body with `eyeBeam` draws its own, richer mark and suppresses this
      // one rather than drawing both -- see emitEyeBeam. The plain bolt leaves
      // the body's CENTRE, so on the Tyrant it read as a shot from the belly.
      if (!spec.eyeBeam) {
        this.attackBeam = { x: hits[0].tower.x, y: hits[0].tower.y, life: 1 };
      } else {
        this.emitEyeBeam(spec, hits[0].tower);
      }
    }
    this.lastBlastRadiusUl = 0;
  }

  for (var i = 0; i < hits.length; i++) {
    var target = hits[i].tower;
    // Damage and stun are independent. The Angry hits for 20 and stuns for
    // nothing; the boss does both, which is what makes its aimed shot a threat
    // to the board's best tower rather than an inconvenience.
    if (spec.damage > 0) target.takeDamage(spec.damage);
    if (spec.stunSeconds > 0 && typeof TowerHealth !== "undefined") {
      TowerHealth.stun(target, spec.stunSeconds);
    }
  }

  // A SHOCKWAVE STUNS SUMMONS, AND ONLY STUNS THEM.
  //
  // The brief keeps both halves: blubs cannot be attacked, but "les blubs
  // subissent les stuns de zone infliges par les ennemis". So they are absent
  // from the candidate list above -- no damage, and they never soak an aimed
  // shot meant for a real tower -- and an AREA attack sweeps them separately
  // here for its stun alone.
  //
  // Only a leap qualifies. An aimed shot picks one tower by name and has no
  // area to speak of, so making it silence the blubs beside its victim would be
  // inventing reach the attack does not have.
  if (spec.leap && spec.stunSeconds > 0 && typeof TowerHealth !== "undefined") {
    var wave = ul(spec.leap.radiusUl);
    for (var s = 0; s < towers.length; s++) {
      var summon = towers[s];
      if (!summon.isSummon || summon.enemyTargetable) continue;
      if (summon.isDestroyed && summon.isDestroyed()) continue;
      var sdx = summon.x - this.pos.x;
      var sdy = summon.y - this.pos.y;
      if (sdx * sdx + sdy * sdy > wave * wave) continue;
      TowerHealth.stun(summon, spec.stunSeconds);
    }
  }

  return hits.length ? hits[0].tower : null;
};

// Commit to a facesTarget attack: build the phase list (turn, optionally
// wind-up, strike, return) and enter the first one. `target` is only ever
// used to compute the angle to turn toward -- the tower actually hit is
// whatever resolveAttack finds in reach when the strike phase begins, exactly
// as an ordinary wind-up already re-resolves against the board at that later
// moment rather than freezing it at commit.
//
// Angles are computed once, here, because the body cannot move while
// posturing (see currentSpeedUlps): `this.pos` and the target's position are
// both fixed for the posture's whole life, so nothing needs recomputing
// mid-turn.
Enemy.prototype.beginAttackPosture = function (spec, target, towers) {
  var fromVec = this.headingVec() || { x: 1, y: 0 };
  var fromAngle = Math.atan2(fromVec.y, fromVec.x);
  var toAngle = Math.atan2(target.y - this.pos.y, target.x - this.pos.x);
  var turnOutSeconds =
    Math.abs(Enemy.shortestAngleDelta(fromAngle, toAngle)) /
    Enemy.ATTACK_TURN_RADIANS_PER_SECOND;
  var turnBackSeconds =
    Math.abs(Enemy.shortestAngleDelta(toAngle, fromAngle)) /
    Enemy.ATTACK_TURN_RADIANS_PER_SECOND;

  var phases = [
    { name: "turn", angleFrom: fromAngle, angleTo: toAngle, duration: turnOutSeconds }
  ];
  if (spec.windUpSeconds > 0) {
    phases.push({ name: "windup", angleFrom: toAngle, angleTo: toAngle,
      duration: spec.windUpSeconds });
  }
  phases.push({ name: "strike", angleFrom: toAngle, angleTo: toAngle,
    duration: Enemy.ATTACK_STRIKE_SECONDS });
  phases.push({ name: "return", angleFrom: toAngle, angleTo: fromAngle,
    duration: turnBackSeconds });

  this.attackPosture = { spec: spec, phases: phases, index: -1, timer: 0,
    facing: fromVec };
  return this.advanceAttackPosture(towers);
};

// Move the posture into its next phase, skipping any that need zero time
// (an attack already facing its target turns for 0 s, not for one idle
// frame). Damage lands at the START of the strike phase -- resolveAttack is
// called exactly here, never from tickAttackPosture's per-frame branch -- so
// attackFlash opens at 1 the same instant the stop that covers its gesture
// begins. Returns whatever resolveAttack returned, or null if this advance
// did not reach a strike.
Enemy.prototype.advanceAttackPosture = function (towers) {
  var posture = this.attackPosture;
  var hit = null;
  do {
    posture.index++;
    if (posture.index >= posture.phases.length) {
      this.attackPosture = null;        // beat 5: resume walking
      return hit;
    }
    var phase = posture.phases[posture.index];
    posture.timer = phase.duration;
    posture.facing = Enemy.unitVectorForAngle(phase.angleFrom);
    if (phase.name === "strike") {
      hit = this.resolveAttack(posture.spec, towers);
    }
  } while (posture.timer <= 0);
  return hit;
};

// One frame of an already-active posture: slew the facing toward this
// phase's target angle at ATTACK_TURN_RADIANS_PER_SECOND (the "windup" and
// "strike" phases have angleFrom === angleTo, so this is a no-op slew that
// simply holds the target-facing angle for their duration), and advance to
// the next phase once the timer runs out. A phase reached from here always
// has duration > 0 -- advanceAttackPosture already skipped anything shorter.
Enemy.prototype.tickAttackPosture = function (dt, towers) {
  var posture = this.attackPosture;
  var phase = posture.phases[posture.index];
  posture.timer -= dt;

  if (posture.timer > 0) {
    var doneFraction = 1 - posture.timer / phase.duration;
    if (doneFraction < 0) doneFraction = 0;
    if (doneFraction > 1) doneFraction = 1;
    var delta = Enemy.shortestAngleDelta(phase.angleFrom, phase.angleTo);
    posture.facing = Enemy.unitVectorForAngle(phase.angleFrom + delta * doneFraction);
    return null;
  }

  posture.facing = Enemy.unitVectorForAngle(phase.angleTo);
  return this.advanceAttackPosture(towers);
};

// Health that no bullet in flight has claimed yet. Towers target on THIS
// rather than on raw health, so an enemy that is already dead-on-arrival is
// invisible to them and nobody wastes a shot finishing it off.
// Health that no bullet in flight has claimed yet. Towers target on THIS
// rather than on raw health, so an enemy that is already dead-on-arrival is
// invisible to them and nobody wastes a shot finishing it off.
//
// It counts the SHIELD, and it has to: a Bulwark stands at full health behind
// 24 points of shield, so measuring claims against health alone would let four
// bullets' worth of claims mark a 36-point enemy as dead on arrival and every
// tower on the board would stop shooting it.
Enemy.prototype.unclaimedHealth = function () {
  return this.remainingHealth() - this.incomingDamage;
};

Enemy.prototype.reserveDamage = function (amount) {
  this.incomingDamage += amount;
};

Enemy.prototype.releaseDamage = function (amount) {
  this.incomingDamage = Math.max(0, this.incomingDamage - amount);
};

// Slows are taken, never stacked: only the STRONGEST slow on an enemy applies,
// and a weaker one cannot dilute it or extend its duration. `strength` is the
// fraction of speed removed, so 0.65 leaves the enemy at 35% speed.
//
// An EQUALLY strong slow does refresh the duration. That case is not spelled
// out in the spec, and it has to: B5 hits every 2.2 s and slows for 3.0 s, so
// if equal hits did not refresh, a lone B5 smasher's own slow would lapse for
// 1.4 s out of every 4.4 s -- which would make a duration longer than the
// cooldown pointless. Refusing to refresh is still enforced for weaker slows,
// which is what the "never stack" rule is actually protecting against.
Enemy.prototype.applySlow = function (strength, seconds) {
  var multiplier = 1 - strength;
  if (multiplier > this.slowMultiplier) return;   // weaker: ignore completely

  this.slowMultiplier = multiplier;
  this.slowTimer = seconds;
};

// Stop this enemy dead for `seconds`. THE LONGEST WINS and a shorter one
// cannot cut a longer one short -- the same rule `applySlow` follows and the
// same rule `TowerHealth.stun` follows on the other side of the board, so
// "stun" means one thing in this game whichever direction it points.
//
// Movement only, deliberately: see `stunTimer` in the constructor.
Enemy.prototype.applyStun = function (seconds) {
  if (!(seconds > 0) || seconds <= this.stunTimer) return;
  this.stunTimer = seconds;
  this.stunFlash = 1;
};

// Returns the damage ACTUALLY dealt. Cash is no longer attached to this
// return value -- enemies pay their authored bounty once, when killed -- but
// damage counters, lifesteal and the Siphon's charge meter still need the
// landed amount. Overkill does not count: hitting a 1 HP enemy for 3 reports
// 1, not 3.
//
// `amount` is RAW damage. Armor and defense are applied HERE, which is what
// makes mitigation global -- every damage source in the game comes through
// this one door, so none of them can forget it. A source that ignores some
// defence passes `defPierce` (0..1, a FRACTION of it); a source that ignores a
// flat slice of it passes `defenseFlatPierce` (percentage POINTS, the
// Rifleman's B4). Both act on `defense` and neither touches `armor` -- nothing
// pierces flat armor since 2026-07-30. `damageKind` is deliberately separate:
// only a caller that explicitly says `"aoe"` meets an enemy's area resistance,
// so a piercing line shot is not accidentally treated as area damage.
// See js/systems/mitigation.js.
Enemy.prototype.takeDamage = function (amount, defPierce, defenseFlatPierce, damageKind) {
  var effective = Mitigation.mitigate(amount, this, defPierce, defenseFlatPierce);

  // Resistance is applied after the shared armor/defense pipeline. At present
  // only Fractal Slimes carry it, and only the Warbringer's area attacks and
  // Arcane Sniper B5 tag their hits as AoE. Ordinary and piercing shots keep
  // their full damage.
  if (damageKind === "aoe" && this.type.aoeDamageReduction) {
    effective *= Math.max(0, 1 - this.type.aoeDamageReduction);
  }

  // THE WEAKENING DEBUFF, applied AFTER mitigation and resistance and before
  // anything is taken off.
  //
  // After, because the debuff is "+X% degats subis" -- how much damage this
  // body actually takes -- rather than a bigger swing that armor then eats. A
  // brute with 5 flat armor hit for 6 takes 1, and at +100% it takes 2, not 7.
  // Applying it before mitigation would have made the same debuff worth twelve
  // times as much against an unarmoured swarm as against the armour it is
  // meant to help crack.
  //
  // It lives here, in the one door every damage source in the game comes
  // through, because the brief is explicit that it raises damage from ALL
  // sources and not just from the tower that applied it.
  //
  // A FARM'S FIELD ADDS TO IT RATHER THAN MULTIPLYING IT, which the brief asks
  // for by name ("ces debuffs se cumulent additivement avec les autres types de
  // debuffs"). So the two are summed as FRACTIONS and applied once: +100% from
  // a Summoner and +10% from a Farm is +110%, not +120%. With no farms on the
  // board the sum is DamageAmp's own multiplier to the float, which is what
  // keeps every existing figure in the suite where it was.
  var amp = 0;
  if (typeof DamageAmp !== "undefined") {
    amp += DamageAmp.multiplier(this) - 1;
  }
  if (typeof Farms !== "undefined" && this.pos) {
    amp += Farms.damageAmpAt(this.pos.x, this.pos.y);
  }
  if (amp !== 0) effective *= 1 + amp;

  // A SHIELD ABSORBS THE WHOLE BLOW. NOTHING SPILLS THROUGH.
  //
  // 2026-08-26, at the owner's instruction: *"for any shielded enemy, the
  // shield should absorb all damage, for example if a enemy has 100 HP and 10
  // shield and gets hit for 200 damage, the shield breaks because it is
  // inferior to 200 but nothing happens to the health."* One hit takes at most
  // one layer: it empties the shield, and the overflow is DISCARDED.
  //
  // THIS REVERSES A RULE, and the rule it reverses had a real argument behind
  // it that is worth keeping written down: stopping the spill at the shell
  // wastes the overflow of every heavy weapon, which is the same "bullets
  // landing on corpses" waste that target claiming exists to prevent. That is
  // still true. It is now the POINT -- a shield is worth a whole shot rather
  // than its own thickness, so the answer to a shielded wave is many cheap hits
  // and not one expensive one, and the heaviest single-target weapon on the
  // board is the worst tool for it.
  //
  // WHAT IT DOES *NOT* CHANGE, and each of these is a thing a reader will
  // assume moved with it:
  //
  //   * A SHIELD STILL PAYS NOTHING. `soaked` is reported in
  //     `lastDamageTaken` (the scoreboard measures work performed) and never
  //     in `dealt` (what reward mechanics read). Unchanged, and see the
  //     "A SHIELD PAYS NOTHING, EVER" section in AGENTS.md.
  //   * EFFECTIVE HP IS UNCHANGED. `waveEffectiveHealth` counts a shield as
  //     health the player must remove, and it still must be removed -- what
  //     changed is how many shots that takes, not how many points it is.
  //   * IT IS NOT A DAMAGE CAP. A body with no shield takes the full blow, and
  //     a body whose shield emptied on an earlier hit takes the next one in
  //     full. Only the hit that BREAKS the shell is absorbed by it.
  //
  // `breakShield` still fires on the same frame, so the Bulwark still doubles
  // its speed and the Vanguard still throws its fragments onto the road at the
  // moment the pool empties.
  var incoming = effective;
  var soaked = 0;
  if (this.shield > 0) {
    soaked = Math.min(this.shield, incoming);
    this.shield -= soaked;
    // The whole blow stops here, whatever was left of it.
    incoming = 0;
    if (this.shield <= 0) {
      this.shield = 0;
      this.breakShield();
    }
  }

  // WHAT THIS BLOW COUNTS AS. Two rules preserve damage-led mechanics without
  // letting shields or restored HP be counted twice:
  //
  //   SHIELD DAMAGE is not reported as health damage. The kill bounty already
  //   prices a Bulwark's starting shell; temporary support shields do not feed
  //   lifesteal, charges or damage totals forever.
  //
  //   HEALED HEALTH is also not reported twice. Healed HP sits on top, so it is
  //   the first thing a blow takes off.
  //
  // A fully-blocked hit still flashes, but reports no health damage --
  // no damage floor, by design. Overkill is clamped out for the same reason it
  // always was: hitting a 1 HP enemy for 3 reports 1.
  var toHealth = Math.min(incoming, Math.max(0, this.health));
  var free = Math.min(this.healedHealth, toHealth);
  this.healedHealth -= free;
  var dealt = toHealth - free;

  // The scoreboard measures work the tower actually performed, not what that
  // work is worth to reward mechanics. This includes shield damage, damage to
  // healed health, and damage to a $0 Hive brood. Overkill remains excluded.
  this.lastDamageTaken = soaked + toHealth;

  this.health -= incoming;
  this.flash = 1;

  // Before the death test: a phase that grants a shield has to be able to fire
  // on the blow that would otherwise have been fatal, and a boss that drops
  // from 51% to dead in one hit still gets its roar.
  this.checkPhases();

  // B5's EXECUTION, and it is deliberately AFTER the blow rather than instead
  // of it. The brief says "lorsqu'un ennemi situe dans la portee est ATTAQUE",
  // so a body that walks through the field untouched is never executed; being
  // hit is what asks the question. The threshold is the higher of 10 HP and 5%
  // of the body's own maximum, which is why anything with a 10 HP maximum or
  // less dies to the first hit it takes in there.
  //
  // It takes the ORDINARY death path -- health to zero, then the same revive
  // test -- so a Revenant still gets up, the bounty is still paid once by the
  // sweep, and nothing about kill credit or effects needs to know this exists.
  if (this.health > 0 && typeof Farms !== "undefined" && Farms.executes(this)) {
    this.health = 0;
    this.executed = true;
  }

  if (this.health <= 0 && !this.tryRevive()) {
    this.dead = true;
  }

  // THE IMPACT SOUND. This is the one line of audio outside game.js, and it is
  // here rather than at the dozen places that swing because this function is
  // the single door every damage source in the game comes through -- the same
  // property that makes mitigation global. A hook at each caller would have
  // been a dozen chances to forget one.
  //
  // Presentation only and one-way, exactly like the Effects calls elsewhere in
  // this file: typeof-guarded, told and never asked, and it reads
  // `lastDamageTaken` (which was computed above for the scoreboard) rather
  // than making the sound recompute anything.
  //
  // A KILLING BLOW IS SILENT HERE. The death explosion fires from game.js's
  // end-of-life sweep a moment later and covers it; playing both put a thump
  // under every death that made the two run together.
  if (typeof Sound !== "undefined" && !this.dead) {
    Sound.playEnemyHit(this.lastDamageTaken);
  }

  // A no-bounty brood still reports no damage to reward-led mechanics, keeping
  // it from feeding Siphon charges or lifesteal while the brood itself pays $0.
  // TowerScore separately reads lastDamageTaken, so the tower's visible damage
  // counter still credits every point it removed from that brood.
  return this.noBounty ? 0 : dealt;
};

// The shield just went. Whatever the type says happens next, happens -- read
// out of the `shield.onBreak` block rather than switched on the type id, so
// the wave-35 boss can break into something else entirely without touching
// this function.
Enemy.prototype.breakShield = function () {
  this.shieldFlash = 1;
  // THE GAP OPENS HERE, and both of its ends are recorded in one place so they
  // cannot describe different windows. `supportTimer` is the time left until
  // this body's own pulse, so it IS the length of the gap -- for a body that
  // shields itself. For anything else the gap has no end this class knows
  // about (a Bulwark's shield never returns unless a Shieldbearer decides so),
  // and a zero says exactly that rather than inviting a division.
  this.shieldOut = true;
  var own = this.type.support;
  this.shieldGapSeconds =
    (own && own.pick === "self" && own.shield > 0) ? this.supportTimer : 0;
  // The heading, not the path, for the reason Enemy.prototype.draw's wake
  // gives: the index screen parks a body at a card position with `progress`
  // still 0, and anything derived from the path there is a line running off to
  // the mouth of the road. A body with no path at all breaks facing +x.
  var heading = (this.path && this.path.tangentAt)
    ? this.path.tangentAt(this.progress) : null;
  this.shieldBreakAt = {
    x: this.pos.x, y: this.pos.y,
    yaw: heading ? Math.atan2(heading.y, heading.x) : 0
  };
  // BEFORE the early return below, and outside it: "this body has stood without
  // its shield" is true of every shielded body whose pool has emptied, not only
  // of the ones whose type has something to say about it. A Hive's brood breaks
  // and carries no `onBreak` at all.
  this.shieldBroken = true;
  var onBreak = this.shieldOnBreak;
  if (!onBreak) return;
  if (onBreak.speedMultiplier) this.speedScale *= onBreak.speedMultiplier;
};

// HOW FAR THROUGH ITS SHIELD'S ABSENCE THIS BODY IS, as 0 -> 1, or -1 when
// there is no absence to be through.
//
// PRESENTATION ONLY. Nothing in the simulation reads it and nothing should:
// the shield is back when `supportAllies` says so, and this is the renderer's
// way of asking how close that is without knowing anything about support
// timers. The Vanguard's shattered mesh throws its shield fragments onto the
// road, lets them lie, and pulls them home again, and all three phases are
// shares of THIS number -- so the fragments cannot finish reassembling early or
// late, whatever the gap turns out to be. (The owner's brief is written against
// the full seven: "stay there for 3 seconds, then in the last 4 seconds, they
// start flying back". A break two seconds before the pulse gets the same
// picture in two seconds rather than a picture that lies about when the shield
// returns.)
//
// -1 AND NOT NULL, BECAUSE 0 IS A REAL ANSWER -- it is the frame the shield
// went -- and a caller writing `if (!t)` on a null would have thrown that frame
// away along with the nothing-to-draw case.
Enemy.prototype.shieldReformProgress = function () {
  if (!this.shieldOut || !(this.shieldGapSeconds > 0)) return -1;
  var left = Math.max(0, Math.min(this.shieldGapSeconds, this.supportTimer));
  return 1 - left / this.shieldGapSeconds;
};

// Has this enemy crossed a health threshold that changes what it is?
//
// A `phases` row is `{ atHealthFraction, shield, speedMultiplier,
// attackIntervalMultiplier, summon, announce | announceSuffix, announceDetail }`
// -- everything the boss's roar does, as data. Phases fire IN ORDER and ONCE: `phasesEntered` is a counter,
// not a set of flags, so an enemy healed back above a threshold cannot
// re-trigger one and a two-phase enemy that drops straight past both in a
// single hit enters both, in order.
//
// Called from takeDamage, after health has changed and before the death test.
Enemy.prototype.checkPhases = function () {
  var phases = this.type.phases;
  if (!phases) return;

  while (this.phasesEntered < phases.length) {
    var phase = phases[this.phasesEntered];
    if (this.health > this.maxHealth * phase.atHealthFraction) return;
    this.phasesEntered++;
    this.enterPhase(phase);
  }
};

Enemy.prototype.enterPhase = function (phase) {
  this.phaseFlash = 1;

  // A FLAT shield, unlike the ratio-sized ones on a type: this is 1000 points
  // conjured mid-fight, not armour the body was born wearing, so there is no
  // "its own health again" to scale off.
  if (phase.shield) {
    this.shieldMax += phase.shield;
    this.shield += phase.shield;
  }

  if (phase.speedMultiplier) this.speedScale *= phase.speedMultiplier;

  // A NEW ATTACK IN THE POOL. The boss's roar unlocks its leap, and from then
  // on it cycles: shot, leap, shot, leap.
  if (phase.addAttack) this.attacks = this.attacks.concat([phase.addAttack]);

  // COPIED, never mutated in place. The specs in `this.attacks` start as
  // references to the rows in Enemy.TYPES, which every enemy of this type
  // shares -- winding an interval down on one would permanently speed up every
  // future boss, including the one in the next run.
  if (phase.attackIntervalMultiplier) {
    var factor = phase.attackIntervalMultiplier;
    this.attacks = this.attacks.map(function (spec) {
      var copy = {};
      for (var key in spec) { if (spec.hasOwnProperty(key)) copy[key] = spec[key]; }
      copy.intervalSeconds = spec.intervalSeconds * factor;
      return copy;
    });
    this.attack = this.attacks[0] || null;
    // Do not let a half-spent long timer outlast the new short one.
    var soonest = this.attacks[this.attackIndex % this.attacks.length];
    if (soonest && this.attackTimer > soonest.intervalSeconds) {
      this.attackTimer = soonest.intervalSeconds;
    }
  }

  if (phase.summon) {
    var called = this.summon(phase.summon);
    this.pendingSpawns = this.pendingSpawns ? this.pendingSpawns.concat(called) : called;
  }

  // The title comes from ONE of two fields, and THE GUARD MUST TEST THE
  // COMPOSED RESULT, never either field alone. A guard on `phase.announce` by
  // itself goes false the moment a phase uses the suffix form, and the banner
  // then silently never fires -- nothing throws, nothing logs, and the only
  // symptom is a missing banner at the one moment in the campaign that has
  // one. That is the whole failure mode of this pair; keep them together.
  //
  // `announceSuffix` composes the title from the type's own displayName, so
  // the line survives a rename -- every name in the game is being replaced and
  // this one is not settled. It carries its own leading space and takes no
  // article, because a proper noun would read wrong with one.
  //
  // Both fields stay STRINGS. Enemy.TYPES is data -- every value in it is a
  // scalar, a string or a plain object -- and a callable in there would make
  // this call site handle two shapes forever. A phase that needs a wholly
  // custom line adds `announce` back, and the `||` prefers it.
  var title = phase.announce ||
    (phase.announceSuffix
      ? this.type.displayName.toUpperCase() + phase.announceSuffix
      : null);
  if (title && typeof Effects !== "undefined") {
    Effects.announce(title, phase.announceDetail || "");
  }
};

// Build the bodies a phase calls in. `spec.groups` is the SAME shape a wave's
// groups are (count / type / health), deliberately -- a summon is a wave that
// arrives from the middle of the map instead of from the gate, and reusing the
// shape means one thing to learn and one thing to read.
Enemy.prototype.summon = function (spec) {
  var out = [];
  var index = 0;

  for (var g = 0; g < spec.groups.length; g++) {
    var group = spec.groups[g];
    for (var i = 0; i < group.count; i++) {
      var e = new Enemy(this.path, group.health, group.type, {
        routeId: this.routeId,
        // A summon is a wave that arrives from the middle of the map, but it is
        // NOT a wave of its own: the bodies the wave-35 boss roars in are part
        // of wave 35, and the run is not won until they are dealt with.
        waveId: this.waveId
      });
      // The whole point of a summoned body: it runs. A multiplier on
      // `speedScale` rather than a different type, so a summoned Fast is a
      // Fast that is running, and the roster stays the roster.
      if (spec.speedMultiplier) e.speedScale *= spec.speedMultiplier;
      // Trailed behind the summoner for the same reason a Hive's brood is --
      // see spawnMinions. Otherwise twenty bodies share one progress value and
      // walk the rest of the map in a rank abreast.
      e.progress = Math.max(0, this.progress -
        ul(index * (spec.trailUl === undefined ? Enemy.BROOD_TRAIL_UL : spec.trailUl)));
      e.refreshPos();
      out.push(e);
      index++;
    }
  }
  return out;
};

// Health hit zero. Does this one get back up? Returns whether it did, so
// takeDamage can leave `dead` alone when it did.
//
// A rooted revenant CANNOT soft-lock a run, and the reason is structural
// rather than lucky: it comes back exactly where it fell, and it fell because
// something shot it there -- so a tower already covers that spot. The one way
// to strand one is to sell or lose that tower afterwards, and the answer to
// that is to build within reach of it, which the player can always do.
//
// THE SCHEDULE IS UNAFFECTED EITHER WAY, but the reason changed with the
// timeline (2026-08-26) and the old one -- "a break still ends on its 90 s
// ceiling whether or not the board is clear" -- named a break that no longer
// exists. The rule now: a rooted revenant wears the origin of the wave that
// brought it in (waveId, above), so that wave can never be closed by
// ELIMINATION again -- but it is still closed by its own `duration`, and by
// Send the moment the wave has finished arriving. Only the last wave has
// neither, and no wave 35 group and no phase of the boss's roar calls a
// revenant in, so the one gate that cannot be forced is also the one gate a
// revenant can never reach. What a stranded body does keep is the WIN: victory
// asks for an empty road, and it always has.
Enemy.prototype.tryRevive = function () {
  if (this.revivesLeft <= 0) return false;

  var spec = this.type.revive;
  this.revivesLeft--;
  this.revived = true;
  this.reviveFlash = 1;
  this.health = this.maxHealth * (spec.healFraction === undefined ? 1 : spec.healFraction);
  // A second life is a SCHEDULED one -- waveEffectiveHealth counts it and the
  // index prices it -- so it pays in full, unlike a Healer's top-up. Clearing
  // the healed pool is what says so: whatever regeneration this body was
  // carrying died with its first life.
  this.healedHealth = 0;
  if (spec.roots) this.rooted = true;
  return true;
};

// Push the enemy BACK along the path it walks, not backwards through 2D
// space -- following the route in reverse is the whole point (see the beam
// tower's death denial). Clamped to the start of the path.
Enemy.prototype.knockBack = function (distancePx) {
  this.progress = Math.max(0, this.progress - distancePx);
  this.refreshPos();
  this.leaked = false;
};

// Hover hit test. Uses the same RADIUS_PX the body is drawn with, so the
// target can never be somewhere other than what the player sees -- the same
// arrangement as Tower.containsPoint and its footprint.
//
// `flat` is FALSE on the 3D board, and the distinction is not cosmetic. In 2D
// the lift below is a SCREEN offset, so testing against it points at the body.
// In 3D the caller's point is on the GROUND PLANE -- the lift happens along an
// axis that point does not have -- so the same subtraction moves the target
// away from the road the enemy is actually on. At the old 1.15 radii that was
// a ten-pixel slip nobody reported; at a Wisp's 3.45 it is thirty, which is the
// whole body. Decided by the caller, the same way drawInspection decides its
// own `flat`, because this file must not know which renderer is running.
//
// Omitting the argument keeps the 2D reading, so every existing caller and
// every fixture that passes two arguments behaves exactly as before.
Enemy.prototype.containsPoint = function (x, y, flat) {
  var dx = x - this.pos.x;
  var dy = y - (flat === false ? this.pos.y : this.visualBodyY());
  var r = this.radiusPx() + Enemy.HOVER_PAD_PX;
  return dx * dx + dy * dy <= r * r;
};

// HOW FAR ABOVE ITS GROUND CONTACT THE BODY IS DRAWN, in pixels.
//
// `pos` remains the point where the enemy touches the path and where every
// gameplay distance is measured; only picking and drawing use this lift.
//
// ONE NUMBER, FOUR READERS. The 2D body, the 3D body (gl-world's bodyLift),
// the death burst and the hover test all have to agree about where a flier is,
// and they did not: 3D drew it on the tarmac while 2D lifted it by 1.15. A
// number retyped in four files is a number that gets raised in three of them.
//
// 3.45 rather than 1.15 since 2026-08-12, at the owner's request, and it is the
// height the Aether Wisp's own model was authored against. Measured on that
// model: 18.4 board px tall at its drawn scale of 0.85, taking the largest
// extent across all twelve animation frames rather than the rest pose, because
// the wings are what move. A Wisp's radius is 9.35 board px, so 1.15 radii is
// 10.7 px of clearance -- 0.58 body heights, a six-legged firefly skimming the
// tarmac -- and 3.45 radii is 32.3 px, or 1.75 body heights, which is air.
Enemy.FLIGHT_LIFT_RADII = 3.45;
Enemy.GROUND_LIFT_RADII = 0.48;

//
// AND A THIRD HEIGHT SINCE 2026-08-18, for a body that neither walks nor flies.
// A type carrying a `hover` block rides at its own `liftRadii` -- see the
// Healer's, which explains at length why that is a picture and not a targeting
// rule. Read from the type rather than added as a fourth class constant
// because, unlike the two above, it is not a claim about a CATEGORY of enemy:
// the Wisp's height is what flying looks like in this game and every flier will
// want it, while how far off the road one apparition drifts is a fact about
// that apparition.
Enemy.prototype.visualBodyLift = function () {
  var hover = this.type.hover;
  return this.radiusPx() *
    (this.isFlying ? Enemy.FLIGHT_LIFT_RADII
      : (hover ? hover.liftRadii : Enemy.GROUND_LIFT_RADII));
};

// Screen-space centre of the upright body, for the flat board. Flying bodies
// sit higher still -- see visualBodyLift for the single number both boards read.
Enemy.prototype.visualBodyY = function () {
  return this.pos.y - this.visualBodyLift();
};

Enemy.prototype.draw = function (ctx, options) {
  if (VisualModels.draw("enemy", this.typeId + ":complete", ctx, this, options)) return;
  var x = this.pos.x;
  var y = this.pos.y;

  // Body, flashing white when hit, starting from the type's own colour. A
  // slowed enemy is dragged towards blue by however hard it is slowed, so a
  // 65% slow reads much colder than a 15% one.
  var base = this.type.color;
  var chill = 1 - this.slowMultiplier;
  var f = this.flash;
  var r = Math.round((base.r + (255 - base.r) * f) * (1 - chill * 0.65));
  var g = Math.round((base.g + (255 - base.g) * f) * (1 - chill * 0.15));
  var b = Math.round(base.b + (255 - base.b) * f + (255 - base.b) * chill * 0.7);

  var radius = this.radiusPx();
  var bodyY = this.visualBodyY();

  // The path coordinate is the enemy's feet. A cast shadow at that point and
  // a lifted body centre are the two cues that turn the old coloured counter
  // into a creature standing in the three-quarter-view world.
  //
  // A BODY THAT IS NOT ON THE ROAD CASTS THE SOFT SHADOW, whether it is up
  // there because it flies or because it drifts. This reads `visualBodyLift`
  // rather than `isFlying` for exactly the reason that function now takes three
  // heights: the shadow is about where the body IS, and a hovering Healer that
  // kept a walker's tight, dark contact shadow would look like a thing standing
  // on stilts. The threshold is the ground lift itself, so nothing that walks
  // can cross it.
  var afloat = this.visualBodyLift() >
    this.radiusPx() * Enemy.GROUND_LIFT_RADII;
  Visuals3Q.shadow(ctx, x, y + 2, radius * (afloat ? 0.78 : 0.9),
    radius * 0.38, afloat ? 0.2 : 0.3,
    afloat ? radius * 1.8 : radius * 0.65);

  var customBody = VisualModels.draw("enemy", this.typeId + ":body", ctx, this, options);
  if (!customBody) {
  // Wings sit behind the body. Their position is cosmetic; pathing and target
  // eligibility still use the same centre as every other enemy.
  if (this.isFlying) {
    ctx.save();
    if (this.isCamo) ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(185,230,255,0.72)";
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.9, bodyY - radius * 0.1,
      radius * 0.9, radius * 0.42, -0.35, 0, Math.PI * 2);
    ctx.ellipse(x + radius * 0.9, bodyY - radius * 0.1,
      radius * 0.9, radius * 0.42, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // A camo body is drawn faded, because "why is nothing shooting it" has to be
  // answerable by looking at the board. Cosmetic only -- Targeting.sees is
  // what actually makes it untargetable.
  if (this.isCamo) ctx.globalAlpha = 0.5;

  // Dark lower lobe, then the lit upright body. The slight vertical stretch
  // keeps tiny enemies readable after their ground footprint becomes an
  // ellipse, while the upper-left highlight fixes the camera's light source.
  ctx.beginPath();
  ctx.ellipse(x, bodyY + radius * 0.18, radius * 0.96, radius * 0.9,
    0, 0, Math.PI * 2);
  ctx.fillStyle = "rgb(" + Math.round(r * 0.58) + "," +
    Math.round(Math.min(255, g) * 0.58) + "," +
    Math.round(Math.min(255, b) * 0.58) + ")";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(x, bodyY, radius, radius * 0.96, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgb(" + r + "," + Math.min(255, g) + "," + Math.min(255, b) + ")";
  ctx.fill();
  // Stroked at the sprite radius, so a thicker shell grows inwards and outwards
  // by half its width -- at the widest (5) that reaches 2.5 px past the body,
  // still inside the hover ring, which sits 9 px out at every size.
  ctx.lineWidth = this.type.outlineWidth;
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(x - radius * 0.3, bodyY - radius * 0.34,
    radius * 0.24, radius * 0.14, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,235,0.30)";
  ctx.fill();

  // Fractal Slime keeps one skin at every tier. The glassy highlight makes it
  // read as slime rather than another armored circle; the tier printed inside
  // makes a mixed generation understandable at a glance. Both scale with the
  // instance radius, so children are visibly smaller than their parent.
  if (this.type.fractal) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.28, bodyY - radius * 0.32,
      radius * 0.28, radius * 0.16, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(235,255,244,0.62)";
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.max(7, radius * 0.62) + "px system-ui, sans-serif";
    ctx.fillStyle = "rgba(13,64,47,0.82)";
    ctx.fillText("T" + this.fractalTier, x, bodyY + radius * 0.22);
    ctx.restore();
  }
  }

  ctx.globalAlpha = 1;

  // The camo marker: a dashed ring, drawn at full opacity so a faded body is
  // still easy to pick out of a crowd.
  if (this.isCamo) {
    ctx.beginPath();
    ctx.ellipse(x, bodyY, radius + 4, (radius + 4) * 0.96,
      0, 0, Math.PI * 2);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(190,255,205,0.75)";
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (this.isFlying) {
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.55, y + 3);
    ctx.lineTo(x + radius * 0.55, y + 3);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(150,220,255,0.8)";
    ctx.stroke();
  }

  // An attacker's swing, and only for the moment after it lands: a ring at
  // its actual reach, so what just got hit is obvious and so the radius is
  // something the player can see rather than infer. ul() because the reach is
  // a world distance like every other -- the ring has to grow with the map.
  //
  // Skipped for an attack that has its OWN feedback below (a beam to what it
  // shot, a shockwave where it landed) -- a reach ring on top of those is
  // noise, not information.
  //
  // And skipped for an attack with NO reach at all (the Tyrant's aimed shot
  // since 2026-07-30): a ring drawn at the whole map is not feedback, and
  // ul(undefined) is NaN, which canvas silently declines to draw anyway. Said
  // out loud here so the next person does not go looking for the missing ring.
  if (this.attack && this.attack.reachUl !== undefined &&
      this.attackFlash > 0 && !this.attackBeam && !this.shockwaveFlash) {
    ctx.beginPath();
    ctx.arc(x, y, ul(this.attack.reachUl) * (1.15 - this.attackFlash * 0.15),
      0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,140,90," + (0.75 * this.attackFlash).toFixed(3) + ")";
    ctx.stroke();
  }

  // WINDING UP. A ring that closes in on the body as the attack charges, so
  // "it has stopped and something is coming" is legible from across the board
  // and the player can count it down by eye.
  if (this.windUpTimer > 0 && this.windUpAttack) {
    var charge = 1 - this.windUpTimer / this.windUpAttack.windUpSeconds;  // 0 -> 1
    ctx.beginPath();
    ctx.arc(x, y, radius + 46 * (1 - charge) + 6, 0, Math.PI * 2);
    ctx.lineWidth = 2 + charge * 3;
    ctx.strokeStyle = "rgba(255,206,120," + (0.35 + charge * 0.6).toFixed(3) + ")";
    ctx.stroke();
  }

  // The aimed shot: a bolt from the body to whatever it picked, so the player
  // can see that it went for their best tower rather than their nearest.
  if (this.attackBeam) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(this.attackBeam.x, this.attackBeam.y);
    ctx.lineWidth = 2 + this.attackBeam.life * 3;
    ctx.strokeStyle = "rgba(255,196,120," + (0.85 * this.attackBeam.life).toFixed(3) + ")";
    ctx.stroke();
  }

  // The leap's landing: a shockwave at its real radius, so what it caught is
  // something the player saw rather than inferred from a tower going quiet.
  if (this.shockwaveFlash > 0 && this.lastBlastRadiusUl) {
    ctx.beginPath();
    ctx.arc(x, y, ul(this.lastBlastRadiusUl) * (1 - this.shockwaveFlash * 0.55),
      0, Math.PI * 2);
    ctx.lineWidth = 3 + this.shockwaveFlash * 4;
    ctx.strokeStyle = "rgba(255,160,110," + (0.85 * this.shockwaveFlash).toFixed(3) + ")";
    ctx.stroke();
  }

  // WORTH SOMETHING TO A PATH-B FARM: the same solid green ring the 3D board
  // draws (see gl-world), so the two boards say the same thing about the same
  // body. Costs one length test inside `killBonusAt` when no farm is placed.
  if (typeof Farms !== "undefined" && Farms.killBonusAt(x, y)) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 8, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(150,225,160,0.85)";
    ctx.stroke();
  }

  // STUNNED: a broken ring that does not turn, plus a bright flash on the
  // moment it lands. Deliberately a different shape from the frost ring rather
  // than a different colour -- a whole map going still at once has to be
  // readable in one glance, and after the earthquake's three seconds every one
  // of these bodies is also slowed, so the two cues are on screen together.
  if (this.stunTimer > 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 6 + this.stunFlash * 6, 0, Math.PI * 2);
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(255,232,150," + (0.6 + this.stunFlash * 0.4).toFixed(3) + ")";
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Frost ring while the slow is active, so the timer is visible and not just
  // inferred from the colour. DERIVED from the sprite radius, like the hover
  // ring in containsPoint: the two used to be hand-tuned constants (15 and 20)
  // that only cleared each other at one fixed body size. Written as +4 and +9
  // they clear each other by 5 px at every size -- and at the original radius
  // of 11 they are still exactly 15 and 20.
  if (this.slowTimer > 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(140,210,255,0.85)";
    ctx.stroke();
  }

  // The shield, while it holds: four separated field panels around the body,
  // thickest when full.  A complete opaque-looking bubble buried the model --
  // especially on a crowd of Swarm -- so the gaps deliberately leave most of
  // the silhouette untouched.  Authored shield variants add compact projector
  // hardware beneath this field; fallback models still get the same readable
  // status language. The gold expansion is used both when a shield arrives
  // and when it breaks, making the state change visible without becoming a
  // second body. Frost stays a separate circular ring at the feet.
  if (this.shieldMax > 0 && (this.shield > 0 || this.shieldFlash > 0)) {
    var held = this.shieldMax > 0 ? this.shield / this.shieldMax : 0;
    var shieldPulse = this.shieldFlash;
    var fieldX = radius * 1.25 + 6;
    var fieldY = radius * 1.85 + 7;
    var fieldCentreY = bodyY - radius * 0.08;
    var fieldSegments = [
      [-1.42, -0.24],
      [0.24, 1.42],
      [1.72, 2.90],
      [3.38, 4.56]
    ];
    ctx.save();
    ctx.lineCap = "round";

    // Keep the steady cyan field underneath a grant flash. If the pulse
    // temporarily REPLACED it, gold would fade almost to transparent and the
    // next frame would pop abruptly back to full cyan. On break there is no
    // steady layer because the shield pool is already empty, so gold alone
    // can expand and disappear cleanly.
    if (this.shield > 0) {
      ctx.lineWidth = 1.1 + held * 1.5;
      ctx.strokeStyle = "rgba(150,225,245," +
        (0.28 + held * 0.42).toFixed(3) + ")";
      for (var steadyPart = 0; steadyPart < fieldSegments.length;
          steadyPart++) {
        ctx.beginPath();
        ctx.ellipse(x, fieldCentreY, fieldX, fieldY, 0,
          fieldSegments[steadyPart][0], fieldSegments[steadyPart][1]);
        ctx.stroke();
      }
    }

    if (shieldPulse > 0) {
      ctx.lineWidth = 1.1 + held * 1.5 + shieldPulse * 0.8;
      ctx.strokeStyle = "rgba(255,240,180," +
        (0.82 * shieldPulse).toFixed(3) + ")";
      for (var pulsePart = 0; pulsePart < fieldSegments.length; pulsePart++) {
        ctx.beginPath();
        ctx.ellipse(x, fieldCentreY,
          fieldX + shieldPulse * 5, fieldY + shieldPulse * 6, 0,
          fieldSegments[pulsePart][0], fieldSegments[pulsePart][1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // A revenant that has already used its second wind: a dashed inner ring, so
  // "this one is not coming back again" is readable off the board rather than
  // remembered. The flash is the moment it stood back up.
  if (this.revived) {
    ctx.beginPath();
    ctx.arc(x, y, radius - 3 + this.reviveFlash * 8, 0, Math.PI * 2);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,236,170," + (0.5 + this.reviveFlash * 0.5).toFixed(3) + ")";
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // The roar: three rings going out, slower and much wider than a brood's, so
  // the moment the fight changes is unmistakable even off to one side of the
  // screen. Drawn before the body, so the body stays legible through it.
  if (this.phaseFlash > 0) {
    for (var ring = 0; ring < 3; ring++) {
      var age = this.phaseFlash - ring * 0.18;
      if (age <= 0) continue;
      ctx.beginPath();
      ctx.arc(x, y, radius + (1 - age) * 150, 0, Math.PI * 2);
      ctx.lineWidth = 3 * age;
      ctx.strokeStyle = "rgba(255,150,110," + (0.65 * age).toFixed(3) + ")";
      ctx.stroke();
    }
  }

  // A hive dropping a brood: one expanding ring, so five bodies appearing at
  // once reads as something the big one did.
  if (this.spawnFlash > 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius + (1 - this.spawnFlash) * 26, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(150,230,190," + (0.7 * this.spawnFlash).toFixed(3) + ")";
    ctx.stroke();
  }

  // THE TETHERS, drawn UNDER the pulse ring below so a cord never crosses the
  // mark that says where it came from.
  //
  // Each one runs from this body's own lifted centre to its target's, so a cord
  // to a Healer (which floats) and a cord to a zombie (which does not) both
  // land on the body rather than on the patch of road under it. `visualBodyY`
  // is asked of the TARGET rather than derived here for the same reason it
  // exists at all: one function decides how high a body is drawn.
  //
  // It grows for the first fifth of its life and fades over the rest -- a cord
  // that is thrown and then lets go, not a beam somebody holds. The white core
  // is the same grammar every other beam in this game uses (see gl-world's
  // `beam`), and it is what stops a thin cyan line disappearing against the
  // blue-grey road.
  var links = this.supportLinks;
  var spec = this.type.support;
  if (links.length && spec && spec.tether) {
    var tc = spec.tether.color;
    var rgb = tc.r + "," + tc.g + "," + tc.b;
    // A BOW WHEN THE SPEC ASKS FOR ONE. `arc` is a fraction of the span, and a
    // spec without it draws the straight cord this always drew -- which keeps
    // the Healer's mark unchanged and gives the Shieldbearer the lobbed one it
    // now asks for. Both boards read the same field off the same type row, so
    // the flat fallback and the 3D board make the same claim about the same
    // pulse; only the space they draw it in differs.
    var arc = spec.tether.arc || 0;
    var chips = spec.tether.chips || 0;
    for (var ti = 0; ti < links.length; ti++) {
      var lk = links[ti];
      var reach = Math.min(1, (1 - lk.life) / 0.2);
      var alpha = Math.min(1, lk.life / 0.7);
      var endX = lk.target.pos.x;
      var endY = lk.target.visualBodyY();
      var bow = arc && Math.hypot(endX - x, endY - bodyY) * arc;
      // The curve as a point list, so the stroke and the chips travelling it
      // are the same curve rather than two that have to be kept in step.
      var at = function (t) {
        return { x: x + (endX - x) * t,
                 y: bodyY + (endY - bodyY) * t - bow * 4 * t * (1 - t) };
      };
      ctx.lineCap = "round";
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.moveTo(x, bodyY);
        for (var s = 1; s <= 12; s++) {
          var p = at(reach * s / 12);
          ctx.lineTo(p.x, p.y);
        }
        ctx.lineWidth = (pass ? 1.6 : 4.5) * alpha;
        ctx.strokeStyle = pass
          ? "rgba(235,255,255," + (0.85 * alpha).toFixed(3) + ")"
          : "rgba(" + rgb + "," + (0.30 * alpha).toFixed(3) + ")";
        ctx.stroke();
      }
      ctx.lineCap = "butt";
      // The shields going out, spread along the flight behind the leading one.
      for (var ci = 0; ci < chips; ci++) {
        var lead = ci / Math.max(1, chips) * 0.55;
        var where = reach - lead;
        if (where <= 0 || where > 1) continue;
        var cp = at(where);
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, (3.4 - ci * 0.6) * alpha, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + rgb + "," + (0.8 * alpha).toFixed(3) + ")";
        ctx.fill();
      }
    }
  }

  // A SUPPORT PULSE going out. Wide and slow, like the brood ring above and
  // for the same reason: ten bodies gaining a shield at once has to read as
  // something one enemy did, or the player has no idea what to shoot.
  if (this.supportFlash > 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius + (1 - this.supportFlash) * 64, 0, Math.PI * 2);
    ctx.lineWidth = 2 + this.supportFlash * 2;
    ctx.strokeStyle = "rgba(170,225,255," + (0.75 * this.supportFlash).toFixed(3) + ")";
    ctx.stroke();
  }

  // Being HEALED: a green ring while the regeneration runs, so a health bar
  // going the wrong way is something the player saw a cause for. Drawn while
  // the timer is live rather than only on the tick, because the effect lasts
  // four seconds and outlives the Healer that granted it.
  if (this.healTimer > 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 5 + this.healFlash * 3, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(130,240,160,0.9)";
    ctx.stroke();
  }

  // SPRINTING: a short wake behind the body, drawn back along the road, so
  // "this one is moving faster than anything you have seen" is legible at a
  // glance rather than inferred from it arriving early. It stops the moment
  // the sprint does, which is the whole point -- the player can see where the
  // opening burst ends.
  //
  // Drawn from the road's HEADING rather than from positionAt(progress - n):
  // the index screen parks a sprite at an arbitrary card position while its
  // `progress` still says 0, and a wake computed from the path would then be a
  // stray line running from the card off to the mouth of the road.
  if (this.isSprinting()) {
    var heading = this.path.tangentAt(this.progress);
    var wake = ul(26);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - heading.x * wake, y - heading.y * wake);
    ctx.lineWidth = radius * 0.9;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,200,120,0.35)";
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  // BARS ARE OFF THE SPRITE NOW, AND OPT-IN.
  //
  // Every enemy used to wear its own bar permanently. At one or two bodies
  // that is fine; at swarm density -- thirty specks at 0.55 scale, each with a
  // 26 px MINIMUM-width bar over it -- the bars overlap into a solid green
  // ribbon and the only thing on screen is the health bars, not the enemies
  // they belong to. The information is rarely wanted in bulk either: a player
  // reads one enemy's health while deciding about that enemy, not thirty at
  // once.
  //
  // So the live game draws none, and the readout moved into the hover panel
  // (drawEnemyHover in js/game.js) where the number and the bar are ONE
  // element rather than two things in two places. `showBars` is kept as an
  // opt-in for anything that wants the old behaviour -- an index portrait, a
  // future replay view -- and `hideBars` still wins over it, so no existing
  // caller can be surprised by the new default.
  if (!options || !options.showBars || options.hideBars) return;

  // Health bar. Wide enough to span the body it belongs to, never narrower
  // than the 26 px the three original types have always used.
  var w = Math.max(26, radius * 2 + 4);

  // ABOVE THE HEAD OF WHATEVER IS ACTUALLY DRAWN. The built-in body is a
  // circle of `radius` around the lifted centre, so `bodyY - radius` is its
  // crown -- but a skin pack can draw something several times taller, and a
  // bar pinned to the built-in geometry ends up buried in the sprite's chest.
  // The renderer is the only thing that knows how tall it drew, so it
  // publishes a `topY` measurement and this asks for it, falling back to the
  // built-in crown when no pack is installed.
  //
  // Measurement only. Nothing here changes the hit box, the claim distance or
  // the hover ring -- those still come from radiusPx, which is the whole
  // reason the two are separate numbers.
  var crown = VisualModels.metric("enemy", this.typeId + ":body", "topY",
    this, bodyY - radius);
  var top = crown - 12;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - w / 2, top, w, 5);
  var frac = Math.max(0, Math.min(1, this.health / this.maxHealth));
  ctx.fillStyle = "#61d973";
  ctx.fillRect(x - w / 2, top, w * frac, 5);

  // Shields get their OWN bar, stacked above the health one, rather than a
  // share of a combined bar. Two pools that empty in sequence read wrongly as
  // one -- "half health left" would mean full health behind half a shield --
  // and it is the health bar the player is used to reading at a glance.
  if (this.shieldMax > 0) {
    var sTop = top - 6;
    var sFrac = Math.max(0, Math.min(1, this.shield / this.shieldMax));
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - w / 2, sTop, w, 4);
    ctx.fillStyle = "#8fdcf0";
    ctx.fillRect(x - w / 2, sTop, w * sFrac, 4);
  }
};
