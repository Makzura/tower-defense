// ---------------------------------------------------------------------------
// Bullet
//
// A homing projectile. Tracks its target and applies damage on contact.
// Removes itself if the target dies before it lands.
//
// update() returns the damage dealt this frame (0 on most frames). The game
// loop turns that into cash, so no global state is needed here.
//
// A bullet CLAIMS its damage on the target the moment it is fired, and gives
// the claim back when it lands or loses the target. That claim is what stops
// two gunners from both shooting a 1 HP enemy -- see Enemy.unclaimedHealth.
// Claiming here rather than in Tower.fire means it cannot be forgotten by a
// future tower type that fires differently.
// ---------------------------------------------------------------------------

// `onHit` is optional: a callback invoked as onHit(target, damageDealt) at
// the moment this bullet lands. It exists so a tower type whose mechanics
// depend on ITS OWN shots can react to them -- Longshot uses it for
// kill-stacking attack speed, for its damage counter, and to spread a
// piercing shot onto the enemies behind the one it hit.
//
//
// Deliberately a callback and not a `firedBy` tower reference: bullets still
// do not know what shot them, so selling a tower still cannot cancel damage
// already in flight (the callback simply lands on an object no longer on the
// board, which is harmless). Keep it that way.
// `defenseFlatPierce` is percentage POINTS of an enemy's `defense` this shot
// ignores (the Rifleman's B4). It moved off flat armor and onto defence on
// 2026-07-30 -- see js/systems/mitigation.js. It rides on
// the BULLET rather than being looked up from the owner at impact, because the
// shot's damage is already fixed at the moment it is fired -- selling or
// upgrading the tower mid-flight must not change what is already in the air,
// exactly as `damage` does not change.
//
// It deliberately does NOT affect the claim below. Claims reserve RAW damage
// and always have: a gunner claims 1 on a brute even though armor eats all of
// it. Making pierce the one source that claimed post-mitigation damage would
// give it a different meaning on one tower than on the other four.
// WHERE A SHOT MEETS THE MAP, or null when it does not -- and null instantly on
// the six boards that have no terrain, which is a function-exists check rather
// than a shape loop.
//
// Routed through the game's own `terrainHit` rather than reaching for the map
// here: bullet.js has never known what a map is, and the one place that knows
// which list terrain lives in should stay one place.
function terrain(ax, ay, bx, by) {
  if (typeof terrainHit !== "function") return null;
  return terrainHit(ax, ay, bx, by);
}

function Bullet(x, y, target, damage, onHit, owner, defenseFlatPierce) {
  this.x = x;
  this.y = y;
  this.target = target;
  this.damage = damage;
  this.defenseFlatPierce = defenseFlatPierce || 0;
  this.onHit = onHit || null;

  // The tower that fired this, for crediting damage and kills to its panel.
  // Like onHit, it is deliberately NOT used to steer or cancel the bullet:
  // selling a tower leaves its shots in the air, still homing and still
  // paying out.
  this.owner = owner || null;
  this.speedUlps = Bullet.BASE_SPEED_ULPS;
  this.dead = false;

  this.claimed = false;
  if (target) {
    target.reserveDamage(damage);
    this.claimed = true;
  }
}

Bullet.BASE_SPEED_ULPS = 562.5; // u.l./s

// Hand the claim back. Safe to call more than once.
Bullet.prototype.release = function () {
  if (!this.claimed) return;
  this.claimed = false;
  this.target.releaseDamage(this.damage);
};

Bullet.prototype.update = function (dt) {
  if (!this.target || this.target.dead || this.target.leaked) {
    this.release();
    this.dead = true;
    return 0;
  }

  var dx = this.target.pos.x - this.x;
  var dy = this.target.pos.y - this.y;
  var distance = Math.sqrt(dx * dx + dy * dy);
  var step = ul(this.speedUlps) * dt;

  if (distance <= step) {
    this.x = this.target.pos.x;
    this.y = this.target.pos.y;
    this.dead = true;
    // Release BEFORE the hit: the claim exists to reserve damage that has not
    // landed yet, and this one is landing right now.
    this.release();
    var dealt = TowerScore.apply(this.owner, this.target, this.damage, 0,
      this.defenseFlatPierce);
    if (this.onHit) this.onHit(this.target, dealt);
    return dealt;
  }

  // TERRAIN, ON THE SEGMENT ABOUT TO BE FLOWN, not on the point about to be
  // landed on. A homing round at 900 u.l./s covers fifteen units in a step; a
  // point test would sample either side of a boulder and never inside it.
  //
  // The claim is released on the way out. A claim is a reservation on damage
  // that has not landed, and this one never will -- leaving it held would make
  // the tower think that enemy is already spoken for and refuse to shoot it
  // again, which reads as the tower going quiet for no reason.
  var nx = this.x + (dx / distance) * step;
  var ny = this.y + (dy / distance) * step;
  var hit = terrain(this.x, this.y, nx, ny);
  if (hit) {
    this.x = hit.x;
    this.y = hit.y;
    this.dead = true;
    this.release();
    if (typeof Effects !== "undefined" && Effects.terrainImpact) {
      Effects.terrainImpact(hit.x, hit.y);
    }
    return 0;
  }

  this.x = nx;
  this.y = ny;
  return 0;
};

Bullet.prototype.draw = function (ctx) {
  if (VisualModels.draw("projectile", "bullet", ctx, this)) return;
  var dx = this.target && this.target.pos ? this.target.pos.x - this.x : 1;
  var dy = this.target && this.target.pos ? this.target.pos.y - this.y : 0;
  var length = Math.sqrt(dx * dx + dy * dy) || 1;
  var dirX = dx / length;
  var dirY = dy / length;
  var py = this.y - 5;

  Visuals3Q.shadow(ctx, this.x, this.y + 2, 4.5, 1.8, 0.18, 5);

  ctx.beginPath();
  ctx.moveTo(this.x - dirX * 12, py - dirY * 8);
  ctx.lineTo(this.x, py);
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,202,92,0.28)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(this.x, py, 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,224,140,0.22)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(this.x, py, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffe08c";
  ctx.fill();
};


// ---------------------------------------------------------------------------
// PierceBullet
//
// A projectile that travels in a STRAIGHT LINE and passes through the enemies
// it hits, rather than homing onto one and vanishing.
//
// How it works, and the whole point of it:
//
//   - It is fired along a fixed heading. Nothing steers it afterwards.
//   - When it touches an enemy it deals its CURRENT damage, spends one point
//     of pierce, steps its damage down the falloff curve, and CARRIES ON
//     along the same line.
//   - It dies when pierce runs out, when the falloff drives its damage to
//     zero, or when it has flown as far as the tower can shoot.
//
// So "infinite pierce" does not mean "hits everything on screen" -- it means
// the shot keeps going, so in a crowd the whole LINE behind the first enemy
// gets hit, and nothing off that line does. Which enemies are behind the
// first one is a property of where they are standing, not of the tower.
//
// This is deliberately not the homing Bullet above: a homing projectile has
// exactly one target by definition, which is the wrong shape for a shot whose
// entire behaviour is about what it runs into on the way.
// ---------------------------------------------------------------------------

// How close the projectile's centre must come to an enemy's centre to count
// as a hit. In u.l. like every other distance -- it is a world size, not a
// drawing detail, because it decides whether a shot connects.
PierceBullet.HIT_RADIUS_UL = 12;

function PierceBullet(opts) {
  // opts: { x, y, angle, damage, pierce, hasFalloff, falloffParams,
  //         maxTravelPx, primary, onHit }
  this.x = opts.x;
  this.y = opts.y;
  this.dirX = Math.cos(opts.angle);
  this.dirY = Math.sin(opts.angle);

  this.baseDamage = opts.damage;      // damage on first contact (d0)
  this.pierce = opts.pierce;          // ADDITIONAL enemies after the first
  this.hasFalloff = opts.hasFalloff;
  this.falloffParams = opts.falloffParams;

  this.maxTravelPx = opts.maxTravelPx;
  this.travelled = 0;

  this.hitCount = 0;
  this.hitEnemies = [];               // never hit the same enemy twice
  this.onHit = opts.onHit || null;
  // Per-shot, because path A's graft tiers turn the weapon into a rail cannon
  // and its shot stops being a thing that flies. The tower that fires it is
  // the only thing that knows; defaulting keeps every existing caller intact.
  this.speedUlps = opts.speedUlps || Bullet.BASE_SPEED_ULPS;
  this.dead = false;

  // COSMETIC ONLY. Which path the tower that fired this has bought, so the
  // bolt and its impact can carry that path's colour. Nothing in update(),
  // currentDamage(), the claim or the hit test reads it, and a shot with no
  // tint behaves identically -- it is carried here rather than looked up
  // because a bullet outlives the frame it was fired in and must not hold a
  // reference back to its tower.
  this.tint = opts.tint || null;

  // Also cosmetic: how the shot should be DRAWN. From A4 the weapon is a rail
  // cannon and the shot reads as a lance rather than a bolt. Same rule as
  // `tint` -- nothing in update(), currentDamage(), the claim or the hit test
  // looks at it.
  this.style = opts.style || null;

  // Also cosmetic: how high off the ground the barrel that fired this sits,
  // so the shot is DRAWN at barrel height while its real position stays on
  // the flat plane it does its hit tests on -- the same split Enemy uses
  // between `pos` (the feet) and visualBodyY (where the body is painted).
  this.liftUl = (typeof opts.liftUl === "number") ? opts.liftUl : null;

  // Cosmetic: this is the fourth-of-four shot, the one B5 guarantees a crit
  // and a full execute bonus on. It gets a separate covenant-round silhouette
  // and contact mark. Nothing in the damage path reads it -- the actual crit is decided in
  // ConfiguredTower.fire, and this only marks the shot so it can be seen.
  this.empowered = !!opts.empowered;

  // Claiming (see Bullet above and AGENTS.md) is defined for a homing shot
  // with one known target, which this is not. It still claims on the enemy it
  // was AIMED at, which is the one another tower might otherwise waste a shot
  // on; the extra enemies it happens to pass through are not claimed, so two
  // Longshots covering the same crowd can overlap on those. Documented as a
  // known limitation rather than pretended away.
  this.primary = opts.primary || null;
  this.claimed = false;
  if (this.primary) {
    this.primary.reserveDamage(this.baseDamage);
    this.claimed = true;
  }
}

PierceBullet.prototype.release = function () {
  if (!this.claimed) return;
  this.claimed = false;
  this.primary.releaseDamage(this.baseDamage);
};

// Damage this shot deals to the NEXT enemy it touches, given how many it has
// already gone through. The falloff formula lives in js/systems/pierce.js so
// there is one copy of it -- which means any page that fires one of these
// must load that file. Both sandbox.html and index.html do: since 2026-07-28
// the shipping game has the Longshot in its build bar, so it constructs these
// for real.
PierceBullet.prototype.currentDamage = function () {
  if (!this.hasFalloff) return this.baseDamage;
  return Pierce.damageAtIndex(this.baseDamage, this.hitCount, this.falloffParams);
};

// The game loop hands the live enemy list in, because a straight-line shot
// has to find out what it ran into -- it has no target to ask.
PierceBullet.prototype.update = function (dt, enemies) {
  if (this.dead) return 0;

  var step = ul(this.speedUlps) * dt;

  // SWEEP THE SEGMENT, DO NOT SAMPLE THE ENDPOINT.
  //
  // This used to move the shot and then test a circle around where it landed.
  // That works only while a tick's travel is small next to an enemy: at the
  // base 562.5 u.l./s a step is about 10 px and nothing is missed. The moment
  // path A's rail tiers raised the speed to 14 000, a step became ~240 px and
  // the shot teleported clean over 22 px-wide bodies without ever testing
  // them -- it hit almost nothing.
  //
  // So the test is now against the whole SEGMENT travelled this tick, which
  // is what a straight-line shot has always meant. It is also strictly more
  // correct at the old speed, where a fast enemy crossing the line between
  // two samples could slip through.
  var fromX = this.x;
  var fromY = this.y;
  this.x += this.dirX * step;
  this.y += this.dirY * step;
  this.travelled += step;

  var dealt = 0;
  var hitRadius = ul(PierceBullet.HIT_RADIUS_UL);
  var segLen2 = step * step;

  // TERRAIN IS SWEPT ON THE SAME SEGMENT, FOR THE SAME REASON THE ENEMIES ARE.
  //
  // A rail shot at 14 000 u.l./s covers about 240 px in a step. Testing the
  // endpoint against a rock would sample one side of it and then the other and
  // report a clean flight both times -- the shot tunnels. Piercing does not
  // mean piercing terrain: the round goes through bodies and stops at the rock.
  //
  // `stopT` is where along THIS step the rock is, in the same parameter the
  // enemy candidates below are measured in, so the comparison is direct.
  var obstacle = terrain(fromX, fromY, this.x, this.y);
  var stopT = obstacle ? obstacle.t : 1;

  // Gather first, then apply IN ORDER ALONG THE SHOT. Array order is spawn
  // order, which is meaningless here -- and with a long sweep the falloff
  // would otherwise charge the far enemy full damage and the near one the
  // remainder, which is backwards. `t` is how far along the segment each
  // body sits, so sorting by it walks the line front to back.
  var candidates = [];
  for (var i = 0; i < enemies.length; i++) {
    var candidate = enemies[i];
    if (candidate.dead || candidate.leaked) continue;
    if (this.hitEnemies.indexOf(candidate) !== -1) continue;

    var ex = candidate.pos.x - fromX;
    var ey = candidate.pos.y - fromY;
    var t = segLen2 > 0
      ? (ex * this.dirX * step + ey * this.dirY * step) / segLen2 : 0;
    if (t < 0) t = 0;
    if (t > 1) t = 1;

    var nearX = ex - this.dirX * step * t;
    var nearY = ey - this.dirY * step * t;
    if (nearX * nearX + nearY * nearY > hitRadius * hitRadius) continue;

    // ONLY WHAT IS IN FRONT OF THE ROCK. An enemy standing behind cover is not
    // a candidate at all -- it is never claimed, never damaged, and never
    // counted in the falloff, which would otherwise weaken the shot on bodies
    // it never reached.
    if (t > stopT) continue;

    candidates.push({ enemy: candidate, t: t });
  }
  candidates.sort(function (a, b) { return a.t - b.t; });

  for (var c = 0; c < candidates.length && !this.dead; c++) {
    var enemy = candidates[c].enemy;
    var damage = this.currentDamage();
    if (damage <= 0) {            // falloff has worn the shot out
      this.dead = true;
      break;
    }

    // The claim is spent the moment the shot reaches what it was aimed at.
    if (enemy === this.primary) this.release();

    this.hitEnemies.push(enemy);
    enemy.takeDamage(damage);
    // Pierce bullets apply their own hit before notifying the Longshot, so
    // they cannot go through TowerScore.apply. Read the same physical-damage
    // figure TowerScore uses: $0 Hive brood and shields still count on the
    // tower, while overkill does not.
    var landed = enemy.lastDamageTaken;
    dealt += landed;
    this.hitCount++;

    // PRESENTATION ONLY: B5's guaranteed fourth shot needs a point of
    // contact, not merely a differently coloured projectile. The bullet is
    // still resolved above by the exact same damage path and at the exact
    // same time; this hands the skin pack enough immutable shot data to draw
    // a brief covenant break over the body it actually touched.
    //
    // Keep this on PierceBullet rather than the Longshot adapter: a piercing
    // empowered round may physically touch a second enemy, and each contact
    // deserves its own mark. Nothing reads the effect back into simulation.
    this.leaveEmpoweredImpact(enemy);

    if (this.onHit) this.onHit(enemy, landed);

    // hitCount counts enemies gone THROUGH; pierce is how many may follow the
    // first, so the shot survives its (pierce + 1)th contact and stops there.
    if (this.hitCount > this.pierce) this.dead = true;
  }

  // THE ROCK STOPS IT, after everything in front of the rock has been resolved.
  // Placed here rather than before the loop so a shot that reaches two bodies
  // and then a boulder still pays out on both -- "stopped by cover" is not
  // "wasted".
  if (obstacle && !this.dead) {
    this.x = obstacle.x;
    this.y = obstacle.y;
    this.dead = true;
    if (typeof Effects !== "undefined" && Effects.terrainImpact) {
      Effects.terrainImpact(obstacle.x, obstacle.y);
    }
  }

  // Out of range, or off the map entirely.
  if (this.travelled >= this.maxTravelPx) this.dead = true;
  if (this.x < -50 || this.x > VIEW_WIDTH + 50 ||
      this.y < -50 || this.y > VIEW_HEIGHT + 50) {
    this.dead = true;
  }

  if (this.dead) {
    this.release();
    this.leaveRemnant();
  }
  return dealt;
};

PierceBullet.prototype.leaveEmpoweredImpact = function (enemy) {
  if (!this.empowered || !enemy || !enemy.pos) return;
  if (typeof Effects === "undefined" || !Effects.aoeImpact) return;

  Effects.aoeImpact(enemy.pos.x, enemy.pos.y, ul(17),
    "arcane-empowered-hit", {
      particles: false,
      life: 0.46,
      angle: Math.atan2(this.dirY, this.dirX),
      liftUl: this.liftUl,
      // Presentation metadata only. It lets a skin make the impact from the
      // 8k covenant round feel denser without ever re-deriving damage.
      potency: Math.max(0, Math.min(1, (this.baseDamage || 0) / 1500))
    });
};

// A BEAM HAS TO OUTLIVE ITS PROJECTILE.
//
// Once path A's rail tiers made the shot near-instant it crossed the board in
// about seven frames, so the beam registered as a flash and was gone -- the
// firing read as a bug rather than as a shot. A real beam leaves the eye's
// afterimage; this leaves the screen's.
//
// Emitted ONCE, on death, because that is the only moment the whole line is
// known: where it started and where it actually stopped, which depends on how
// much pierce survived the crowd. Purely feedback -- Effects is never read
// back by the simulation (see AGENTS.md), and a shot with no `style` (every
// tier below A4) emits nothing at all.
PierceBullet.prototype.leaveRemnant = function () {
  if (!this.style || this.remnantLeft) return;
  if (typeof Effects === "undefined" || !Effects.aoeImpact) return;
  this.remnantLeft = true;

  var originX = this.x - this.dirX * this.travelled;
  var originY = this.y - this.dirY * this.travelled;
  var base = Math.max(1, this.baseDamage || 1);

  Effects.aoeImpact((originX + this.x) * 0.5, (originY + this.y) * 0.5,
    this.travelled * 0.5, "lance-remnant", {
      particles: false,
      life: this.style === "meridian" ? 0.34 : 0.24,
      x1: originX, y1: originY, x2: this.x, y2: this.y,
      tint: this.tint, style: this.style, liftUl: this.liftUl,
      baseDamage: base,
      endDamage: this.currentDamage()
    });
};

PierceBullet.prototype.draw = function (ctx) {
  if (VisualModels.draw("projectile", "pierce", ctx, this)) return;
  // The Arcane Sniper's shot: a glowing mana bolt with a trailing wake, so the
  // LINE it is travelling -- the thing that decides what it will hit -- is
  // still the most visible part of it. Pixel sizes here are cosmetic, like
  // every other draw() detail.
  //
  // Brightness and length scale with the shot's own damage and pierce, which
  // is how path A "makes shots brighter and more potent" without the projectile
  // needing to know anything about upgrade tiers: a bolt carrying 60 damage
  // through four enemies simply IS a bigger bolt than the base 10.
  var potency = Math.max(0, Math.min(1,
    (this.baseDamage - 10) / 55 + (this.pierce || 0) * 0.06));

  var length = 14 + 10 * potency;
  var tailX = this.x - this.dirX * length;
  var tailY = this.y - this.dirY * length;

  // Outer bloom.
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(this.x, this.y);
  ctx.lineWidth = 7 + 4 * potency;
  ctx.strokeStyle = "rgba(150,120,255," + (0.16 + 0.16 * potency).toFixed(3) + ")";
  ctx.stroke();

  // The bolt itself.
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(this.x, this.y);
  ctx.lineWidth = 3 + 1.5 * potency;
  ctx.strokeStyle = "rgba(186,164,255," + (0.7 + 0.3 * potency).toFixed(3) + ")";
  ctx.stroke();

  // White-hot core streak.
  ctx.beginPath();
  ctx.moveTo(this.x - this.dirX * length * 0.45, this.y - this.dirY * length * 0.45);
  ctx.lineTo(this.x, this.y);
  ctx.lineWidth = 1.4 + 1.2 * potency;
  ctx.strokeStyle = "rgba(240,236,255,0.95)";
  ctx.stroke();

  // Head.
  ctx.beginPath();
  ctx.arc(this.x, this.y, 3.5 + 2 * potency, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(232,226,255," + (0.8 + 0.2 * potency).toFixed(3) + ")";
  ctx.fill();
};
