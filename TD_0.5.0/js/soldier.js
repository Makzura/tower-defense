// ---------------------------------------------------------------------------
// Soldier -- the RIFLEMAN
//
// The CONSTRUCTOR is still called Soldier and the save id is still "soldier".
// Only the display name and the artwork changed (2026-07-30, the robot
// fantasy/magic reskin; shortened to "Rifleman" on 2026-08-01). Both of those
// strings are load-bearing in ways the
// display name is not: `Soldier.ID` is a PERSISTENCE FORMAT (js/meta.js), and
// the catalogue looks the constructor up by the global name "Soldier"
// (MetaProgress.constructorOf). Renaming either un-owns the tower for every
// existing player or breaks the armoury outright. DISPLAY_NAME is the one
// string that is purely cosmetic, so it is the one string that moved.
//
// The game's primary starter unit: reliable in the early waves.
// It is NOT a retuned gunner.
//
// What makes it different from the gunner is the BURST. A gunner fires one
// bullet a second forever; a Soldier fires a fixed number of shots in quick
// succession and then pauses. The two paths take that shape in opposite
// directions:
//
//   path A  tightens the burst -- more shots, less space between them, a
//           shorter pause, and eventually more damage per shot. It is a burst
//           weapon all the way to A5.
//   path B  ABANDONS the burst at B3 and buys utility around a steady rifle --
//           reach, hit points, damage, camo detection, defence pierce,
//           recruits, and finally a heavy automatic (2026-07-30)
//
// THE CYCLE IS MEASURED FROM ONE BURST'S START TO THE NEXT, not from the last
// shot of a burst. That is what makes the DPS arithmetic the owner specified
// come out exactly:
//
//   base   3 shots x 1 dmg / 1.2   s = 2.5 DPS
//   A5     5 shots x 8 dmg / 34/60 s = 70.6 DPS   (0.6 s and 66.7 until
//                                                  2026-08-12)
//
// It comes out exactly only because every period in the table is a whole
// number of 1/60 s steps -- the clock cannot deliver anything else. See the
// note on A3-A5 for why A5's is written as a fraction.
//
// The shot spacing is therefore a shape, not a cost: it decides how bunched a
// burst is, never how often one happens. Every tier in the table below keeps
// (shots - 1) x spacing comfortably under the cooldown, so a burst always
// finishes before the next one is due.
//
// AUTOMATIC FIRE (B3) is the same rate with the shape taken out. Its rate is
// DERIVED from the burst it replaces -- BASE_SHOTS_PER_BURST /
// BASE_BURST_COOLDOWN, i.e. 2.5 shots a second -- so switching modes costs and
// gains exactly nothing by construction, and B3's real payment is its +1
// damage. Everything downstream asks attacksPerSecond(), which is the ONE
// place either model becomes a rate, so the panel, the hover cards, the codex
// and the boss's "highest DPS on the board" all read a stable rifle correctly
// without knowing the mode exists.
//
// Like the Smasher, every stat is DERIVED from the upgrade flags in
// recalcStats(), so no level can drift from the table it came from and the
// order upgrades were bought in cannot matter.
// ---------------------------------------------------------------------------

function Soldier(x, y, path) {
  this.x = x;
  this.y = y;

  // HOW HIGH THE GROUND UNDER IT IS, read once, at construction. Zero on dirt.
  // This one number is the whole of elevation: RangeFilter reads it to decide
  // what this tower can see over, bullet.js reads it to decide what its rounds
  // fly over, and elevatedRangePx reads it for the reach bonus.
  this.groundHeight = groundHeightUnder(x, y);

  // Firing priority along the path, same rule as every other tower.
  this.pathProgress = path.progressAtPoint(x, y);

  // Kept so the recruit ability has a road to march down. Recruits walk the
  // route backwards from its end, which is a path question, not a tower one.
  this.path = path;

  this.name = Soldier.DISPLAY_NAME;

  // `cost` is the build price and never moves; `totalSpent` is everything sunk
  // in and is what a sale refunds half of. Both spelled the way every other
  // tower spells them -- see the note in js/tower.js.
  this.cost = Soldier.COST;
  this.totalSpent = Soldier.COST;

  // The gunner's footprint, deliberately: a Soldier is meant to stand wherever
  // a gunner could, so swapping one for the other never fails on clearance.
  this.footprintRadiusUl = Soldier.FOOTPRINT_RADIUS_UL;
  this.footprintPx = ul(this.footprintRadiusUl);

  // Upgrade flags, listed explicitly rather than built from the table, so
  // reading the constructor tells you the whole state of a Soldier.
  this.hasA1 = false;
  this.hasA2 = false;
  this.hasA3 = false;
  this.hasA4 = false;
  this.hasA5 = false;
  this.hasB1 = false;
  this.hasB2 = false;
  this.hasB3 = false;
  this.hasB4 = false;
  this.hasB5 = false;

  this.aim = -Math.PI / 2;

  // The three timers the burst runs on.
  //
  //   cooldown        until the NEXT burst may begin, counted from the last
  //                   burst's start
  //   shotTimer       until the next shot inside the burst in progress
  //   burstShotsLeft  how many shots that burst still owes
  //
  // Zero on all three means "ready to open a burst the moment something walks
  // into range", which is where a freshly placed tower should be.
  this.cooldown = 0;
  this.shotTimer = 0;
  this.burstShotsLeft = 0;

  this.targeting = "first";

  // Recruits (B5). They live on the tower rather than in a global list, so
  // there is no new run-scoped array for restartGame() to forget: clearing
  // `towers` clears them, exactly as it clears everything else a tower owns.
  // The trade is that recruits go with the tower that called them -- see
  // callRecruits().
  this.recruits = [];
  this.recruitPending = [];        // seconds until each staggered spawn
  this.recruitCooldown = 0;

  TowerHealth.init(this, Soldier.BASE_HP);
  this.showRange = false;

  TowerScore.init(this);

  this.recalcStats();
}


// Cosmetic only -- see the note at the top of this file for why the id and the
// constructor name did NOT follow it.
// Shortened from "Automaton Rifleman" on 2026-08-01, at the owner's request.
// The same rule the reskin followed applies: only this string moved, because
// only this string is cosmetic.
Soldier.DISPLAY_NAME = "Rifleman";
Soldier.COST = 300;

// Stable id for the meta catalogue and save data -- a PERSISTENCE FORMAT, so
// renaming it un-owns the tower for every existing player. See js/meta.js.
Soldier.ID = "soldier";

Soldier.BASE_DAMAGE = 1;             // per shot
Soldier.BASE_SHOTS_PER_BURST = 3;
Soldier.BASE_SHOT_SPACING = 0.15;    // seconds between shots inside a burst
Soldier.BASE_BURST_COOLDOWN = 1.2;   // seconds from one burst's start to the next
Soldier.BASE_RANGE_UL = 100;         // the reference range -- same as the gunner

// The rate B3's automatic fire runs at, DERIVED from the burst it replaces
// rather than typed in: three shots every 1.2 s IS 2.5 shots a second, so
// "stop bursting and just fire steadily" changes the shape of the fire and not
// one point of DPS. Declaring 2.5 here as a literal would be a second number
// free to drift away from the burst's, and the whole point of the tier is that
// it does not.
Soldier.BASE_AUTO_SHOTS_PER_SECOND =
  Soldier.BASE_SHOTS_PER_BURST / Soldier.BASE_BURST_COOLDOWN;

// A little over the gunner's 60 AS PLACED: it survives four Angry swings
// (20 each) rather than three, which is what the unit the player is meant to
// still be building at wave 20 needs out of the box.
//
// Every tier now adds to it (2026-08-01), so a finished Rifleman stands on 380
// (path A) or 505 (path B) -- see the note on the upgrade table.
Soldier.BASE_HP = 80;

// The gunner's, so a Soldier packs against the road and against neighbours
// exactly as a gunner does.
Soldier.FOOTPRINT_RADIUS_UL = Tower.FOOTPRINT_RADIUS_UL;


// --- the upgrade table ------------------------------------------------------
//
// Two branches under the same crosspath rule as the Smasher and the Longshot:
// tier 3 on either branch locks the other at tier 2, forever.
//
// PATH A CARRIES ABSOLUTE VALUES, path B carries deltas. That split is not
// arbitrary -- it is what the owner's tables actually say. A3's "2 damage per
// shot" is the damage a Soldier at A3 HAS, not two on top of what it had; B2's
// "+1 damage" is an addition. So:
//
//   damage / shots      the LARGEST owned value wins       (path A only)
//   spacing / cooldown  the SMALLEST owned value wins      (path A only)
//   damageDelta         every owned delta is added ON TOP  (path B only)
//   rangeUl / hp        every owned delta is added
//
// `damage` and `damageDelta` are two spellings of one stat ON PURPOSE, and the
// alternative was worse. Path B gained damage tiers on 2026-07-30, and folding
// them into `damage` would have meant either rewriting path A's table into
// deltas -- losing the property that a retune of A3 alone means what it looks
// like -- or letting Math.max swallow them, so that a B2 bought behind A5's 3
// damage would silently do nothing. Two named channels, summed once at the end
// of recalcStats, keep both rules intact and make which one a row uses visible
// in the row itself.
//
//   locksPath  owning this shuts the other branch out of its tier-3+ upgrades
//   requires   the tier below it on the SAME branch; tiers are bought in order
//   automatic  ends the burst; the tower fires steadily from here on
//   fireRate   shots per second added to the AUTOMATIC rate. Contributed by
//              path A's first two tiers as well as by B5 -- see below.
//
// **WHY A1 AND A2 CARRY `fireRate`** (2026-07-30). The owner: *"a1 and a2 gives
// attack speed and tightens the burst but doesn't affect b3 attack speed
// basically rendering them useless for b path, so make it that each upgrade
// gives +0.25/s to b path."*
//
// He is right, and it was a hole in the crosspath. A1 and A2 buy their attack
// speed as `shots`/`spacing`/`cooldown` -- the shape of a BURST -- and B3 throws
// the burst away for a flat 2.5 shots a second. So a B-path Rifleman that had
// spent $400 on A1 and A2 got nothing at all for it the moment B3 landed. Each
// of them now also adds **+0.25 to the automatic rate**, which is the same
// purchase paying out in whichever firing model the tower ends up in.
//
// Only A1 and A2 can ever apply it: A3 carries `locksPath`, so a tower holding
// A3 or above can never own B3 and therefore can never be automatic. The rows
// below A2 deliberately do NOT carry `fireRate` -- it would be a number that
// cannot be reached, which is worse than an absent one.
// **EVERY TIER CARRIES HP** since 2026-08-01, at the owner's instruction, and
// the split between the branches is the branches' own character: path A is the
// burst weapon and buys the smaller share (+300 across five tiers, 80 -> 380),
// path B is the utility/durability branch and buys the larger (+425, 80 ->
// 505). Only B2 used to carry any at all, which made "how long does this thing
// live" a question the tower answered once and then never again.
//
// **PRICES WERE RESCALED** in the same pass, to the money-per-DPS band the
// Siphon and the Arcane Sniper set (see The economy in AGENTS.md). Those two
// cost roughly $70-$140 for every point of DPS a finished path produces --
// the Sniper's path A is $20 250 for 300 DPS, the Siphon's is $33 800 for 250
// ramped -- and the Rifleman was selling its 66.7 DPS path A for $3 000, i.e.
// $45. Both paths now land at about $100 per finished DPS:
//
//   path A  $300 + $6 400 = $6 700 for 70.6 DPS   ($95 / DPS since the
//                                                  2026-08-12 burst-clock pass;
//                                                  it was 66.7 and $100)
//   path B  $300 + $7 200 = $7 500 for ~79 DPS    ($95 / DPS, recruits and
//                                                  defence pierce counted in)
//
// The two land on the SAME money-per-DPS on purpose (2026-08-12). They are not
// meant to be ranked against each other on one number -- see the note on A3-A5.
//
// The BUILD price is deliberately untouched at $300: `STARTING_CASH` is 600
// precisely so the opening buys two of these, and that pair is a documented
// invariant of the first two waves.
//
// TACTICAL TIERS PAY A PREMIUM, which is the other half of the owner's
// instruction. B3 buys camo detection, B4 buys defence pierce AND the recruit
// ability, and A4 is the tier where the burst becomes a real weapon -- each is
// priced above what its raw DPS delta alone would justify.
Soldier.UPGRADES = [
  { id: "A1", branch: "A", cost: 200,  damage: 1, shots: 3, spacing: 0.13, cooldown: 1.1,
    fireRate: 0.25, hp: 20 },
  { id: "A2", branch: "A", cost: 325, damage: 1, shots: 4, spacing: 0.11, cooldown: 1.0,
    fireRate: 0.25, hp: 30, requires: "A1" },
  // A3-A5 CARRY RANGE AND A TIGHTER BURST CLOCK since 2026-08-12, at the
  // owner's instruction: *"keep the A path just as cheap, but give it a bit
  // more range upgrade from a3 to a5, and a bit more DPS from a3 to a5, without
  // making it broken nor changing the price."*
  //
  // **THE RANGE IS NEW, NOT BIGGER.** Path A had NO range upgrade at all --
  // 100 u.l. at build and 100 u.l. at a finished A5, measured at every tier
  // against B1's +25 as a control. B1 was the only row in this table carrying a
  // `rangeUl` key. So the engagement window was the same 3.9 s at A5 as at
  // build, and every tier bought density inside a window it could not widen.
  // +5 u.l. a tier takes a finished path A to 115 u.l., which is DELIBERATELY
  // STILL SHORT OF B1's 125: on a PURE path A, reach stays path B's stat,
  // bought at tier one for $200, and $5 875 of path A tiers still does not buy
  // as much of it.
  //
  // **BUT IT DOES NOT STAY B's STAT ON A CROSSPATH, AND THAT IS A REAL
  // CONSEQUENCE OF THIS CHANGE.** `rangeUl` is a DELTA channel here --
  // recalcStats does `this.rangeUl += u.rangeUl` -- so B1's +25 and A3-A5's +15
  // STACK. Measured by bisecting the tower's own picker, before and after:
  //   A3+B1        $1 725   125 -> 130 u.l.
  //   A4+B1+B2     $3 975   125 -> 135 u.l.
  //   A5+B1+B2     $7 250   125 -> 140 u.l.
  //   B1..B5       $7 500   125 -> 125 u.l.  (path B is untouched)
  // Before this change 125 u.l. was a HARD CEILING for every Rifleman at every
  // price; it is now beaten for $1 725, and the longest reach in the tower is a
  // crosspath rather than a finished path B. The owner did not ask for that and
  // has not ruled on it -- it is asserted in tests/content.test.js so it cannot
  // drift silently, and it is on his desk. Holding the old ceiling would mean
  // giving this table the Smasher's `Math.max` range semantics (js/smasher.js)
  // and rewriting B1's +25 as an absolute 125, which is a change to a path B
  // row that he did not authorise.
  //
  // **THE DPS IS BOUGHT WITH THE BURST CLOCK, NOT WITH DAMAGE PER SHOT**, and
  // that is measured rather than stylistic. An 8-damage A5 shot into the 4 HP
  // body the game actually sends has half of it clamped away by
  // Enemy.lastDamageTaken, so A5's advertised 66.7 DPS was 33.3 in real play
  // and MORE damage per shot would have been very nearly invisible. Shortening
  // the burst period pays out in full against every body on the road.
  // THESE ARE MEASURED FIGURES, timed off the tower's own burst openings and
  // not damage x shots / cooldown:
  //   A3  0.90 -> 0.85     s   8.89 -> 9.41 DPS
  //   A4  0.80 -> 0.75     s  25.00 -> 26.67 DPS
  //   A5  0.60 -> 34/60    s  66.67 -> 70.59 DPS  (33.3 -> 35.3 effective)
  // The burst still fits inside the period at every tier (A5 is 5 shots of
  // 0.07 s spacing = 0.28 s inside 0.567 s), so this tightens the rhythm
  // without turning the weapon into a steady rifle -- A5 is idle over half the
  // time, and its 40-damage alpha strike is untouched.
  //
  // **A5's PERIOD IS WRITTEN `34 / 60`, AND THAT IS NOT DECORATION.** `cooldown`
  // is set to `burstCooldown` and then decremented by FIXED_STEP once a step,
  // and the burst reopens on `cooldown <= 0` -- so the realised period is
  // ALWAYS a whole number of 1/60 s steps, whatever the table says. Every other
  // row happens to land on one exactly (1.2 -> 72 steps, 1.1 -> 66, 1.0 -> 60,
  // 0.9 -> 54, 0.85 -> 51, 0.8 -> 48, 0.75 -> 45, 0.6 -> 36), which is why the
  // panel's `shots / cooldown` has always printed the truth here.
  //
  // A plain `0.55` would have BROKEN that. It does not land on 33 steps:
  // thirty-three sequential subtractions of 1/60 come to 0.5499999999999999 and
  // leave a positive residue, so the burst opens on step 34 for a real period of
  // 0.566667 s -- while the shop card, the upgrade preview and the inspection
  // panel all divide by the 0.55 in the table and print 72.7 DPS and 9.09
  // shots/s against a tower delivering 70.6 and 8.82. MEASURED, both ways, by
  // timing the tower's own burst openings: 0.55 and 34/60 are the SAME 34 steps
  // and the SAME 70.6 DPS, and only 34/60 says so out loud.
  //
  // There is no two-decimal value between 0.50 and 0.60 that realises exactly
  // (0.54 declares 74.07 and delivers 72.73; 0.56 declares 71.43 and delivers
  // 70.59; the whole range was scanned), so the choice was a truthful fraction
  // or a card that overstates. If this row is ever retuned again, TIME THE
  // PERIOD -- do not divide -- and prefer `n / 60`.
  //
  // A1 AND A2 ARE DELIBERATELY NOT TOUCHED. The owner's "cheap early game DPS"
  // role is carried by the $300 BUILD price, not by those tiers, and both of
  // them also feed path B through `fireRate` -- a change there would be a
  // crosspath change he did not ask for.
  { id: "A3", branch: "A", cost: 700, damage: 2, shots: 4, spacing: 0.10, cooldown: 0.85,
    rangeUl: 5, hp: 50, requires: "A2", locksPath: true },
  // A4 and A5 were retuned up on 2026-07-30 (A4 2 -> 4 damage; A5 3 -> 8 damage
  // and 0.7 -> 0.6 s between bursts), which is what stops the rebuilt path B
  // dominating this one -- see The paths in AGENTS.md.
  { id: "A4", branch: "A", cost: 1900, damage: 4, shots: 5, spacing: 0.08, cooldown: 0.75,
    rangeUl: 5, hp: 80, requires: "A3", locksPath: true },
  { id: "A5", branch: "A", cost: 3275, damage: 8, shots: 5, spacing: 0.07, cooldown: 34 / 60,
    rangeUl: 5, hp: 120, requires: "A4", locksPath: true },

  { id: "B1", branch: "B", cost: 200,  rangeUl: 25, hp: 25 },
  { id: "B2", branch: "B", cost: 350, hp: 40, damageDelta: 1, requires: "B1" },
  { id: "B3", branch: "B", cost: 750, seesCamo: true, automatic: true, damageDelta: 1,
    hp: 70, requires: "B2", locksPath: true },
  // B4's pierce moved from ARMOR to DEFENCE on 2026-07-30, at the owner's
  // instruction: *"change armor pierce to instead of bypassing blindage,
  // bypasse armor and change the boost from b4 to 10, so basically an enemy
  // with 20% A armor should take 20% less damage but takes only 10% less."*
  //
  // In this codebase `armor` is the FLAT subtraction and `defense` is the
  // PERCENTAGE (see js/systems/mitigation.js) -- the owner's "blindage" and
  // "armor" respectively. So the tier used to strip 6 flat and now strips **10
  // percentage points of defense**: an Armored enemy's 20% becomes 10%.
  //
  // It is clamped at zero in Mitigation, so an enemy with no defence at all
  // takes exactly normal damage rather than bonus damage. That clamp was
  // explicitly asked for and there is a test on it.
  { id: "B4", branch: "B", cost: 2100, defenseFlatPierce: 10, damageDelta: 2,
    hp: 110, recruits: true, requires: "B3", locksPath: true },
  // B5 takes the rifle to 20 damage flat (1 base + 1 + 1 + 2 + 15), which is
  // the owner's figure rather than a derivation.
  //
  // It NO LONGER SHORTENS THE RECRUIT COOLDOWN. Both tiers now call at the
  // same 45 s (2026-08-01, at the owner's instruction: "make the recruits
  // cooldown of both b4 and b5 45sec"), so what B5 buys is a bigger, harder
  // squad rather than a more frequent one. The field is still written out
  // explicitly rather than left off, because `recruitBoost` is read as a
  // complete replacement and a missing key here would be a silent inheritance
  // rather than a stated equality.
  // No `fireRate` here: B5's +3 shots a second was taken back out on
  // 2026-07-30, so the automatic rate is 2.5 all the way up path B and the only
  // thing that moves it is a crosspath into A1/A2.
  { id: "B5", branch: "B", cost: 3800, damageDelta: 15, hp: 180,
    recruitBoost: { count: 4, hp: 40, damage: 3, shotsPerSecond: 2.5,
      rangeUl: 125, cooldownSeconds: 45, visualTier: "B5" },
    requires: "B4", locksPath: true }
];

Soldier.upgradeById = function (id) {
  for (var i = 0; i < Soldier.UPGRADES.length; i++) {
    if (Soldier.UPGRADES[i].id === id) return Soldier.UPGRADES[i];
  }
  return null;
};


// --- the recruit ability (B4, upgraded by B5) --------------------------------
//
// These are the BASE recruit, the one B4 buys. B5's `recruitBoost` row raises
// the count, the health, the damage and the rate; nothing here is read once a
// Soldier owns B5, and the stats a recruit actually gets are resolved onto
// the tower by recalcStats() so that a recruit never has to look at an upgrade
// flag. See recruitStats() and updateRecruits().
//
// Every number here is either the owner's or DERIVED from one of his, and the
// derivations are the interesting part:
//
//   RECRUIT_RANGE_UL    an unupgraded Soldier's reach. A recruit is a Soldier,
//                       so it sees exactly as far as one that has bought
//                       nothing. The owner's "100 UL range" and this
//                       derivation are the same number, which is why it is
//                       still written as the derivation.
//   RECRUIT_SPEED_ULPS  80% of the ordinary enemy walking speed. Recruits used
//                       to match the traffic exactly; the slight slowdown gives
//                       enemies time to meet them in separated defensive lines
//                       instead of compressing every squad into one knot.
//   RECRUIT_RADIUS_UL   half a Soldier's footprint. It is a body, not an
//                       emplacement, and it is what "smaller version of the
//                       Soldier" means in collision terms.
//
// CONTACT IS A SHARED HEALTH EXCHANGE. The recruit commits its remaining HP as
// one strike. A surviving enemy consumes all of it; a killed enemy consumes
// only the damage it actually absorbed, leaving the unused HP on the recruit.
// SummonContact owns that rule so every future friendly summon inherits it.
Soldier.RECRUIT_COUNT = 2;
Soldier.RECRUIT_STAGGER_SECONDS = 0.25;
// 45 s at BOTH tiers since 2026-08-01 (it was 40 here and 30 at B5). B5 pays
// for a bigger squad, not a more frequent one -- see the note on B5 in the
// upgrade table.
Soldier.RECRUIT_COOLDOWN_SECONDS = 45;
Soldier.RECRUIT_DAMAGE = 1;
Soldier.RECRUIT_SHOTS_PER_SECOND = 2;   // 1 until 2026-07-30; B5 takes it to 2.5
Soldier.RECRUIT_HP = 20;
Soldier.RECRUIT_RANGE_UL = Soldier.BASE_RANGE_UL;
Soldier.RECRUIT_SPEED_ULPS = Enemy.BASE_SPEED_ULPS * 0.8;

// Where a recruit's shot leaves its rifle, in u.l. forward of the body. Same
// derivation as the tower's -- the Blender muzzle in world units times 30.58 --
// off tools/blender/summon_recruit.py. B4's carbine is short and mended; B5
// carries a full-length bolt rifle, so its muzzle is further out.
//
// Assigned here rather than beside the constructor because they belong with
// the other recruit constants; `function SoldierRecruit` is hoisted, so the
// object exists by the time this runs.
SoldierRecruit.MUZZLE_B4_UL = 18.2;
SoldierRecruit.MUZZLE_B5_UL = 24.9;
// Barrel height in the firing pose, for the round's presentation-only lift.
SoldierRecruit.MUZZLE_HEIGHT_UL = 30.1;
Soldier.RECRUIT_RADIUS_UL = Soldier.FOOTPRINT_RADIUS_UL / 2;


// --- upgrades ---------------------------------------------------------------

Soldier.prototype.hasUpgrade = function (id) {
  return this["has" + id] === true;
};

// Every stat is rebuilt from the flags, so an upgrade can never leave a stale
// number behind.
//
// It deliberately does NOT touch currentHp. previewUpgrade() sets a flag,
// recalculates, and sets it back to measure what a tier would do, and a
// hovering cursor must not heal a damaged tower. The heal B2 promises is
// applied in applyUpgrade(), which is the only place a purchase really happens.
Soldier.prototype.recalcStats = function () {
  this.damage = Soldier.BASE_DAMAGE;
  this.shotsPerBurst = Soldier.BASE_SHOTS_PER_BURST;
  this.shotSpacing = Soldier.BASE_SHOT_SPACING;
  this.burstCooldown = Soldier.BASE_BURST_COOLDOWN;
  this.rangeUl = Soldier.BASE_RANGE_UL;
  this.seesCamo = false;
  // Percentage POINTS of an enemy's `defense` this tower ignores. It pierced
  // flat `armor` until 2026-07-30 -- see the note on B4 in the table.
  this.defenseFlatPierce = 0;
  this.hasRecruitAbility = false;
  this.automatic = false;
  this.upgradeCount = 0;

  // The base recruit, before B5's boost. Resolved here rather than read from
  // the constants at spawn time so that a recruit is handed finished numbers and
  // never has to ask its parent which upgrades it owns.
  this.recruitCount = Soldier.RECRUIT_COUNT;
  this.recruitHp = Soldier.RECRUIT_HP;
  this.recruitDamage = Soldier.RECRUIT_DAMAGE;
  this.recruitShotsPerSecond = Soldier.RECRUIT_SHOTS_PER_SECOND;
  this.recruitRangeUl = Soldier.RECRUIT_RANGE_UL;
  this.recruitVisualTier = "B4";
  // Resolved onto the instance like the four above. B5 no longer moves it --
  // both tiers call at 45 s since 2026-08-01 -- but it stays on the instance
  // rather than being read off the constant at spawn time, because that is what
  // lets a future tier retune it without every reader learning the tiers.
  this.recruitCooldownSeconds = Soldier.RECRUIT_COOLDOWN_SECONDS;

  var maxHp = Soldier.BASE_HP;
  var damageBonus = 0;
  var fireRateBonus = 0;

  for (var i = 0; i < Soldier.UPGRADES.length; i++) {
    var u = Soldier.UPGRADES[i];
    if (!this.hasUpgrade(u.id)) continue;

    this.upgradeCount++;

    // Absolute: best owned wins (see the note on UPGRADES).
    if (u.damage !== undefined) this.damage = Math.max(this.damage, u.damage);
    if (u.shots !== undefined) this.shotsPerBurst = Math.max(this.shotsPerBurst, u.shots);
    if (u.spacing !== undefined) this.shotSpacing = Math.min(this.shotSpacing, u.spacing);
    if (u.cooldown !== undefined) this.burstCooldown = Math.min(this.burstCooldown, u.cooldown);

    // Deltas: everything owned contributes.
    if (u.damageDelta !== undefined) damageBonus += u.damageDelta;
    if (u.fireRate !== undefined) fireRateBonus += u.fireRate;
    if (u.rangeUl !== undefined) this.rangeUl += u.rangeUl;
    if (u.hp !== undefined) maxHp += u.hp;
    if (u.defenseFlatPierce !== undefined) this.defenseFlatPierce += u.defenseFlatPierce;

    if (u.seesCamo) this.seesCamo = true;
    if (u.automatic) this.automatic = true;
    if (u.recruits) this.hasRecruitAbility = true;

    // Absolute, and the last owned row wins -- there is one boost row and a
    // second would be a later tier deliberately superseding it. Copied field by
    // field rather than assigned, so nothing can end up holding a reference to
    // the shared table row (the trap the boss's `enterPhase` documents).
    if (u.recruitBoost) {
      var b = u.recruitBoost;
      if (b.count !== undefined) this.recruitCount = b.count;
      if (b.hp !== undefined) this.recruitHp = b.hp;
      if (b.damage !== undefined) this.recruitDamage = b.damage;
      if (b.shotsPerSecond !== undefined) this.recruitShotsPerSecond = b.shotsPerSecond;
      if (b.rangeUl !== undefined) this.recruitRangeUl = b.rangeUl;
      if (b.cooldownSeconds !== undefined) this.recruitCooldownSeconds = b.cooldownSeconds;
      if (b.visualTier !== undefined) this.recruitVisualTier = b.visualTier;
    }
  }

  // The two channels meet exactly once. Path A's absolute damage, then path B's
  // additions on top of it -- see the note on UPGRADES for why they are separate
  // all the way to here.
  this.damage += damageBonus;

  // Only meaningful while `automatic` is true, and guarded so a stray fireRate
  // on a burst tier could never produce a negative interval.
  this.shotsPerSecond = Math.max(0,
    Soldier.BASE_AUTO_SHOTS_PER_SECOND + fireRateBonus);

  this.maxHp = maxHp;
  this.rangePx = elevatedRangePx(this, this.rangeUl);
};

// The resolved numbers and visual tier a recruit is born with, as one object.
// It exists so
// callRecruits, the panel button and the hover card all read one resolution of
// them rather than three copies of the same lookups.
Soldier.prototype.recruitStats = function () {
  return {
    count: this.recruitCount,
    hp: this.recruitHp,
    damage: this.recruitDamage,
    shotsPerSecond: this.recruitShotsPerSecond,
    rangeUl: this.recruitRangeUl,
    speedUlps: Soldier.RECRUIT_SPEED_ULPS,
    cooldownSeconds: this.recruitCooldownSeconds,
    visualTier: this.recruitVisualTier
  };
};

// The recruits this Soldier WOULD send if it also owned `id` -- measured by
// setting the flag, recalculating and putting it back, which is the same trick
// previewUpgrade uses and for the same reason: the answer is whatever
// recalcStats() says it is, so there is no second copy of the resolution rules
// to keep honest. Used by the hover card on a tier the player has not bought.
Soldier.prototype.recruitStatsWith = function (id) {
  if (!Soldier.upgradeById(id) || this.hasUpgrade(id)) return this.recruitStats();

  this["has" + id] = true;
  this.recalcStats();
  var stats = this.recruitStats();
  this["has" + id] = false;
  this.recalcStats();
  return stats;
};

// Which branch this tower has committed to, or null if it is still open.
// Derived from the flags rather than stored, so it cannot disagree with them.
Soldier.prototype.lockedBranch = function () {
  for (var i = 0; i < Soldier.UPGRADES.length; i++) {
    var u = Soldier.UPGRADES[i];
    if (u.locksPath && this.hasUpgrade(u.id)) return u.branch;
  }
  return null;
};

// The next unbought upgrade on a branch, or null if the branch is finished.
Soldier.prototype.nextUpgrade = function (branch) {
  for (var i = 0; i < Soldier.UPGRADES.length; i++) {
    var u = Soldier.UPGRADES[i];
    if (u.branch === branch && !this.hasUpgrade(u.id)) return u;
  }
  return null;
};

Soldier.prototype.upgradeCost = function (id) {
  var u = Soldier.upgradeById(id);
  return u ? u.cost : 0;
};

// null if this upgrade may be bought, otherwise a short human-readable reason.
// Cash is NOT checked here -- that is the economy's business, in game.js.
// Identical rules to the Smasher's, spelled the same way for the same reason:
// the path lock is reported first because it is the permanent one.
Soldier.prototype.whyCannotUpgrade = function (id) {
  var u = Soldier.upgradeById(id);
  if (!u) return "no such upgrade";
  if (this.hasUpgrade(id)) return "already owned";

  var locked = this.lockedBranch();
  if (u.locksPath && locked !== null && locked !== u.branch) {
    return "path " + locked + " already chosen";
  }
  if (u.requires && !this.hasUpgrade(u.requires)) {
    return "needs " + u.requires;
  }
  return null;
};

// Snapshot of everything recalcStats() derives, for diffing an upgrade.
Soldier.prototype.statSnapshot = function () {
  return {
    damage: this.damage,
    shots: this.shotsPerBurst,
    spacing: this.shotSpacing,
    cooldown: this.burstCooldown,
    rangeUl: this.rangeUl,
    maxHp: this.maxHp,
    seesCamo: this.seesCamo,
    defenseFlatPierce: this.defenseFlatPierce,
    recruits: this.hasRecruitAbility,
    automatic: this.automatic,
    // Both firing models' rates, so rateOf() below can pick without asking the
    // tower again -- previewUpgrade has already put the flag back by then.
    shotsPerSecond: this.shotsPerSecond,
    recruitCount: this.recruitCount,
    recruitHp: this.recruitHp,
    recruitDamage: this.recruitDamage,
    recruitShotsPerSecond: this.recruitShotsPerSecond,
    recruitRangeUl: this.recruitRangeUl
  };
};

// A snapshot's attacks per second. The same conversion attacksPerSecond() makes,
// against a snapshot instead of the live tower, so a card and the panel under it
// cannot disagree about how fast this tower is -- including across the one tier
// that changes which of the two models applies.
Soldier.rateOf = function (snap) {
  return snap.automatic ? snap.shotsPerSecond : snap.shots / snap.cooldown;
};

// What a tier would do to THIS tower, measured rather than read off the table
// -- the same route the Smasher takes, and for the same reason: path A's rows
// are absolute, so the printed change would be wrong for any tier whose value
// is already beaten by one you own.
Soldier.prototype.previewUpgrade = function (id) {
  if (!Soldier.upgradeById(id) || this.hasUpgrade(id)) {
    return { effects: [], changes: [], grants: [] };
  }

  var before = this.statSnapshot();
  this["has" + id] = true;
  this.recalcStats();
  var after = this.statSnapshot();
  this["has" + id] = false;
  this.recalcStats();

  // Through the shared conversion, which is automatic-aware -- see Soldier.rateOf.
  var rateBefore = Soldier.rateOf(before);
  var rateAfter = Soldier.rateOf(after);

  // Handed to the shared formatter under the keys it already knows, so
  // "+25 u.l. range" is spelled identically here and on every other tower.
  var deltas = {
    damage: after.damage - before.damage,
    range: after.rangeUl - before.rangeUl,
    fireRate: rateAfter - rateBefore,
    hp: after.maxHp - before.maxHp
  };

  var changes = [];
  if (deltas.damage) {
    changes.push({ label: "Damage", from: TowerStats.number(before.damage),
      to: TowerStats.number(after.damage), delta: UpgradeEffects.signed(deltas.damage) });
  }
  if (deltas.range) {
    changes.push({ label: "Range", from: TowerStats.distance(before.rangeUl),
      to: TowerStats.distance(after.rangeUl), delta: UpgradeEffects.signed(deltas.range) });
  }
  if (deltas.fireRate) {
    changes.push({ label: "Attack speed", from: TowerStats.rate(rateBefore),
      to: TowerStats.rate(rateAfter), delta: UpgradeEffects.signed(deltas.fireRate) });
  }
  // Named before the burst rows, because it is the row that decides whether the
  // burst rows still mean anything.
  if (after.automatic !== before.automatic) {
    changes.push({ label: "Fire mode", from: "burst", to: "automatic", delta: "" });
  }

  // Only while the tower is still a burst weapon -- once B3 has landed, shots
  // per burst and shot spacing are dead numbers and printing a change to one
  // would be describing a mechanism the tower no longer has.
  if (!after.automatic && after.shots !== before.shots) {
    changes.push({ label: "Shots per burst", from: String(before.shots),
      to: String(after.shots), delta: UpgradeEffects.signed(after.shots - before.shots) });
  }
  if (!after.automatic && after.spacing !== before.spacing) {
    changes.push({ label: "Shot spacing", from: before.spacing.toFixed(2) + " s",
      to: after.spacing.toFixed(2) + " s", delta: "" });
  }
  if (!after.automatic && after.cooldown !== before.cooldown) {
    // The seconds are what a player actually watches. "+0.4 atk/s" and "a
    // burst every 0.90 s instead of 1.00 s" are the same fact, and only one of
    // them is legible while a wave is walking past.
    changes.push({ label: "Burst every", from: before.cooldown.toFixed(2) + " s",
      to: after.cooldown.toFixed(2) + " s", delta: "" });
  }
  if (deltas.hp) {
    changes.push({ label: "Tower HP", from: String(before.maxHp),
      to: String(after.maxHp), delta: UpgradeEffects.signed(deltas.hp) });
  }
  if (after.defenseFlatPierce !== before.defenseFlatPierce) {
    changes.push({ label: "Defense pierce", from: before.defenseFlatPierce + "%",
      to: after.defenseFlatPierce + "%",
      delta: UpgradeEffects.signed(after.defenseFlatPierce - before.defenseFlatPierce) });
  }

  // The recruits' own stats, but ONLY for a tier that changes them on a tower
  // that already has the ability. The tier that GRANTS recruits states its core
  // in its ability sentence instead, and printing them twice on the one card
  // would be the same numbers in two voices.
  if (before.recruits && after.recruits) {
    if (after.recruitCount !== before.recruitCount) {
      changes.push({ label: "Recruits", from: String(before.recruitCount),
        to: String(after.recruitCount),
        delta: UpgradeEffects.signed(after.recruitCount - before.recruitCount) });
    }
    if (after.recruitHp !== before.recruitHp) {
      changes.push({ label: "Recruit HP", from: String(before.recruitHp),
        to: String(after.recruitHp),
        delta: UpgradeEffects.signed(after.recruitHp - before.recruitHp) });
    }
    if (after.recruitDamage !== before.recruitDamage) {
      changes.push({ label: "Recruit damage", from: TowerStats.number(before.recruitDamage),
        to: TowerStats.number(after.recruitDamage),
        delta: UpgradeEffects.signed(after.recruitDamage - before.recruitDamage) });
    }
    if (after.recruitShotsPerSecond !== before.recruitShotsPerSecond) {
      changes.push({ label: "Recruit attack speed",
        from: TowerStats.rate(before.recruitShotsPerSecond),
        to: TowerStats.rate(after.recruitShotsPerSecond),
        delta: UpgradeEffects.signed(
          after.recruitShotsPerSecond - before.recruitShotsPerSecond) });
    }
    if (after.recruitRangeUl !== before.recruitRangeUl) {
      changes.push({ label: "Recruit range",
        from: TowerStats.distance(before.recruitRangeUl),
        to: TowerStats.distance(after.recruitRangeUl),
        delta: UpgradeEffects.signed(after.recruitRangeUl - before.recruitRangeUl) });
    }
  }

  // DPS last, from the shared formatter, exactly where the panel puts it.
  var dps = UpgradeEffects.dpsChange(
    { damage: before.damage, fireRate: rateBefore },
    { damage: after.damage, fireRate: rateAfter }
  );
  if (dps) changes.push(dps);

  // Named mechanics, in the vocabulary every other tower grants them under.
  var grants = [];
  if (after.seesCamo && !before.seesCamo) grants.push("camoDetection");
  if (after.defenseFlatPierce > before.defenseFlatPierce) grants.push("defenseFlatPierce");
  if (after.recruits && !before.recruits) grants.push("recruits");

  var effects = [];
  var numbers = UpgradeEffects.describe(deltas, []);
  if (numbers) effects.push(numbers);
  if (!after.automatic && after.shots !== before.shots) {
    effects.push(UpgradeEffects.signed(after.shots - before.shots) + " shot");
  }
  if (!after.automatic && after.spacing !== before.spacing) effects.push("tighter burst");
  if (after.automatic && !before.automatic) effects.push("automatic fire");
  if (after.seesCamo && !before.seesCamo) effects.push("sees camo");
  if (after.defenseFlatPierce > before.defenseFlatPierce) {
    effects.push(after.defenseFlatPierce + "% defence pierce");
  }
  if (after.recruits && !before.recruits) effects.push("recruits");
  // A button's phrase has room for the headline, not the table: the recruit
  // rows are already on the hover card above it.
  else if (after.recruitCount > before.recruitCount) {
    effects.push(after.recruitCount + " stronger recruits");
  }

  return { effects: effects, changes: changes, grants: grants };
};

// The button's short phrases. A view of previewUpgrade, not a second
// measurement -- same arrangement the Smasher has.
Soldier.prototype.upgradeEffects = function (id) {
  return this.previewUpgrade(id).effects;
};

// Set the flag and rebuild the stats. Assumes the purchase is already allowed
// and paid for -- go through buyUpgrade() in game.js instead of calling this.
Soldier.prototype.applyUpgrade = function (id) {
  var maxHpBefore = this.maxHp;

  this["has" + id] = true;
  this.totalSpent += this.upgradeCost(id);
  this.recalcStats();

  // A health tier GRANTS ITS DELTA rather than healing to the new maximum.
  //
  // It used to heal to full, and that was right while B2 was the only tier
  // that moved the ceiling: one full heal on one tier is a perk, not a
  // mechanic. Since 2026-08-01 all ten tiers carry HP, and "heals to the new
  // max" would have quietly turned every upgrade into a full repair -- a tower
  // under fire could be topped up for the price of the next tier, which is a
  // far bigger change than the health itself and nobody asked for it.
  //
  // Granting the delta keeps the promise that matters (an upgrade never leaves
  // you worse off, and the new points are yours immediately) without making
  // the shop a hospital. A damaged tower stays damaged by the same amount.
  if (this.maxHp > maxHpBefore) {
    this.currentHp = Math.min(this.maxHp, this.currentHp + (this.maxHp - maxHpBefore));
  }
};


// --- firing -----------------------------------------------------------------

// The in-range enemy this Soldier should shoot, honouring its targeting mode.
// `true` keeps the claim rule: an enemy that bullets already in flight will
// kill is skipped, so no shot is spent on a corpse. Every shot of a burst asks
// this separately -- see update().
Soldier.prototype.findTarget = function (enemies) {
  return Targeting.pick(this, enemies, true);
};

// Returns the damage landed this step. Its shots contribute 0 -- a Soldier's
// damage arrives later, when one of its bullets hits, and its recruits fire real
// Bullets that pay out the same way. What CAN land here is a recruit being
// walked through, which is resolved on the spot; see takeContactDamage.
Soldier.prototype.update = function (dt, enemies, bullets) {
  var landed = this.updateRecruits(dt, enemies, bullets);

  // Both clamped like the gunner's, so a long wait cannot bank negative time
  // and then let off a double burst when a target finally appears.
  if (this.cooldown > 0) this.cooldown -= dt;
  if (this.shotTimer > 0) this.shotTimer -= dt;

  var target = this.findTarget(enemies);
  if (target) {
    this.aim = Math.atan2(target.pos.y - this.y, target.pos.x - this.x);
  }

  // B3 onwards: no burst at all, just a steady rifle. Deliberately its own
  // short branch rather than the burst loop configured to fire one shot at a
  // time -- "a burst of one every 0.4 s" would leave shotsPerBurst, shotSpacing
  // and burstShotsLeft all live and all meaningless, and the next reader would
  // have to prove they were harmless. Same hold-at-zero rule as the burst.
  if (this.automatic) {
    if (this.shotsPerSecond <= 0) return landed;

    var interval = 1 / this.shotsPerSecond;
    while (this.cooldown <= 0) {
      // Retargeted per shot for the same reason the burst is: the enemy the
      // last shot killed must not cost this one.
      var autoTarget = this.findTarget(enemies);
      if (!autoTarget) {
        // Nothing to shoot: HOLD at zero rather than banking time, so a rifle
        // that has been idle for a minute does not empty a magazine in one
        // frame when a target finally walks in.
        this.cooldown = 0;
        break;
      }
      this.aim = Math.atan2(autoTarget.pos.y - this.y, autoTarget.pos.x - this.x);
      this.fire(autoTarget, bullets);
      // Added, not assigned, so a shot resolved late in a step keeps the
      // rhythm instead of stretching it a frame at a time. The `while` matters
      // at B5: 5.5 shots a second is a 0.18 s interval against a 1/60 s step,
      // and at 3x speed a step is 0.05 s, so two shots really can fall in one.
      this.cooldown += interval;
    }
    return landed;
  }

  // Opening a burst. A tower with nothing to shoot at HOLDS -- the cooldown
  // sits at zero rather than going negative, so the burst starts the instant a
  // real target walks in and holding costs nothing.
  if (this.burstShotsLeft === 0 && this.cooldown <= 0) {
    if (!target) return landed;
    this.burstShotsLeft = this.shotsPerBurst;
    this.shotTimer = 0;

    // Counted from the burst's START, not from its last shot. That is what
    // makes shots-per-burst over burst-cooldown the tower's real rate of fire,
    // and it is the arithmetic the whole upgrade table was priced against.
    this.cooldown = this.burstCooldown;
  }

  // Fire whatever the burst owes and the clock has reached. A `while` rather
  // than an `if` because at A5 the spacing is 0.07 s and the step is 1/60 s --
  // close enough that two shots can genuinely fall in one step, and dropping
  // one would quietly cost the tower damage the table says it has.
  while (this.burstShotsLeft > 0 && this.shotTimer <= 0) {
    // RETARGETED PER SHOT, not per burst. If the enemy this burst opened on
    // dies to shot one, shot two looks again and hits whatever the targeting
    // mode picks next; if nothing is left, that shot is simply lost and the
    // burst carries on. Losing the whole remainder would make a Soldier
    // standing over a thinning wave much worse than its DPS row claims.
    var shotTarget = this.findTarget(enemies);
    if (shotTarget) {
      this.aim = Math.atan2(shotTarget.pos.y - this.y, shotTarget.pos.x - this.x);
      this.fire(shotTarget, bullets);
    }

    this.burstShotsLeft--;
    // Added rather than assigned, so a shot fired late keeps the burst's
    // rhythm instead of stretching it a frame at a time.
    this.shotTimer += this.shotSpacing;
  }

  return landed;
};

// WHICH RENDERED BODY THIS SOLDIER IS.
//
// `locksPath` on A3+ and B3+ caps the other branch at 2 forever, so at most one
// branch can be 3 or more and a single name identifies the body. It lives here
// rather than in the art pack because `fire()` needs it: the barrel gets
// longer as he upgrades, and the shot has to leave the end of it.
Soldier.prototype.bodyTier = function () {
  if (this.hasA5) return "a5";
  if (this.hasA4) return "a4";
  if (this.hasA3) return "a3";
  if (this.hasB5) return "b5";
  if (this.hasB4) return "b4";
  if (this.hasB3) return "b3";
  return "base";
};

// WHERE THE SHOT LEAVES THE WEAPON, in u.l. from the point the tower stands on.
//
// MEASURED OFF THE MODEL, not picked: `tools/blender/tower_rifleman.py` prints
// a muzzle per body in Blender world units and that print is the authority.
// One world unit is 30.58 u.l. -- the Arcane Sniper's own sprite scale, 20 u.l.
// of footprint times draw-pack's PX_PER_WORLD of 1.529 -- so these are that
// print converted once.
//
// **IT USED TO BE A FLAT 16 PIXELS FORWARD**, which was fine for the old
// clockwork automaton and is not fine now: the carbine's muzzle is 28 u.l. out
// and A4's mounted gun is 37, so every shot appeared in mid-air beside him.
// The forward figure is the one used. The model's small lateral offset (the
// weapon is held on his right, about 6 u.l. off the centre line) is
// deliberately DROPPED here rather than approximated -- `aim` is a screen-space
// angle and the simulation has no ground plane in which to rotate a sideways
// offset, so folding it in would put the spawn point wrong in a different way.
// It is under a bullet's own radius; `height` is presentation only and rides on
// the bullet as `liftUl`, exactly as the Longshot's does.
Soldier.MUZZLE_UL = {
  base: { forward: 28.3, height: 30.8 },
  a3:   { forward: 28.9, height: 31.0 },
  a4:   { forward: 36.7, height: 33.6 },
  a5:   { forward: 36.4, height: 34.9 },
  b3:   { forward: 28.7, height: 30.2 },
  b4:   { forward: 29.9, height: 30.3 },
  b5:   { forward: 35.0, height: 37.9 }
};

Soldier.prototype.muzzle = function () {
  return Soldier.MUZZLE_UL[this.bodyTier()] || Soldier.MUZZLE_UL.base;
};

Soldier.prototype.fire = function (target, bullets) {
  var muzzle = this.muzzle();
  var reach = ul(muzzle.forward);
  var muzzleX = this.x + Math.cos(this.aim) * reach;
  var muzzleY = this.y + Math.sin(this.aim) * reach;

  // An ordinary homing Bullet, identical to the gunner's, which is what claims
  // its damage on the target and credits the kill back to this tower. The last
  // argument is B4's DEFENCE pierce, in percentage points -- zero until it is
  // bought, so an unupgraded Soldier's shot is byte-for-byte a gunner's.
  var tier = this.bodyTier();
  var shot = new Bullet(muzzleX, muzzleY, target, this.damage,
    function (hit) {
      // PRESENTATION ONLY, and the simulation never reads it back -- see
      // Effects in AGENTS.md. It goes through `onHit` rather than into
      // Bullet.update so that no other tower's shot gains a mark it did not
      // ask for. `kind` doubles as the VisualModels effect id, so an art pack
      // can give each tier its own impact and the built-in burst is the
      // fallback for all of them.
      if (typeof Effects === "undefined" || !Effects.aoeImpact) return;
      if (!hit || !hit.pos) return;
      Effects.aoeImpact(hit.pos.x, hit.pos.y, ul(tier === "b5" ? 15 : 9),
        "rifleman-hit", { shotBody: tier, particles: tier === "b5" });
    }, this, this.defenseFlatPierce);

  // Two presentation-only fields, set once at fire time and never read by
  // update(). `liftUl` draws the round at barrel height while its real
  // position stays on the ground plane it does its hit tests on -- the same
  // split the Longshot's bolt uses. `shotBody` is stamped rather than looked
  // up from the owner at draw time because selling or upgrading the tower must
  // not change what is already in the air.
  shot.liftUl = muzzle.height;
  shot.shotBody = tier;
  bullets.push(shot);
};

// Damage from an Angry enemy -- see js/systems/tower-health.js.
Soldier.prototype.takeDamage = function (amount) {
  return TowerHealth.damage(this, amount);
};

Soldier.prototype.isDestroyed = function () {
  return TowerHealth.isDestroyed(this);
};


// --- recruits (B4, boosted by B5) -------------------------------------------

// Is the ability ready, and why not. Cash plays no part: recruits are free and
// the cost is the wait.
Soldier.prototype.recruitsReady = function () {
  return this.hasRecruitAbility && this.recruitCooldown <= 0;
};

// Send the group out. Returns null on success or a short reason, the same shape
// whyCannotUpgrade uses, so performAction can hand either straight back.
Soldier.prototype.callRecruits = function () {
  if (!this.hasRecruitAbility) return "needs B4";
  if (this.recruitCooldown > 0) {
    return "ready in " + this.recruitCooldown.toFixed(1) + "s";
  }

  this.recruitCooldown = this.recruitCooldownSeconds;

  // Queued rather than spawned, so the stagger is one mechanism instead of a
  // special case for the first one: recruit 0 is due in 0 s, recruit 1 in
  // 0.25 s, and updateRecruits() deploys each when its timer runs out. The
  // count is the TOWER's, not the constant -- B5 sends four.
  this.recruitPending = [];
  for (var i = 0; i < this.recruitCount; i++) {
    this.recruitPending.push(i * Soldier.RECRUIT_STAGGER_SECONDS);
  }
  return null;
};

// Returns the damage its recruits landed DIRECTLY this step -- body blocks, not
// bullets. Their shots are ordinary Bullets and pay out from the bullet loop as
// always; a body block resolves here and now, so it has to be reported up
// through the tower's update for game.js to bank it (see the note above the
// `landed` capture in update()).
Soldier.prototype.updateRecruits = function (dt, enemies, bullets) {
  if (this.recruitCooldown > 0) this.recruitCooldown -= dt;

  // The auto switch (off unless the player turned it on). Checked here rather
  // than in update() so it sits with the cooldown it depends on, and it goes
  // through callRecruits() rather than queueing directly so the automatic call
  // and the button's call are the same call -- one cooldown, one stagger, one
  // place that can be wrong.
  if (AutoAbility.isOn(this, "recruits") && this.recruitsReady()) {
    this.callRecruits();
  }

  for (var i = this.recruitPending.length - 1; i >= 0; i--) {
    this.recruitPending[i] -= dt;
    if (this.recruitPending[i] > 0) continue;
    this.recruitPending.splice(i, 1);
    // `this` is handed over as the owner so a recruit's damage and kills land
    // on the panel of the tower that called it. A recruit has no panel of its
    // own, and the work was bought with this tower's B4. Its stats are
    // resolved and handed over at birth, so a recruit already in the road keeps
    // the numbers it was called in with even if the tower buys B5 behind it.
    this.recruits.push(
      new SoldierRecruit(this.path, this, this.seesCamo, this.recruitStats()));
  }

  var landed = 0;
  for (var j = 0; j < this.recruits.length; j++) {
    landed += this.recruits[j].update(dt, enemies, bullets) || 0;
  }
  this.recruits = this.recruits.filter(function (r) { return !r.dead; });
  return landed;
};


// --- interface --------------------------------------------------------------

// The footprint is the physical extent, the collision radius AND the click
// target. Shared with the gunner rather than reimplemented.
Soldier.prototype.containsPoint = Tower.prototype.containsPoint;

// What this tower hits for, and how often. A Soldier stores TWO firing models
// -- a burst (a count, a spacing and a cycle) and, from B3, a plain rate -- so
// this is the one place either becomes a rate, exactly as ul() is the one place
// a u.l. distance becomes pixels. Nothing outside this file, and nothing on the
// panel, the cards, the codex or the boss's tower-DPS scan, knows there are two.
//
// Burst: shots per burst over the burst CYCLE, because the cycle is measured
// from one burst's start to the next -- three shots every 1.2 s really is 2.5
// shots a second on average, which is the 2.5 DPS the owner's table states.
// Automatic: the rate as stored, which STARTS at that same 2.5 by derivation.
Soldier.prototype.attackDamage = function () { return this.damage; };
Soldier.prototype.attacksPerSecond = function () {
  if (this.automatic) return this.shotsPerSecond;
  return this.shotsPerBurst / this.burstCooldown;
};

// Rows for the inspection panel, in the shared order: lifetime totals, damage,
// range, attack speed, this type's own rows, DPS last.
Soldier.prototype.statLines = function () {
  var rows = TowerStats.totals(this).concat([
    TowerStats.damage(this),
    TowerStats.range(this),
    TowerStats.attackSpeed(this)
  ]);

  // The burst rows describe a mechanism an automatic rifle does not have, so
  // they are replaced rather than joined by the fire mode -- a panel showing
  // both "Fire mode automatic" and "Shots per burst 3" is a panel telling the
  // player two different things about how the tower works.
  if (this.automatic) {
    rows.push(["Fire mode", "Automatic"]);
  } else {
    rows.push(["Shots per burst", String(this.shotsPerBurst)]);
    rows.push(["Shot spacing", this.shotSpacing.toFixed(2) + " s"]);
  }

  rows.push(["Tower HP", TowerHealth.label(this)]);

  if (this.seesCamo) rows.push(["Camo", "Yes"]);
  if (this.defenseFlatPierce > 0) rows.push(["Defense pierce", this.defenseFlatPierce + "%"]);
  // Only while it is actually counting down. A permanent "Recruits  ready" row
  // would cost a line to say what the button under it already says.
  if (this.hasRecruitAbility && this.recruitCooldown > 0) {
    rows.push(["Recruits", this.recruitCooldown.toFixed(1) + " s"]);
  }

  rows.push(TowerStats.dpsRow(this));
  return rows;
};

// Owned upgrade ids in tier order. Nothing draws this; it is the clearest way
// for a test to assert what a tower bought.
Soldier.prototype.ownedUpgradeIds = function () {
  var owned = [];
  for (var i = 0; i < Soldier.UPGRADES.length; i++) {
    if (this.hasUpgrade(Soldier.UPGRADES[i].id)) owned.push(Soldier.UPGRADES[i].id);
  }
  return owned;
};


// --- the shared upgrade panel -----------------------------------------------
//
// The same panelActions/performAction contract every upgradeable tower uses,
// so there is ONE upgrade UI rather than several that look alike and drift.

Soldier.prototype.panelActions = function () {
  var actions = [];
  var self = this;

  ["A", "B"].forEach(function (branch) {
    var next = self.nextUpgrade(branch);

    // A branch with nothing left is MAXED. A branch that still has tiers but
    // cannot buy them keeps showing the tier and says why, because "path B
    // already chosen" is something the player needs to know and "MAXED" would
    // be a lie.
    if (!next) {
      actions.push({
        id: "upgrade" + branch,
        branch: branch,
        upgradeId: null,
        label: "Path " + branch + "  MAXED",
        detail: "maxed",
        effects: "every tier bought",
        reason: "every tier bought",
        enabled: false,
        tone: "upgrade",
        tooltip: function () {
          return UpgradeEffects.card({
            title: self.name + "  ·  path " + branch,
            subtitle: "every tier bought",
            note: "Nothing left to buy on this branch."
          });
        }
      });
      return;
    }

    var refusal = self.whyCannotUpgrade(next.id);
    var preview = self.previewUpgrade(next.id);

    actions.push({
      id: "upgrade" + branch,
      branch: branch,
      upgradeId: next.id,
      label: "Path " + branch + " → " + next.id,
      detail: refusal ? refusal : "$" + next.cost,
      effects: refusal ? refusal : preview.effects.join(", "),
      reason: refusal,
      enabled: refusal === null && cash >= next.cost,
      tone: "upgrade",
      // A thunk, like every other tower's card -- see cardFor in js/game.js.
      tooltip: function () { return self.upgradeCard(next, refusal, preview); }
    });
  });

  // The recruit button appears the moment B4 is owned and never before. It is
  // an ability, not an upgrade, so it takes the violet `ability` tone the
  // Longshot's nuke and cone re-aim already use.
  //
  // Every figure on it comes from recruitStats(), never from the constants, so
  // the button describes the recruits THIS tower would send rather than the
  // ones a B4 Soldier sends. Reading the constants here was correct only while
  // no tier changed them; B5 does.
  if (this.hasRecruitAbility) {
    var cooling = this.recruitCooldown > 0;
    var r = this.recruitStats();
    // AutoAbility.attach hangs the ON/OFF switch on this button -- see the file
    // header in js/systems/auto-ability.js. Recruits qualify because calling them
    // needs nothing from the player but the decision to call them.
    actions.push(AutoAbility.attach({
      id: "recruits",
      label: "Call recruits",
      detail: cooling
        ? "ready in " + this.recruitCooldown.toFixed(1) + "s"
        : "ready",
      effects: r.count + " soldiers march the road backwards, " +
        TowerStats.number(r.damage) + " damage at " +
        TowerStats.rate(r.shotsPerSecond) + " each",
      enabled: !cooling,
      tone: "ability",
      // A plain object rather than a thunk: nothing here needs resolving, it
      // is a handful of numbers this tower already knows.
      tooltip: UpgradeEffects.card({
        title: "Call recruits",
        subtitle: cooling ? "ready in " + this.recruitCooldown.toFixed(1) + " s" : "ready",
        changes: [
          { label: "Recruits", from: "", to: String(r.count), delta: "" },
          { label: "Damage", from: "",
            to: TowerStats.number(r.damage) + " × " +
              TowerStats.rate(r.shotsPerSecond), delta: "" },
          { label: "Recruit HP", from: "", to: String(r.hp), delta: "" },
          { label: "Range", from: "", to: TowerStats.distance(r.rangeUl), delta: "" },
          { label: "Cooldown", from: "", to: r.cooldownSeconds + " s", delta: "" }
        ],
        abilities: UpgradeEffects.abilities(["recruits"], { recruits: r })
      })
    }, this, "recruits", "AUTO"));
  }

  return actions;
};

// The hover card for one upgrade: what it costs, every stat it moves with the
// value before and after, a sentence per ability it switches on, and the one
// consequence a price tag cannot show -- that tier 3 shuts the other branch.
Soldier.prototype.upgradeCard = function (upgrade, refusal, preview) {
  var note = null;
  if (refusal) {
    note = "Unavailable: " + refusal + ".";
  } else if (upgrade.locksPath && this.lockedBranch() === null) {
    // Read off the tier that does the locking rather than typed as "tier 3",
    // so moving `locksPath` up or down the table moves the warning with it.
    var tier = parseInt(upgrade.id.slice(1), 10);
    note = "Tier " + tier + " commits this tower: the other branch is capped at tier " +
      (tier - 1) + " for good.";
  }

  // Parameters for the sentences, taken from the upgrade's own row rather than
  // repeated, so a retuned pierce value moves its description with it.
  //
  // The recruit numbers are MEASURED off the tier the same way, by asking a
  // tower that owns it. previewUpgrade already did exactly that to build
  // `preview`, so reading its `after` side rather than the constants means the
  // ability sentence and the stat rows above it describe one set of recruits.
  var withTier = this.recruitStatsWith(upgrade.id);
  var params = {
    defenseFlatPierce: upgrade.defenseFlatPierce ? { points: upgrade.defenseFlatPierce } : null,
    recruits: withTier
  };

  return UpgradeEffects.card({
    title: this.name + "  ·  " + upgrade.id,
    subtitle: refusal ? refusal : "$" + upgrade.cost,
    changes: preview.changes,
    abilities: UpgradeEffects.abilities(preview.grants, params),
    note: note
  });
};

Soldier.prototype.performAction = function (id, context) {
  // The auto switch first: it is a different click in the same rectangle as the
  // ability button, and it must be caught before "recruits" below.
  var auto = AutoAbility.handle(this, id);
  if (auto) return auto;

  if (id === "recruits") {
    var refused = this.callRecruits();
    return refused ? refused : this.name + " → recruits away";
  }

  if (id !== "upgradeA" && id !== "upgradeB") return null;

  var next = this.nextUpgrade(id.slice(-1));
  if (!next) return "path maxed";

  // Delegated, not reimplemented: buyUpgrade in game.js owns validation, price
  // and affordability for every upgradeable tower.
  var refusal = buyUpgrade(this, next.id);
  if (refusal) return refusal;

  return this.name + " → " + next.id;
};


// --- drawing ----------------------------------------------------------------

// Branch decides the colour, and all three are metals now: A runs hot (fired
// copper, the drill branch), B runs cool (verdigris patina, the support
// branch), and an uncommitted automaton is plain polished brass.
Soldier.prototype.tint = function () {
  var branch = this.lockedBranch();
  if (branch === "A") return { r: 255, g: 168, b: 92 };
  if (branch === "B") return { r: 138, g: 220, b: 190 };
  return { r: 216, g: 178, b: 108 };
};

// The seconds between one firing cycle and the next: a burst's cooldown, or an
// automatic rifle's shot interval. The one place the two models' clocks are
// reconciled for the ARTWORK, the way attacksPerSecond() is for the numbers.
Soldier.prototype.cycleSeconds = function () {
  if (this.automatic) {
    return this.shotsPerSecond > 0 ? 1 / this.shotsPerSecond : 0;
  }
  return this.burstCooldown;
};

// The clockwork's phase, 0 -> 1, for the gears on the chassis. DERIVED from
// the firing clock rather than stored, exactly like sinceShot() below: a tower
// that is firing has a cooldown sweeping from a full cycle down to zero, so the
// gears turn while it works and stop while it holds. An automatic rifle sweeps
// the same clock over a much shorter cycle, so its gears simply spin faster --
// which is the right read for the tier. Cosmetic only -- nothing in update()
// carries a frame of animation state.
Soldier.prototype.gearPhase = function () {
  var cycle = this.cycleSeconds();
  if (cycle <= 0) return 0;
  return 1 - Math.max(0, this.cooldown) / cycle;
};

// How long ago the last shot left the barrel, or null if nothing is in flight.
// DERIVED, never stored -- cosmetic only, no state, nothing for update() to
// carry. Same trick the gunner's muzzle flash uses against its cooldown.
//
// The two models read different clocks because they keep time differently. A
// burst sets shotTimer to the spacing per shot, so the gap between the two is
// the age of the shot. An automatic rifle has no shotTimer running at all, so it
// measures from the shot cooldown instead and flashes for a shot spacing's worth
// of it -- which keeps the flash the same LENGTH in both modes and lets it read
// as a steady pulse rather than a stutter.
Soldier.prototype.sinceShot = function () {
  if (this.automatic) {
    var cycle = this.cycleSeconds();
    if (cycle <= 0 || this.cooldown <= 0) return null;
    var age = cycle - this.cooldown;
    return age < this.shotSpacing ? age : null;
  }
  if (this.shotTimer <= 0) return null;
  return this.shotSpacing - this.shotTimer;
};

Soldier.prototype.draw = function (ctx) {
  if (VisualModels.draw("tower", Soldier.ID + ":complete", ctx, this)) return;
  var c = this.tint();
  var rgb = c.r + "," + c.g + "," + c.b;

  // Recruits first, so the tower's own body is never hidden behind one that
  // happens to be standing on it.
  for (var i = 0; i < this.recruits.length; i++) this.recruits[i].draw(ctx);

  // Range indicator -- ONLY while this tower is selected. The renderer sets
  // showRange; nothing here decides it (see the render loop in js/game.js).
  if (this.showRange) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.rangePx, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(140,199,255,0.07)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(140,199,255,0.5)";
    ctx.stroke();
  }

  if (!VisualModels.draw("tower", Soldier.ID + ":body", ctx, this,
      { rgb: rgb })) {
  // Raised brass emplacement. The world coordinate remains the centre of its
  // circular gameplay footprint; the visible top is lifted seven pixels and
  // squashed into the common three-quarter-view ground plane.
  var visualRadius = this.footprintPx * 1.12;
  var pad = Visuals3Q.platform(ctx, this.x, this.y, visualRadius, {
    height: 7,
    top: "#3a2d20",
    side: "#19140f",
    rim: "rgba(" + rgb + ",0.88)",
    highlight: "rgba(255,232,180,0.34)"
  });

  // NOTE: an escapement ring of brass notches around the rim was tried here
  // and removed. Between the brass rim, the brass gears on the chassis and the
  // upgrade pips outside the pad, the tower had four concentric rings of the
  // same colour and the rifle vanished into them. The clockwork cue lives on
  // the chassis, where there is contrast for it.

  // Camo detection (B3): a scan ring inside the pad, so an automaton that can
  // see the invisible looks different from one that cannot without opening a
  // panel. Arcane blue against all the brass, deliberately -- it is the one
  // part of this machine that is enchantment rather than gearing.
  if (this.seesCamo) {
    ctx.beginPath();
    ctx.ellipse(this.x, pad.y, this.footprintPx - 3,
      (this.footprintPx - 3) * Visuals3Q.GROUND_SQUASH, 0, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(160,235,255,0.55)";
    ctx.stroke();
  }

  this.drawFigure(ctx, rgb, pad.y - 3, 1.28);

  // One pip per upgrade owned, around the pad, so investment is readable
  // without opening the panel -- the same cue the Smasher uses.
  for (var p = 0; p < this.upgradeCount; p++) {
    var a = -Math.PI / 2 + p * (Math.PI * 2 / 10);
    ctx.beginPath();
    ctx.arc(this.x + Math.cos(a) * (this.footprintPx + 4),
      pad.y + Math.sin(a) * (this.footprintPx + 4) * Visuals3Q.GROUND_SQUASH,
      2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + rgb + ",0.95)";
    ctx.fill();
  }
  }
};

// The automaton: an angular brass chassis, an exposed gear train, and a rifle
// barrel that swings with the aim. Everything here is drawn in the tower's
// LOCAL frame -- translate to the tower, rotate to `aim`, then lay the machine
// out along +x -- which is what lets the whole silhouette turn as one piece
// instead of each part re-deriving its own sin/cos. Pixel sizes are cosmetic
// detail inside a draw(), which is allowed; only the pad in draw() above is
// tied to the footprint.
Soldier.prototype.drawFigure = function (ctx, rgb, bodyY, modelScale) {
  var gear = this.gearPhase();
  bodyY = bodyY === undefined ? this.y : bodyY;
  modelScale = modelScale || 1;

  ctx.save();
  ctx.translate(this.x, bodyY);
  ctx.scale(modelScale, modelScale);
  ctx.rotate(this.aim);

  // Chassis: a compact, deliberately ANGULAR hull -- a blunt hexagon, wider at
  // the shoulders than at the muzzle end, so it reads as a machined block
  // rather than the round torso the human figure used to have.
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(3.5, -5.5);
  ctx.lineTo(-4, -6.5);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-4, 6.5);
  ctx.lineTo(3.5, 5.5);
  ctx.closePath();
  ctx.fillStyle = "#3a2d20";
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = "rgba(" + rgb + ",0.95)";
  ctx.stroke();

  // The gear train, turning with the burst cycle. Two brass wheels meshed at
  // the shoulders, counter-rotating because meshed gears do; the teeth are
  // spokes rather than a toothed outline because at six pixels across an
  // outline is mud.
  // ONE gear, on the side the rifle is not. Two were tried and the chassis
  // became a pile of brass with no room left for a weapon.
  this.drawGear(ctx, -1.5, 3.4, 2.8, gear * 6.0, rgb);

  // Rifle: a brass receiver with a GUNMETAL barrel running out of it, offset
  // to one side so it reads as SHOULDERED rather than as a turret barrel
  // through the middle of the machine. It points along +x, which is the aim.
  //
  // The barrel is dark on purpose. A brass barrel on a brass chassis with
  // brass gears behind it disappeared completely -- the whole tower read as a
  // gear medallion with no weapon on it. Dark steel with a brass collar is the
  // only part of this that has to be legible at eleven pixels.
  ctx.fillStyle = "rgba(" + rgb + ",0.9)";
  ctx.fillRect(0, -5, 7, 3.6);             // receiver sleeve
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = "rgba(40,28,14,0.9)";
  ctx.strokeRect(0, -5, 7, 3.6);

  ctx.beginPath();
  ctx.moveTo(6, -3.2);
  ctx.lineTo(20, -3.2);
  ctx.lineWidth = 3;
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#1c1913";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(6, -3.2);
  ctx.lineTo(20, -3.2);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "#6e6252";
  ctx.stroke();

  // Brass collar at the muzzle, so the end of the barrel has a full stop.
  ctx.beginPath();
  ctx.moveTo(17.5, -3.2);
  ctx.lineTo(20, -3.2);
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = "#c9a24a";
  ctx.stroke();

  // Muzzle flash, derived from the shot timer (see sinceShot). The window
  // scales with the spacing, so a 0.07 s A5 burst reads as a continuous
  // stutter of light rather than as one flash with four dark gaps. Drawn as a
  // short cone along the bore now that there is a bore to fire out of.
  var since = this.sinceShot();
  if (since !== null && since >= 0 && since < this.shotSpacing * 0.6) {
    var glow = 1 - since / (this.shotSpacing * 0.6);

    ctx.beginPath();
    ctx.moveTo(20, -3.2);
    ctx.lineTo(20 + 8 * glow, -3.2 - 3 * glow);
    ctx.lineTo(20 + 8 * glow, -3.2 + 3 * glow);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,228,150," + (0.8 * glow).toFixed(3) + ")";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(20.5, -3.2, 1.5 + 3 * glow, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,246,214," + (0.7 * glow).toFixed(3) + ")";
    ctx.fill();
  }

  // The head: a small angular cowl with a single lit lens, pushed forward
  // towards whatever it is shooting at.
  ctx.beginPath();
  ctx.moveTo(8.5, 0);
  ctx.lineTo(4.5, -2.8);
  ctx.lineTo(4.5, 2.8);
  ctx.closePath();
  ctx.fillStyle = "#2a2018";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(" + rgb + ",0.9)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(6.4, 0, 1.4, 0, Math.PI * 2);
  ctx.fillStyle = this.seesCamo ? "#a6ebff" : "#ffe6a8";
  ctx.fill();

  ctx.restore();
};

// One brass gear, in whatever frame the caller has set up. Spokes rather than
// a toothed rim: at this size teeth are a smudge, while spokes read as
// rotation instantly. Cosmetic; shared by the tower and its recruits.
Soldier.prototype.drawGear = function (ctx, gx, gy, radius, angle, rgb) {
  ctx.beginPath();
  ctx.arc(gx, gy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(" + rgb + ",0.75)";
  ctx.fill();

  ctx.lineWidth = 0.9;
  ctx.strokeStyle = "rgba(58,40,20,0.9)";
  for (var i = 0; i < 6; i++) {
    var a = angle + i * Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(a) * radius, gy + Math.sin(a) * radius);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(gx, gy, radius * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = "#2a2018";
  ctx.fill();
};

// Build bar icon: the automaton on its clockwork plinth, seen from above with
// the rifle pointing up -- matching the drawn tower's default aim. Pixel sizes
// on purpose: interface chrome must not scale with the map.
Soldier.drawIcon = function (ctx, cx, cy, size) {
  if (VisualModels.draw("tower", Soldier.ID + ":icon", ctx,
      { cx: cx, cy: cy, size: size, type: Soldier })) return;
  var r = size / 2;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#241d16";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#d8b26c";
  ctx.stroke();

  // Angular chassis, pointing up.
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.42);
  ctx.lineTo(cx + size * 0.33, cy - size * 0.2);
  ctx.lineTo(cx + size * 0.39, cy + size * 0.24);
  ctx.lineTo(cx, cy + size * 0.42);
  ctx.lineTo(cx - size * 0.39, cy + size * 0.24);
  ctx.lineTo(cx - size * 0.33, cy - size * 0.2);
  ctx.closePath();
  ctx.fillStyle = "#3a2d20";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#d8b26c";
  ctx.stroke();

  // A visible gear on the shoulder.
  ctx.beginPath();
  ctx.arc(cx - size * 0.2, cy + size * 0.12, size * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(216,178,108,0.8)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#3a2814";
  for (var i = 0; i < 6; i++) {
    var a = i * Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, cy + size * 0.12);
    ctx.lineTo(cx - size * 0.2 + Math.cos(a) * size * 0.18,
      cy + size * 0.12 + Math.sin(a) * size * 0.18);
    ctx.stroke();
  }

  // Rifle barrel, shouldered to one side and pointing up.
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.18, cy + size * 0.16);
  ctx.lineTo(cx + size * 0.18, cy - size * 0.6);
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#c9a24a";
  ctx.stroke();

  // Lit lens.
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.16, size * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = "#ffe6a8";
  ctx.fill();
};


// ---------------------------------------------------------------------------
// SoldierRecruit
//
// A temporary body called in by a Soldier's B4. IT IS NOT A TOWER, and the
// list of things that follow from that is the whole design:
//
//   * it is not in `towers`, so it is not in the build bar, cannot be
//     inspected or sold, has no upgrade tree, and does not block building;
//   * it is not in `enemies`, so nothing shoots it and it never leaks;
//   * it lives on the Soldier that called it, which is why there is no new
//     run-scoped array for restartGame() to reset -- clearing `towers` clears
//     recruits with them.
//
// The one consequence of that last point worth stating plainly: RECRUITS GO
// WITH THE TOWER THAT CALLED THEM. Sell or lose the Soldier and its group
// vanishes. That is deliberately unlike a bullet already in flight (which
// outlives its tower, because the shot was already spent) -- a recruit is the
// tower still acting, not a thing it has finished doing.
//
// It walks the road BACKWARDS, from the end towards the start, so it meets the
// wave head on and dies somewhere in the middle of the map. It fires real
// Bullets, so it claims its damage exactly like every other shooter and never
// wastes a shot on a corpse.
//
// IT STOPS TO SHOOT (2026-07-30, the owner's "they must stop while shooting").
// A recruit is either marching or firing, never both, which changes what it is
// for: it holds ground at the point it met the wave instead of trading shots on
// its way past, so its life is decided by what walks into it rather than by the
// length of the road. It also means the ~47 s crossing is a FLOOR on how long a
// recruit lasts and no longer an estimate.
//
// ITS STATS ARE HANDED TO IT, not looked up. B5 raises its combat package, so a recruit
// takes a resolved `stats` object at birth (see Soldier.recruitStats) and keeps
// the numbers it was called in with for its whole life -- a Soldier that buys B5
// while a group is already in the road upgrades the NEXT group, not that one.
// ---------------------------------------------------------------------------

function SoldierRecruit(path, owner, seesCamo, stats) {
  this.path = path;
  this.owner = owner;

  // Defaulted to the base recruit so a caller that passes nothing gets the B4
  // unit rather than a body with NaN health.
  this.stats = stats || {
    hp: Soldier.RECRUIT_HP,
    damage: Soldier.RECRUIT_DAMAGE,
    shotsPerSecond: Soldier.RECRUIT_SHOTS_PER_SECOND,
    rangeUl: Soldier.RECRUIT_RANGE_UL,
    speedUlps: Soldier.RECRUIT_SPEED_ULPS,
    visualTier: "B4"
  };

  // Damage and kills are credited to the Soldier whose B5 paid for this, the
  // same way the Smasher's B4 blast is credited to the Smasher that caused it.
  // A recruit has no panel of its own to show them on.
  this.progress = path.length;
  this.pos = path.pointAt(this.progress);

  // Targeting.pick duck-types a shooter as { x, y, rangePx, targeting,
  // seesCamo }, so a recruit gets all six targeting modes and the camo rule
  // for free by spelling those five fields the way a tower spells them.
  this.x = this.pos.x;
  this.y = this.pos.y;
  this.rangeUl = this.stats.rangeUl;
  this.rangePx = ul(this.rangeUl);
  this.speedUlps = this.stats.speedUlps === undefined
    ? Soldier.RECRUIT_SPEED_ULPS : this.stats.speedUlps;
  this.visualTier = this.stats.visualTier || "B4";

  // Always "first" -- the enemy furthest along the road. A recruit is walking
  // TOWARDS the base it is defending, so the enemy nearest to leaking is also
  // the one it meets first; any other mode would have it walk past its own
  // best target.
  this.targeting = "first";

  // Inherited from the parent. B5 requires B4 requires B3, so a Soldier that
  // can call recruits ALWAYS has camo detection -- a blind recruit would be
  // useless on exactly the waves its parent was upgraded to answer. Note the
  // contrast with defence pierce below, which the owner explicitly said does not
  // carry; camo was not carved out, and this is the reading that plays.
  this.seesCamo = !!seesCamo;

  this.maxHp = this.stats.hp;
  this.hp = this.maxHp;
  this.cooldown = 0;
  this.dead = false;

  // Which enemies have already walked through this one. Contact is charged
  // ONCE per enemy, not per frame of overlap -- otherwise a recruit's life
  // would depend on the frame rate and on how slowly an enemy happened to be
  // moving, rather than on how many of them got to it. Same bookkeeping
  // PierceBullet does for the same reason.
  //
  // A low-health kill can now leave the recruit alive, so this list may contain
  // several entries. Keeping object identity here guarantees each enemy is
  // charged once even while two surviving bodies remain overlapped for frames.
  this.touched = [];

  // Standing still to fire, so draw() can show it braced rather than walking and
  // so the stop rule is one readable flag instead of an inference about targets.
  this.holding = false;

  // How long it has been holding, in seconds. PRESENTATION ONLY, and set here
  // for the same reason `Smasher.slam` is: this is the one place that knows the
  // moment a recruit stops walking and shoulders its rifle. Nothing in the
  // simulation reads it -- shots come off `cooldown`, and a recruit whose
  // renderer ignores this behaves identically.
  this.holdTime = 0;

  this.facing = 0;
  this.walkPhase = 0;
}

// Returns the damage this recruit landed DIRECTLY this step -- a body block, and
// 0 on every other step. Its shots are Bullets and pay out from the bullet loop.
SoldierRecruit.prototype.update = function (dt, enemies, bullets) {
  if (this.dead) return 0;

  if (this.cooldown > 0) this.cooldown -= dt;

  // Targeting happens BEFORE moving, because whether there is a target is what
  // decides whether it moves at all. The old order marched first and shot from
  // wherever that left it, which is exactly the behaviour the stop rule replaces.
  var target = Targeting.pick(this, enemies, true);
  this.holding = target !== null && target !== undefined;
  this.holdTime = this.holding ? this.holdTime + dt : 0;

  if (this.holding) {
    this.facing = Math.atan2(target.pos.y - this.y, target.pos.x - this.x);
  } else {
    // March against the traffic. Only while there is nothing to shoot.
    this.progress -= ul(this.speedUlps) * dt;
    this.walkPhase += dt * this.speedUlps * 0.22;
    if (this.progress <= 0) {
      // Reached the start of the road: its walk is over, and so is it.
      this.dead = true;
      return 0;
    }
    var was = this.pos;
    this.pos = this.path.pointAt(this.progress);
    this.x = this.pos.x;
    this.y = this.pos.y;

    // Face the way it is walking. Derived from the step just taken rather than
    // from the path's tangent, because the two agree and this one cannot get the
    // sign wrong -- a recruit walks the road backwards, so the tangent would
    // have to be negated and a future reader would have to work out why.
    var dx = this.x - was.x;
    var dy = this.y - was.y;
    if (dx !== 0 || dy !== 0) this.facing = Math.atan2(dy, dx);
  }

  // Checked every step, standing or walking: a recruit holding its ground is
  // exactly the one most likely to be walked through.
  var landed = this.takeContactDamage(enemies);
  if (this.dead) return landed;

  if (!this.holding || this.cooldown > 0) return landed;

  // A real Bullet, so the claim, the payout and the credit all work exactly as
  // they do for a tower. No defence pierce is passed, deliberately: B4 buys
  // pierce for the SOLDIER's shots, and the owner said it does not carry to
  // the recruits.
  //
  // It leaves the end of the rifle rather than the middle of the man, the same
  // correction the tower's own muzzle got. These two are much smaller figures
  // holding much smaller weapons, so the numbers are their own.
  var reach = ul(this.visualTier === "B5"
    ? SoldierRecruit.MUZZLE_B5_UL : SoldierRecruit.MUZZLE_B4_UL);
  var shot = new Bullet(this.x + Math.cos(this.facing) * reach,
    this.y + Math.sin(this.facing) * reach, target, this.stats.damage,
    null, this.owner);
  shot.liftUl = SoldierRecruit.MUZZLE_HEIGHT_UL;
  shot.shotBody = this.visualTier === "B5" ? "recruit-b5" : "recruit-b4";
  bullets.push(shot);
  this.cooldown = this.stats.shotsPerSecond > 0
    ? 1 / this.stats.shotsPerSecond
    : Infinity;
  return landed;
};

// Is the cursor over this recruit? Padded exactly like an enemy's hover test
// (Enemy.HOVER_PAD_PX), because a recruit is the same kind of thing to point at:
// a small body in the road that is moving, drawn at a radius too small to hit
// reliably without a little grace. It is NOT the tower rule -- a tower's click
// target is exactly its footprint, because a tower is a fixed emplacement you
// are selecting, where this is a readout you are peeking at.
SoldierRecruit.prototype.containsPoint = function (x, y) {
  var reach = ul(Soldier.RECRUIT_RADIUS_UL) + Enemy.HOVER_PAD_PX;
  var dx = x - this.x;
  var dy = y - this.y;
  return dx * dx + dy * dy <= reach * reach;
};

// What the hover readout says: what it has left, and how far it reaches.
// Split out of the drawing so a test can assert the text the player reads --
// the same reason enemyHoverLabel exists, and the stub canvas records nothing,
// so anything left inside a draw() is untestable.
//
// Clamped at 0 for the same reason the enemy's is: contact empties a recruit in
// one go and "-0 / 40 HP" would be nonsense on screen.
SoldierRecruit.prototype.hoverLabel = function () {
  return Math.max(0, Math.round(this.hp)) + " / " + this.maxHp + " HP  ·  " +
    TowerStats.distance(this.rangeUl);
};

// Enemies do not attack a recruit -- only the Angry type attacks anything, and
// it attacks TOWERS. What hurts a recruit is being walked through: it is a body
// standing in the road, and the wave goes over it.
//
// CONTACT IS A MUTUAL HEALTH EXCHANGE. The recruit commits its remaining HP as
// damage. A surviving enemy consumes the whole commitment; when that strike
// kills, only the HP the enemy actually absorbed is removed and the overflow
// remains on the recruit. Returns physical damage landed so the caller can
// report the same quantity the shared tower counter records.
//
// Three things follow, all intended:
//
//   * A healthy target still takes ONE HEAVY HIT and spends the whole recruit.
//   * A 1 HP target hit by a 35 HP recruit dies and leaves that recruit at 34.
//   * `touched` still makes contact once per enemy, so a survivor cannot grind
//     the same body again every frame while their collision circles overlap.
//
// It goes through TowerScore.apply, like every other damage source in the game,
// so mitigation, the kill count and the owner's lifetime damage total all work
// without contact being a special case -- and armor is why a 40 HP block does 35
// to a brute rather than 40. If that brute survives, the full 40 HP commitment
// is still spent, preserving the old high-health behaviour. No defence pierce
// is passed, for the same reason the bullets pass none.
SoldierRecruit.prototype.takeContactDamage = function (enemies) {
  var radius = ul(Soldier.RECRUIT_RADIUS_UL);

  for (var i = 0; i < enemies.length; i++) {
    var e = enemies[i];
    if (e.dead || e.leaked) continue;
    if (this.touched.indexOf(e) !== -1) continue;

    var reach = radius + e.radiusPx();
    var dx = e.pos.x - this.x;
    var dy = e.pos.y - this.y;
    if (dx * dx + dy * dy > reach * reach) continue;

    this.touched.push(e);

    // One shared rule for this recruit and every future friendly summon. A
    // surviving enemy consumes the whole block; a killed one consumes only
    // what it absorbed and leaves the unused HP on this body.
    return SummonContact.exchange(this, e, this.owner);
  }

  return 0;
};

// Presentation IDs are tier-specific so an art pack can replace B4 and B5
// independently, while the generic `soldier-recruit:*` remains a convenient
// one-model fallback for both.
SoldierRecruit.prototype.visualModelId = function () {
  return "soldier-recruit-" + String(this.visualTier || "B4").toLowerCase();
};

// The simulation point stays at the feet. Sprite packs and hover hit tests may
// use this lifted centre to match the rest of the three-quarter world.
SoldierRecruit.prototype.visualBodyY = function () {
  return this.y - (this.visualTier === "B5" ? 8 : 7);
};

// Clockwork infantry rather than a tiny rotated hexagon: planted feet at the
// path coordinate, articulated legs, an upright plated torso and a rifle aimed
// across the ground plane. B5 keeps the same silhouette but gains cool-steel
// armour, shoulder plates, a brighter core and a heavier rifle.
SoldierRecruit.prototype.draw = function (ctx) {
  var modelId = this.visualModelId();
  if (VisualModels.draw("summon", modelId + ":complete", ctx, this) ||
      VisualModels.draw("summon", "soldier-recruit:complete", ctx, this)) return;

  var elite = this.visualTier === "B5";
  var bodyY = this.visualBodyY();
  var bob = this.holding ? 0 : Math.abs(Math.sin(this.walkPhase)) * 0.65;
  bodyY -= bob;

  Visuals3Q.shadow(ctx, this.x, this.y + 2, elite ? 7.2 : 6.3,
    elite ? 3.1 : 2.7, elite ? 0.3 : 0.25, elite ? 8 : 7);

  var customBody = VisualModels.draw("summon", modelId + ":body", ctx, this,
    { elite: elite, bodyY: bodyY });
  if (!customBody) {
    customBody = VisualModels.draw("summon", "soldier-recruit:body", ctx, this,
      { elite: elite, bodyY: bodyY });
  }

  if (!customBody) {
    var dirX = Math.cos(this.facing);
    var dirY = Math.sin(this.facing) * Visuals3Q.GROUND_SQUASH;
    var dirLength = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    dirX /= dirLength;
    dirY /= dirLength;
    var sideX = -dirY;
    var sideY = dirX;
    var stance = this.holding ? 4.2 : 2.9;
    var stride = this.holding ? 0 : Math.sin(this.walkPhase) * 1.7;
    var trim = elite ? "#a8ddf2" : "#d8b26c";
    var dark = elite ? "#172633" : "#251b14";
    var plate = elite ? "#3d596d" : "#4a3525";
    var lightPlate = elite ? "#58788c" : "#65492f";
    var glow = elite ? "#8eeaff" : "#ffd77a";

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Feet alternate while marching and spread into a stable brace while
    // firing. They stay at the actual collision point even though the torso is
    // lifted above it.
    for (var foot = -1; foot <= 1; foot += 2) {
      var step = stride * foot;
      var footX = this.x + sideX * stance * foot + dirX * step;
      var footY = this.y + sideY * stance * 0.45 * foot + dirY * step * 0.5;
      ctx.beginPath();
      ctx.ellipse(footX, footY, elite ? 3.2 : 2.8, 1.45,
        Math.atan2(dirY, dirX), 0, Math.PI * 2);
      ctx.fillStyle = dark;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(footX, footY - 0.5);
      ctx.lineTo(this.x + sideX * 2.1 * foot, bodyY + 4.2);
      ctx.lineWidth = elite ? 2.3 : 2;
      ctx.strokeStyle = trim;
      ctx.stroke();
    }

    // Rifle behind the chest, projected onto the same compressed ground plane
    // as the road. The B5 barrel is only slightly longer, but its cyan rail and
    // broad muzzle make the upgraded squad readable in a crowd.
    var rifleStartX = this.x - dirX * 1.5;
    var rifleStartY = bodyY + 0.5 - dirY * 1.5;
    var rifleLength = elite ? 16.5 : 14;
    ctx.beginPath();
    ctx.moveTo(rifleStartX, rifleStartY);
    ctx.lineTo(this.x + dirX * rifleLength, bodyY + 0.5 + dirY * rifleLength);
    ctx.lineWidth = elite ? 3.2 : 2.7;
    ctx.strokeStyle = dark;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(this.x + dirX * 2, bodyY + 0.5 + dirY * 2);
    ctx.lineTo(this.x + dirX * rifleLength, bodyY + 0.5 + dirY * rifleLength);
    ctx.lineWidth = elite ? 1.65 : 1.35;
    ctx.strokeStyle = elite ? "#7fe4ff" : "#c89b45";
    ctx.stroke();

    // Compact backpack and upright torso. The offset upper face fixes the
    // board's light direction and gives the small body volume without a sprite.
    ctx.fillStyle = dark;
    ctx.fillRect(this.x - 5.2, bodyY - 3.7, 10.4, 8.8);
    ctx.beginPath();
    ctx.moveTo(this.x - 5.8, bodyY + 3.8);
    ctx.lineTo(this.x - 4.8, bodyY - 3.2);
    ctx.lineTo(this.x - 1.9, bodyY - 5.4);
    ctx.lineTo(this.x + 4.8, bodyY - 3.2);
    ctx.lineTo(this.x + 5.8, bodyY + 3.8);
    ctx.lineTo(this.x, bodyY + 5.6);
    ctx.closePath();
    ctx.fillStyle = plate;
    ctx.fill();
    ctx.lineWidth = elite ? 1.7 : 1.4;
    ctx.strokeStyle = trim;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.x - 3.8, bodyY - 2.9);
    ctx.lineTo(this.x - 1.5, bodyY - 4.4);
    ctx.lineTo(this.x + 3.4, bodyY - 2.7);
    ctx.lineTo(this.x + 1.2, bodyY - 0.6);
    ctx.closePath();
    ctx.fillStyle = lightPlate;
    ctx.fill();

    // B5 keeps the B4 chassis but adds small shoulder plates and a crown fin.
    // That is enough distinction at game scale without making it look like a
    // different summon family.
    if (elite) {
      [-1, 1].forEach(function (side) {
        ctx.beginPath();
        ctx.moveTo(this.x + side * 4.2, bodyY - 3.4);
        ctx.lineTo(this.x + side * 7.2, bodyY - 1.8);
        ctx.lineTo(this.x + side * 5.7, bodyY + 0.8);
        ctx.lineTo(this.x + side * 3.6, bodyY - 0.2);
        ctx.closePath();
        ctx.fillStyle = "#4f7187";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = trim;
        ctx.stroke();
      }, this);
      ctx.beginPath();
      ctx.moveTo(this.x, bodyY - 8.9);
      ctx.lineTo(this.x + 2.1, bodyY - 5.3);
      ctx.lineTo(this.x - 2.1, bodyY - 5.3);
      ctx.closePath();
      ctx.fillStyle = trim;
      ctx.fill();
    }

    // Helmet, visor and chest core. The visor shifts toward the facing side so
    // the unit reads as aimed even though the upright body itself never rolls
    // flat onto the road.
    ctx.beginPath();
    ctx.ellipse(this.x, bodyY - 6.1, elite ? 4.6 : 4.2,
      elite ? 3.7 : 3.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = trim;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(this.x + dirX * 1.2, bodyY - 6.2 + dirY * 0.8,
      elite ? 2.8 : 2.5, 1.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, bodyY + 0.8, elite ? 1.8 : 1.45, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = elite ? "rgba(220,250,255,0.9)" : "rgba(255,238,184,0.9)";
    ctx.stroke();

    ctx.restore();
  }

  // Health bar remains shared chrome even when a pack replaces only the body.
  var frac = this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
  var w = elite ? 21 : 19;
  var top = bodyY - (elite ? 12 : 11);
  ctx.fillStyle = "rgba(0,0,0,0.66)";
  ctx.fillRect(this.x - w / 2 - 1, top - 1, w + 2, 5);
  ctx.fillStyle = frac > 0.5 ? "#61d973" : (frac > 0.25 ? "#e8c34a" : "#e06a6a");
  ctx.fillRect(this.x - w / 2, top, w * frac, 3);
};
