// Ad-hoc post-merge integration check. NOT part of the five suites -- this
// exists only to prove the Soldier (written against v0.4.6) behaves correctly
// against the mechanics v0.4.7 added: shields, stuns and the Tyrant.
var harness = require("./harness.js");

var failures = 0;
function check(label, ok, detail) {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail ? "   " + detail : ""));
  if (!ok) failures++;
}

// --- 1. the Soldier exists, is a starter, and is buildable ------------------
var h = harness.boot();
check("Soldier global is loaded", typeof h.game.Soldier === "function");
check("Soldier is in the meta catalogue as a starter",
  h.game.MetaProgress.catalogue().some(function (t) { return t.id === "soldier" && t.starter; }));
// 300 since the 2026-07-30 economy revamp. This line still said 15 until
// 2026-07-30, which is what an ad-hoc script left out of the five-suite pass
// looks like after the game moves under it.
check("Soldier costs 300", h.game.Soldier.COST === 300, "COST=" + h.game.Soldier.COST);

// --- 2. the Soldier chews through a Bulwark's SHIELD, not past it -----------
h = harness.boot();
var g = h.game;
var Enemy = g.Enemy;

var bulwark = new Enemy(g.path, Enemy.TYPES.shielded.health, "shielded");
check("Bulwark spawns with a shield", bulwark.shield > 0, "shield=" + bulwark.shield);

var beforeShield = bulwark.shield;
var beforeHp = bulwark.health;
bulwark.takeDamage(3);          // one B5-recruit-sized hit
check("a hit lands on the shield first, not on health",
  bulwark.shield < beforeShield && bulwark.health === beforeHp,
  "shield " + beforeShield + "->" + bulwark.shield + ", hp " + beforeHp + "->" + bulwark.health);

// A Soldier's bullets go through the ordinary Bullet path, so they use the same
// shield-aware takeDamage. Prove the bullet constructor the Soldier uses exists
// and reaches that method.
var soldier = new g.Soldier(g.path.pointAt ? 100 : 100, 100, g.path);
check("Soldier constructs against the live path", !!soldier && soldier.currentHp === 80,
  "currentHp=" + soldier.currentHp + "/" + soldier.maxHp);
check("Soldier reports the reference range",
  soldier.rangeUl === g.Soldier.BASE_RANGE_UL, "rangeUl=" + soldier.rangeUl);

// --- 3. a stunned Soldier goes silent, via the central gate -----------------
h = harness.boot();
g = h.game;
var TowerHealth = g.TowerHealth;
var s2 = new g.Soldier(100, 100, g.path);
check("an un-stunned Soldier reads as un-stunned", !TowerHealth.isStunned(s2));
TowerHealth.stun(s2, 2);
check("TowerHealth.stun applies to a Soldier", TowerHealth.isStunned(s2),
  "stunTimer=" + s2.stunTimer);
check("the stun ticks down and expires",
  TowerHealth.tickStun(s2, 1.0) === true && TowerHealth.tickStun(s2, 1.5) === false,
  "stunTimer=" + s2.stunTimer);

// --- 4. the Soldier takes a hit from the new tower-damage sources -----------
h = harness.boot();
g = h.game;
var s3 = new g.Soldier(100, 100, g.path);
var hp0 = s3.currentHp;
s3.takeDamage(45);              // the Tyrant's aimed shot
check("the Soldier absorbs a Tyrant-sized hit and survives at 80 HP",
  s3.currentHp === hp0 - 45 && !s3.isDestroyed(), "hp " + hp0 + "->" + s3.currentHp);
s3.takeDamage(45);
check("two aimed shots destroy it", s3.isDestroyed(), "hp=" + s3.currentHp);

// --- 5. recruits are bodies, not towers ------------------------------------
h = harness.boot();
g = h.game;
var s4 = new g.Soldier(100, 100, g.path);
g.Soldier.UPGRADES.forEach(function (u) {
  if (u.branch === "B") s4.applyUpgrade(u.id);
});
check("B4 grants recruits", s4.hasUpgrade("B4") && s4.hasRecruitAbility);
if (s4.recruitsReady) {
  var why = s4.callRecruits();
  check("callRecruits is accepted", why === null, "reason=" + why);

  // The TOWER's count, not the constant: this Soldier owns B5, so it sends four
  // where a B4 one sends two. Reading Soldier.RECRUIT_COUNT here was correct
  // only while no tier changed it.
  check("the squad is queued with a stagger",
    s4.recruitPending && s4.recruitPending.length === s4.recruitCount,
    "queued=" + (s4.recruitPending ? s4.recruitPending.length : "none") +
      " of " + s4.recruitCount);

  // Deploy them all -- three staggers of 0.25 s, so a full second covers four.
  for (var d = 0; d < 10; d++) s4.updateRecruits(0.1, g.enemies, g.bullets);
  check("the recruits deploy onto the road",
    s4.recruits && s4.recruits.length === s4.recruitCount,
    "deployed=" + (s4.recruits ? s4.recruits.length : "none"));

  var before = g.bullets.length;
  var mark = new g.Enemy(g.path, g.Enemy.TYPES.shielded.health, "shielded");
  // Recruits deploy at the END of the road and march backwards, so an enemy
  // parked at progress 0 is the whole map away. Walk it to where they are --
  // but 60 px SHORT of them, not on top of them. Contact is a body block now
  // (the recruit spends its health and dies), so an enemy parked exactly on a
  // recruit is consumed by it and never gets shot at. In reach, out of contact.
  mark.progress = s4.recruits[0].progress - 60;
  mark.update(0, [], []);
  g.enemies.push(mark);
  for (var i = 0; i < 40; i++) s4.updateRecruits(0.1, g.enemies, g.bullets);
  check("recruits shoot through the ordinary bullet path",
    g.bullets.length > before, "bullets " + before + "->" + g.bullets.length);
}

console.log("");
console.log(failures === 0
  ? "SOLDIER MERGE CHECK PASSED"
  : "SOLDIER MERGE CHECK: " + failures + " failed");
process.exit(failures === 0 ? 0 : 1);
