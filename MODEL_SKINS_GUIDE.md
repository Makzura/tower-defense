# Changing models and skins

The game's art is now separated from its rules. `js/visual-models.js` owns a
small presentation registry named `VisualModels`; changing a renderer never
changes range, collisions, damage, pathing, health, rewards or targeting.

## Fastest way to add a skin pack

1. Copy `js/skins/example-pack.js` to a new file.
2. Put image assets in a folder such as `assets/my-pack/`.
3. Register only the models the pack changes.
4. Add the pack after `js/visuals.js` in both `index.html` and `sandbox.html`:

```html
<script src="js/visual-models.js"></script>
<script src="js/visuals.js"></script>
<script src="js/skins/my-pack.js"></script>
```

Anything the pack does not register keeps the built-in three-quarter model.
If a custom renderer returns `false`, that one frame also uses the built-in
fallback. Images load lazily, so the fallback remains visible while an asset
is downloading.

## Sprite skins

`registerSprite` is intended for PNG, WebP and SVG cut-outs. Coordinates refer
to the object's ground contact point. The default anchor is the bottom-centre
of the whole image, but that is only a convenient default for tightly cropped
still art; it is not a reliable ground contract for animated or directional
rendered sheets.

```js
VisualModels.registerSprite("enemy", "normal:body",
  "assets/my-pack/normal.webp", {
    width: function (enemy) { return enemy.radiusPx() * 2.6; },
    height: function (enemy) { return enemy.radiusPx() * 3.2; },
    filter: function (enemy) {
      return enemy.flash > 0 ? "brightness(1.8)" : "none";
    },
    shadowColor: "rgba(170,215,230,0.25)",
    shadowBlur: 1.25
  });

VisualModels.registerSprite("tower", "soldier:body",
  "assets/my-pack/rifleman.png", {
    width: function (tower) { return tower.footprintPx * 2.5; },
    height: function (tower) { return tower.footprintPx * 3.1; },
    lift: 4
  });
```

## Two of these options will destroy your frame rate

**`filter` and the `shadow*` styles may only ever carry STATE, never ambient
decoration.** Neither is an ordinary canvas state change: each forces the
drawImage it wraps onto a separate surface, filters or blurs that surface and
composites it back, once per sprite per frame. Blitting 150 sprites costs about
6 ms; filtering and rimming the same 150 costs 25 more. The enemy pack shipped
with a resting `brightness(1.04)` and a constant rim, so no unit on the board
ever took the cheap path, and fifty enemies ran at 32 fps.

If a resting model wants to look different, **bake it into the sheet in
Blender**. If a live state wants to show, use `tint`:

```js
tint: function (enemy) {
  if (!enemy.flash) return null;                       // no cost at all
  return { color: "#FFFFFF", alpha: 0.2 + enemy.flash * 0.72 };
}
```

`tint` returns `{ color, alpha }` or null. It copies the tile into one shared
scratch canvas, floods it with the colour through `source-in` so the sprite's
own alpha is kept, and draws that silhouette over the sprite — two ordinary
blits, no filter pass, no per-sheet cache. It is how the shipped pack does its
hit flash and slow tint.

`filter`, `shadowColor`, `shadowBlur`, `shadowOffsetX` and `shadowOffsetY`
are optional presentation-only canvas styles. Like width and height, each may
be a fixed value or a function of the live subject. Styles are contained by
`save`/`restore`, and unsupported canvas filters are ignored, so they cannot
leak into another model or affect simulation state.

## Directional sprite sheets

`registerSpriteSheet` uses one tile per direction and animation frame. The
usual layout is one facing per row and one frame per column. Large atlases may
set `directionRows` lower than `directions`; later direction pages then sit to
the right, with one block of frame columns per page. The runtime chooses the
page and row automatically.

```js
var a5Size = function (tower) { return tower.footprintPx * 7.95; };
VisualModels.registerSpriteSheet("tower", "longshot:body-a5",
  "assets/sniper_body_a5.png", {
    frameWidth: 512,
    frameHeight: 512,
    frames: 1,
    directions: 48,
    directionRows: 16,
    direction: function (tower) {
      var aim = typeof tower.aim === "number" ? tower.aim : 0;
      return { x: Math.cos(aim), y: Math.sin(aim) };
    },
    width: a5Size,
    height: a5Size,
    lift: function (tower) { return -a5Size(tower) * 0.14; }
  });
```

The shipped Blender camera raises its view by `0.36` of a frame, so Blender
world origin `(0, 0, 0)` projects to `0.86` of the tile height measured from
the top. Bodies and transparent overlays are aligned to that invariant pivot:
for a destination height `h`, their lift is `-h * (1 - 0.86)`. Do not align a
rendered walk cycle to its lowest alpha pixel. A lifted foreground foot can
project below the planted rear foot, and using that changing pixel would make
the whole body bob. `contentTop` is a separate measured value used for labels
and health-bar placement; it is not a ground anchor.

`tools/blender/td_scene.py` checks every direction/frame tile for contact with
the outer three-pixel gutter. Treat any warning as clipping, even if the
combined sheet bounds look reasonable.

**Do not discover clipping by rendering.** The gutter check is the right safety
net and the wrong feedback loop: a 48-facing body is minutes of render, and the
Rifleman's first shipped pass came back with all seven groups clipping at once.
`make_preview.py --frame-riflemen` computes the answer instead. The camera is a
fixed linear projection -- `screen_right = x` and `screen_up = 0.56y + 0.829z`,
with the tile spanning `[-ortho/2, +ortho/2]` across and
`[-0.14*ortho, +0.86*ortho]` up -- so sweeping every evaluated vertex through
all 48 yaws and solving for the smallest safe `ortho_scale` takes seconds and
is exact. **The binding constraint is almost always the BOTTOM**, because
ground-level props swing toward the camera and only 0.14 of a tile sits below
the world origin: a prop at ground radius `r` reaches `0.56 * r` below it. Run
it after any pose or prop change and copy the line it prints. The Sniper's A5 and B5 source tiles are
512 and 384 pixels and the Rifleman's A5 and B5 are 384, each paging its 48
facings as three 16-row bands so they stay sharp at the game's maximum 3x
backing scale without exceeding conservative browser image-height limits. The
current regenerated runtime set uses `ASSET_VERSION = 13`; its measured
`contentTop` values are Normal `.8438`, Swarm `.6875`, Brute `.6937`, Hive
`.5750` (the taller shielded state), Sniper base `.7695`, A3 `.7539`, A4
`.5547`, A5 `.5625`, B3 `.7383`, B4 `.6406`, B5 `.5938`, and Rifleman base
`.6250`, A3 `.6836`, A4 `.6602`, A5 `.6250`, B3 `.6133`, B4 `.5820`, B5
`.6406`. The recruits are on the enemy tile at 128x160 and take the taller of
their two states, B4 `.8187` and B5 `.6875`, so a health bar cannot end up
inside the rifle the moment one stops to shoot. All four enemy base/shield
pairs and every Sniper, Rifleman and recruit runtime tile reported zero
outer-three-pixel edge hits.

**A summon that walks a path uses the ENEMY contract, not the tower one.** The
Rifleman's recruits get 8 facings and a cycle advanced by `progress` rather
than by a clock, exactly like a walking enemy, so a planted foot stays on one
patch of road. They add one thing enemies have no equivalent of: they STOP to
shoot, so `holding` selects a separate braced sheet whose recoil runs off the
recruit's own shot cooldown. Both sheets of a tier must share one `ortho_scale`
or the unit changes size the instant it stops -- and the HOLD state is the one
that sets it, because a level rifle reaches much further than a carried one.

**Two towers now share the camera but not the footprint, and that needs one
extra constant.** `draw-pack.js`'s `PX_PER_WORLD` expresses sprite size in
multiples of the subject's own `footprintPx`, and the Longshot's footprint is
20 u.l. while the Soldier's is 11.25. Reusing the Sniper's 1.529 for the
Rifleman would draw a man roughly half the height of the man beside him, so
the Rifleman's own constant is scaled by the footprint ratio. Any third
rendered tower with a different footprint needs the same correction; the
invariant to preserve is that one Blender world unit is the same number of
pixels on every model.

Normal, Swarm, Brute and Hive use aligned sheet pairs named `<id>_walk.png`
and `<id>_walk_shielded.png`. The shipped wrapper selects the second only
while the live instance has `shield > 0`; loading failure falls back to the
base sheet, and a broken shield selects the base immediately. Shield-only
geometry must stay on the same animated rig and camera, add compact projector
hardware rather than a baked dome, and remain hidden for both render and
viewport in a clean preview `.blend`. The runtime owns the separated energy
field, so a replacement sheet should not paint another bubble over it.

Procedural light drawn over a directional model must use the same snapped
direction row as the sprite. The shipped sniper pack stores per-group
Blender-local `[forward, side, height]` points for muzzles, coils, chambers,
fissures, runes and the B5 ritual source, then projects them through the
snapped sprite basis. Using the tower's continuous aim vector or percentages
of a generic barrel makes the effect visibly slide off the rendered hardware.
The Rifleman does the same for its muzzle flash, and its anchor table is the
literal output of `tower_rifleman.py`'s `main()`.

**An accent layer may only sit on geometry the animation never moves.** A
one-frame accent sheet is composited over every frame of an animated body, so
anything it clips to has to be bit-identical across those frames. The Rifleman
has four such seats -- the hat, the receiver rail, the fore-end and the
shoulders -- chosen because they are also the parts visible from all 48
facings; its bolt, drum, ejected case, loader arm and trigger arm are the only
things allowed to move, and none of them carries an accent.
`make_preview.py --validate-riflemen` asserts the seats' world matrices are
identical on all four frames, because this failure is invisible in a still.

Custom `:body` renderers also replace any platform or grounding painted inside
the fallback body branch. If the replacement art contains no complete base,
its wrapper must draw its pad/contact shadow before the sprite. The shipped
normal-enemy wrapper adds a small contact-occlusion ellipse to join its planted
foot to the existing directional cast shadow, while the sniper wrapper draws a
flat faction pad and shadow without changing the gameplay footprint.

One limitation of flattened layers is foreground depth. A4+B2 has magenta
parts both behind and around opaque A4 hardware, so the shipped compositor
uses a restrained partial redraw of the A4 body after the accent. It restores
the teal foreground read, but is not an exact depth solution; that would need
a third Blender-authored holdout/depth mask. Do not generalise that correction
to unrelated crosspaths.

Use `:body` for ordinary skin swaps. The game continues to draw health bars,
range circles, status rings, beams and ability feedback around the new body.
Use `:complete` only when the pack needs to replace the whole object renderer.

## Code-drawn models

Any renderer can draw directly on the canvas. Its subject is live but must be
treated as read-only.

```js
VisualModels.register("effect", "arcane-aoe", function (ctx, impact) {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(impact.x, impact.y, impact.radius,
    impact.radius * 0.56, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
});
```

A whole pack can also be installed at once:

```js
VisualModels.install({
  enemy: { "normal:body": drawNormal, "fractal_slime:body": drawSlime },
  tower: { "soldier:body": drawRifleman },
  summon: { "soldier-recruit-b4:body": drawRecruit },
  projectile: { bullet: drawBullet },
  effect: { "arcane-aoe": drawArcaneImpact }
});
```

## Available model IDs

### Towers

- `smasher`, `longshot`, `siphon`, `soldier`, `gunner`
- add `:body` to replace only the model/skin
- add `:complete` to replace everything drawn by that tower
- add `:icon` to replace its build-bar and Index icon

### Friendly summons

- `soldier-recruit-b4:body` and `soldier-recruit-b5:body` replace the two
  Rifleman recruit bodies independently
- `soldier-recruit:body` is the shared fallback for both tiers
- use the same IDs with `:complete` to replace the body and health bar together
- future summons belong to this `summon` category, separate from towers and
  enemies, so a whole summon art pack can also register `summon/*`

### Enemies

Add `:body` or `:complete` to any enemy type ID:

`normal`, `fast`, `slow`, `swarm`, `fractal_slime`, `armored`, `brute`,
`colossus`, `camo_normal`, `camo_fast`, `flying`, `angry`, `midboss`,
`shielded`, `revenant`, `hive`, `boss`, `shieldbearer`, `healer`, `boss_fast`,
`camo_heavy`.

### Projectiles

- `bullet` for ordinary bullets
- `pierce` for the Arcane Sniper's travelling piercing shot

`bullet` is shared by every homing shot in the game, so a renderer for it must
return `false` for anything it does not own or it will repaint the whole board.
The shipped pack keys off `shotBody`, a presentation-only string the Rifleman
stamps on its rounds at fire time; a shot without one falls through to the
built-in bolt. `liftUl` rides alongside it and is the barrel height the round
left from -- draw the picture lifted by it, and leave the real position on the
ground plane where the hit tests happen.

### Maps

- generic fallbacks: `terrain`, `road`
- per-map overrides: `<map-id>:terrain` and `<map-id>:road`
- map IDs: `rune-circuit`, `mana-coil`, `sigil-lattice`, `null-meridian`,
  `shifting-ley`, `twin-confluence`

The terrain renderer receives `{ width, height, map }`. The road renderer
receives `{ route, map, roadWidth }`. Return `false` to keep the built-in
terrain or raised road.

### Effects

- `warbringer-swing`
- `warbringer-hit`
- `warbringer-blast`
- `arcane-aoe`
- `rifleman-hit` for every round the Rifleman or its recruits land; carries the
  same `shotBody` as the shot that made it, so each tier's impact matches its
  weapon
- `b5-strike` for Arcane Sniper B5's ability detonation
- `arcane-empowered-hit` for each enemy touched by B5's guaranteed fourth round
- `lance-remnant` for the brief line left by Arcane Sniper A4/A5 projectiles

### Category fallback

Register the ID `*` to handle every otherwise-unregistered model in a
category. This is useful for a complete themed enemy or map pack. A more
specific ID always wins.

## Removing or swapping a pack at runtime

```js
VisualModels.unregister("enemy", "normal:body");
VisualModels.clear();
```

`unregister` removes one model. `clear` removes every registered override and
immediately restores the built-in three-quarter presentation. `ids(category)`
lists the overrides currently installed in a category.
