# Tower Defense — change log

Newest at the top. Date, what changed, why.

**This is history, not rules.** The operative document is `AGENTS.md`: hard
constraints, architecture, mechanics, the model contract and the current
values all live there, and that is the file to read before changing anything.
This one exists so that reading the rules does not mean scrolling past every
decision ever made — it was half of `AGENTS.md` by line count, and a rules
document nobody finishes reading is a rules document nobody follows.

Add an entry here for every change, and fix the rule in `AGENTS.md` in the
same edit. An entry that records a new invariant without writing it into
`AGENTS.md` is how the two drift apart.

**2026-08-27 — The world has a clock: a deterministic day/night cycle with a
real sky.** Visual only. No combat bonus, no enemy or tower modifier, no wave or
economy effect, and a test asserts it: the same run at midnight and at noon
kills the same enemies for the same money.

Three files, because it is three jobs. `EnvironmentCycle` owns solar time and
knows nothing about towers. `EnvironmentLighting` turns that into sky, sun,
moon, fog and light, and composes future modifiers. The renderers read the
result off `worldRenderState` and never compute a phase — the moment two of them
derive a sky colour independently they drift.

Eight simulated minutes a cycle, opening at 0.10 — early morning, sun already up
and still climbing. The clock rides the fixed step and nothing else, so pausing
freezes the sky, 3x accelerates it and the menu has no clock, none of which is
written in the cycle: the line it rides was already gated and already called
more often at speed. There is no wall clock in either file.

Crossings are walked rather than compared. A step can be enormous and a
before/after phase check keeps the last crossing and loses the rest; one test
hands the cycle three and a half days in a single call and counts six events.

`js/gl/gl-sky.js` is new: a real pass on its own program, before the world, with
a gradient, a twilight band that sits just above the skyline, the sun, the moon
and a star field. The key light has a colour now — it was `vec3(key)`, white,
always — so dawn rakes amber, noon is neutral and midnight is a weak cool moon
that still separates silhouettes. `GLRenderer.setLighting` / `resetLighting`
make the old fixed rig an authored default rather than a constant.

Ironwood Frontier is the demonstration. Its settlement lanterns and windows come
up at dusk and go out at dawn, driven by ONE uniform — `uGlow` already scales
every emissive vertex in the map pass, so nothing rebuilds a hundred thousand
triangles to switch on a lamp. Its depot burns red, on its own per-prop accent,
so at night the two ends of the road say what kind of place they are before a
player reads a label.

Three bugs worth recording, all found by probing the framebuffer rather than by
looking.

The sky compiled, linked, returned valid uniform locations and drew NOTHING: it
had been built against a bare `gl` that this module does not have, which
resolved to something on the global object instead of throwing. The board still
looked right, because the clear colour is the sky's own horizon colour — so the
gradient, the band, the sun, the moon and the stars were all missing behind a
background of exactly the right shade. `GLSky.create` no longer swallows its
errors either.

The star field returned zero everywhere because `smoothstep(0.105, 0.0, d)` is
UNDEFINED in GLSL when edge0 >= edge1, and this driver's answer is a flat zero.
And the field it replaced was a 3D lattice a view ray only grazes, which put
about sixteen stars in a whole sky; it is celled on the dome now, where the hash
threshold IS the density.

The fog was blending 85% toward the sky, so a sunrise turned every tree on the
board orange. Mist is lit BY the sky; it does not become it. A fifth of the way.

Twenty tests. Suites 187 / 244 / 74 / 47 / 53, 0 failing.

**2026-08-27 — Ironwood Frontier: five invisible rocks, and a sky that was
there all along.**

**The rocks vanished, and the hitboxes stayed** — which is the shape of a
winding bug. `skin` wound its side faces top-left, top-right, bottom-right,
bottom-left; `frustum`, which works, winds them the other way round.
CULL_FACE/BACK ate every side face on every blocker, so what was left was the
cap and a view straight through the middle to the dirt. One line.

**And the stone and haze colours were on the WRONG THEME for a commit.** They
went onto the map above Ironwood in the file, which has neither a rock nor a
hill on it, so every lookup fell back to the machine colours and nothing I had
written about light tops and pale hills was doing anything at all.

**The sky.** Three rounds of "make the ground bigger" never produced one, and
the reason is arithmetic rather than art: the field of view is 32 degrees, so
the top of the frame sits at `fov/2 - pitch` above the horizon. At the old
12-degree pitch floor that is four degrees of sky, and at the default 34-degree
pitch the whole frame points downward and there is no horizon at any distance.
The hills were 1800 units tall at 2600 out — twenty degrees — so they filled
that band and then some, in near-black.

The floor is 9 degrees now, which buys seven degrees of sky. The hills are a
quarter of the size, topping out around two degrees, drawn in a pale haze
between the fog and the sky. The outermost tree belts came down 14 to 38 per
cent so the treeline sits under the hills rather than through them. There is a
horizon on this board for the first time.

Nothing measurable moved: Ironwood 0.792, the other seven unchanged, wave
compositions identical, suites 167 / 238 / 74 / 47 / 53, 0 failing.

**2026-08-27 — Ironwood Frontier: elevation, and the end of a rock being two
objects.**

**The rock you can see is now the rock you collide with.** Every blocker was
authored twice — a collision shape in `blockers` and a scenery prop in `models`
with a size of its own — and the two numbers were about a factor of two apart: a
blocker of radius 48 had a prop of SIZE 48, so it was drawn at half the width of
the thing a bullet stops against. Every rock on the board wore an invisible
skirt. The comment above those props claimed they were "drawn at the position and
size the blocker list authors", which is what a comment holding two numbers
together is worth.

There is one number now. `GLGeometry.solid` builds the rock FROM the compiled
shape and `Maps.drawSolids` does the same on the flat board: a circle's base ring
is exactly its radius, a polygon's bottom face is the authored polygon vertex for
vertex, a capsule is a barrel of exactly its radius — so a capsule's height is
twice its radius, because it is a log lying on the ground. A test asserts the
second copy stays gone, which is the only assertion that actually prevents this.

Two art corrections inside that. The first pass drew circles as five coaxial
rings, which is a terraced wedding cake, not stone — they are jittered per vertex
with drifting centres now. And it lit them with the machine colours, `metal` on
the sides and `panel` on top, where `panel` is the darker of the two on this
board: five rocks darker than the dirt they stand on. The theme carries `rock`
and `rockDark`, and the faces pointing at the sky are the light ones.

**Higher ground sees over lower things, and reaches further.** Every solid
declares a height and a line is only stopped by something standing higher than
the eye that cast it. Stumps are in that list — they were drawn as a metre of
standing timber from the first day and did not act like any. From the tallest
stump you look down over the other five and over the fallen log; from any of
them, over the low shelf; over the boulders, never.

Reach is a straight line, +1% per 1.6 u.l. of elevation, no cap: +15% on the
tallest stump, which is what was asked for, down to +6.6% on the shortest. Per
u.l. rather than per pixel, so retuning the unit does not retune the bonus. The
build ghost shows it before you commit — hover a stump and the ring grows.

The rounds obey the same rule as the eye, off the same number, because a tower
that can SEE something it cannot SHOOT is the worst possible pair of rules.

**And the world came in a touch**, as asked: the periphery is 12% closer and the
ground 4600 rather than 5400.

Two test spots moved, and both for the same reason rather than by hand: the
sandbox's firing position could be BUILT on but no longer SEE the road past two
stumps, and the pierce corridor at y = 300 runs straight through stump-p6. Both
are swept at run time now, and both assert what they need before using it.

Ironwood measures 0.792, normal. Wave compositions identical. Suites 167 / 238 /
74 / 47 / 53, 0 failing.

**2026-08-26 — Ironwood Frontier, playtest round three.** Three reports, and one
of them was a rule I had invented on my own.

**A tower is built where you clicked.** Placement used to SNAP to the middle of a
stump, so six of the board's best firing positions had exactly one pose each and
a click on a forty-pixel top landed somewhere the cursor was not. Nothing snaps
now: `resolveBuildPoint` answers which stump the footprint is standing on and
moves nothing. The rim is the only refusal — entirely on, or entirely off. The
"one tower per stump" limit went with it: if two footprints fit side by side on a
top, they fit, which is the answer open dirt already gave.

**A red wash under the ghost, and it means one sentence: if your footprint
touches red, the tower cannot go there.** Painted at the obstacles' true size —
the road at its own half-width, the blockers and both structures at theirs, the
ground other towers have taken, and every stump rim as a line, because on it and
off it are both legal and only crossing is not. A test samples three thousand
spots and asserts the wash and `whyCannotBuild` say the same thing.

Finding that also turned up a feature that has never once been on screen: the
sight shadows, asked for two rounds ago and written and tested then, were called
from two flat-only branches, so on the 3D board — which is every board — they
drew nothing. Both are drawn from one function called by both renderers now.

**The road's hard corners are authored, not guessed.** The previous round
classified corners by turn angle, which put four hard angles back into a track
the owner had already accepted as natural: "the path changed and now has weird
angles sometimes; the goal was not to change the path". The shape of a road is a
decision. A vertex marked `sharp: true` keeps its angle and every other vertex is
rounded; Ironwood marks none, and the capability stays for the boards that will.
Chords are capped by length rather than a flat count per span, so a long sweep is
subdivided as finely as a tight bend.

**And the sky is gone, which took a bigger world than 25%.** The ground and the
hills went out as asked, and it was not enough: at the flattest pitch and full
zoom-out the eye reaches about nineteen hundred units past the clearing, which
was beyond the whole treeline and in among the hills — the board went black
behind one seen from two hundred units away. The forest runs to three thousand
now, in ten belts, with the hills beyond all of them. Modest stems out to 1800,
where the camera can be, and enormous ones from 2300 out, where it cannot; 289k
triangles in one draw call, and the 2D fallback culls nine hundred of the
thousand props it can never show.

Ironwood measures 0.789, normal. Wave compositions identical. Suites 163 / 238 /
74 / 47 / 53, 0 failing.

**2026-08-26 — Ironwood Frontier, playtest round two.** Six defects the owner
found by playing the board, and one of them was mine twice.

The stumps were built from the boulder's lumpy-mass helper, and a stack of
jittered rings is a blob whatever colour it is — "they look like the blub model
but brown". A stump is a cylinder with bark on it, standing on roots, cut flat
across the top, and it is built that way now: a tapered barrel, nine uneven bark
ridges, a level cut face and roots that flare out and DOWN into the dirt. It has
to survive being orbited, so there is no good side. The cut face is pale
heartwood, not the theme's mossy trim, which had made every top read as a lily
pad.

Towers sank into them because the prop invented its own height and the height
field did not know. `height` is declared per platform in the map now and both
read it. Radii and heights are all different — 29 to 40 wide, 11 to 25 tall;
six identical stumps read as stamped-out furniture.

Zoom-out went from 1.5× the framing distance to 1.18: at 1.5 the board was a lit
patch in a field of apron forest. And the horizon arrived — four rings of trees
that get bigger and denser going out, then a ridge line of low jagged hills
beyond them.

The road was drawn curved and WALKED straight, so enemies cut every corner the
picture had rounded. That was mine: I read "do not change the pathing
coordinates" as "smooth only the picture", which is the same lie as a rock you
can see not being the rock you collide with. The spline is applied once and
everything downstream reads it. Two bugs inside that fix, both mine — smoothing
every map lengthened Rune Circuit, the reference map whose length fixes the u.l.
scale, and a hundred and two tests went red at once (curving is opt-in per map
now); and the corner threshold compared against the interior angle, so nothing
qualified.

Suites 162 / 238 / 74 / 47 / 53, 0 failing.

**2026-08-26 — Ironwood Frontier: the flagship board, and the first map whose
scenery is also solid.** A logging road through old ironwood, from a mobile enemy
depot in the east to a fortified settlement in the west. Default map; every older
board stays selectable and unchanged, and no tower, enemy, wave, economy or meta
value moved.

`js/systems/map-geometry.js` is new and is the only place that knows what a shape
is. Circle, capsule, polygon; contains-with-footprint and first-crossing-along-a
segment; tangency counts as contact everywhere. Node-safe, no globals.

The map carries `blockers`, `landmarks` and `platforms` — solid rocks, the depot
and settlement, and six buildable stumps. Decorative foliage is in none of them.
Authored in pixels, converted once, cached per (map, UNIT_LENGTH); boards without
geometry share one frozen empty object and pay nothing.

One resolver serves the ghost, the block reason and the click, so a preview that
snaps to a stump and a click that builds beside it cannot happen. Sight is
injected into RangeFilter and reaches the classic towers through Targeting.pick.
Bullets sweep the segment they are about to fly: homing rounds die at the contact
point and release their claim, and a pierce shot resolves everything in front of
a rock before stopping at it. Three intentional exceptions: the B5 ritual is
global, the Warbringer's blast reaches behind cover it could not have acquired
through, and stumps grant no stats.

The difficulty measurement now rejects spots inside terrain and discounts road a
tower cannot see. The six bare boards score exactly what they always did;
Ironwood measures 0.804, normal, inside the 0.78–0.90 band without moving an
authored coordinate.

Twenty regression tests, self-tested by mutation. Four defects found by looking
at the live board rather than by running them: every prop rendered as a grey cube
because `scenery` had no case for the new kinds; the first fix framed the camera
on 900 units of apron and put the clearing in the far distance; raw "#rrggbb"
strings handed to the builder do not throw and rendered the depot's wheels bright
cyan; and the board was a lit rectangle in a void until the ground ran past what
the camera can see and the clear colour moved onto the mist.

**2026-08-26 — The balance pass, the meta rewrite, and a real result screen.**
Four coordinated changes at the owner's instruction, none of which touches the
wave schedule: every wave's composition is byte-identical afterwards (35 waves,
830 bodies, 25 939 effective HP, $2 594 clear, $22 321 kill), re-verified against
a snapshot taken before the work began.

**WARBRINGER** $700 → $600, 4.0 s → 3.5 s, 31.25 → 37.5 u.l., and A3/A4/A5
damage 7/10/14 → 9/13/18. A1, A2 and the whole of path B untouched. Two
consequences the brief did not name and that are real: the base range now EQUALS
what A1 granted, so under longest-value-wins A1 sells no range at all and the
upgrade card correctly stops advertising it; and path B's `rangeBonusUl` is
ADDITIVE on the base, so a full B reaches 77.5 u.l. rather than 71.25, and 62.5
rather than 56.25 at B4, without a line of path B moving.

**MONSTER TIERS** T3 floor 3 500 → 4 500, T4's exact threshold 6 666 → 7 777.
The easter egg still holds by equality alone (7 776 and 7 778 are T3) and the
tier is still fixed at the merge. T0–T2 untouched.

**SIPHON B5** now names `lifesteal: 0.30`. It carried no ratio and silently
inherited B4's 0.20 — the last tier of the drain path did not touch the drain.
`setParams` replaces rather than sums, asserted directly: 30%, never 20 + 30.

**ARCANE SNIPER** A5 damage 350 → 275, fireRate −0.15 → −0.05, cost 13 900 →
10 500, kill stacks 200/5 s → 75/4 s. The stacks were the problem rather than the
damage: a cone that kills faster stacks faster, and +200% attack speed is a loop
a dense wave could reach and hold. A1's fireRate delta fell +0.25 → +0.15, which
is the one dial both finished builds share — A5 hands the ten hundredths back, so
A5+B2 is untouched at 455/0.60, while the B5, which never buys A5, slows to
exactly 0.20. B5 costs 18 000 rather than 23 300; its own numbers are unchanged.
Measured: A5+B2 455/0.60 with infinite pierce and a 24° cone, B5+A2 1590/0.20 at
25%/325% and pierce 1, pure B5 1575/0.05 and positive. The B5 out-damages the A5
single-target even at the 75-stack ceiling, which is the identity the two paths
are supposed to have.

**THE ABILITY HAD NO COOLDOWN.** `cooldownSeconds` was `null` with a TODO against
it, so the strongest button in the game was gated on its own stun and nothing
else. 60 s now, started AT ACTIVATION: the three seconds of ritual and seven of
exhaustion are already the price, and charging afterwards would charge twice for
the same ten. It ticks in `update()`, which is what makes pause, 3× speed and the
victory/defeat freeze carry it for free — no second clock, no wall time. Damage
25 000 → 18 000, still clearing the ~8 700 of fire the lockout costs. A refused
press spends nothing, and auto-ability inherits all three refusals because it
goes through the same `performAction` — proved by pressing it every frame for
thirty seconds and getting exactly one cast.

**THE META LOOP.** A fresh profile owns the Rifleman and nothing else. The
Warbringer is `starter: false`, 10 coins, gated on having reached wave 11 — and
the gate is enforced in `buy()`, which the store asks through a dry run rather
than re-deriving. Losing to the Midboss still unlocks it; the gate is the wave
reached. The payout ladder replaces "two a wave plus sixty": waves FINISHED
10/15/20/25/30 pay 5/10/18/28/40 and a clear pays 80, REPLACING the tier, so a
win is worth exactly twice dying on 34. One-time objectives pay 10/15/20/25 for
first reaching 11/20/25/30 and 25 for a first clear of each route, keyed on the
route ID. A first full clear on a fresh save and a new route is 175, measured.
`awardRun` returns sources rather than a number so the result screen can never
re-derive the award. The off-by-one that ladder could have been built on is
settled in one place: `wavesCompleted()` is the 0-based cursor in both states.

**MIGRATION.** Three fields join the save. Absent is not corrupt: an old profile
keeps its coins, towers, loadout and runs, keeps the Warbringer if it had it, and
starts every objective unclaimed. Nothing is paid retroactively. One number guard
and two list guards handle everything off disk; route ids are deliberately open,
so a save naming a map this build lacks loads rather than throws.

**THE RESULT SCREEN** replaces two overlays that had the same bones and drifting
copy. One panel for both endings, showing the route, the wave reached and
finished, base HP, cash, kills, the coins and where every one of them came from,
and the final stats of every tower still standing — read from each tower's own
`statLines()`, so a tower that keeps no healing simply has no healing row. No
invented zeroes. `Inspect battlefield` folds it to a tab; the board behind it is
as frozen as it was behind the panel, and the only permitted action is selecting
a tower to read it. Every button's geometry and hitbox come from one
`resultButtons()`.

**TWO WARBRINGER BLAST TESTS WERE REWRITTEN**, not weakened. They inferred the
damage source from hit points — "50 minus one 15-point blast" — and the wider,
faster Warbringer kills its front rank and re-acquires during its own wind-up, so
the body the swing "could not reach" is swung by the time the hammer lands.
Traced: the survivor takes an aoe 15 AND an aoe 22, and 22 is the tower's damage.
They ask the damage pipeline directly now, and the chain is proved by survival
arithmetic — 30 hit points against a 22-point swing means only a blast can have
finished them.

Suites 135 / 236 / 74 / 47 / 53, 0 failing, MANIFEST OK.
**2026-08-26 — The test board is redrawn, and the road stops being one width.**

At the owner's instruction: the map was *"too linear and boring"* — a winding
route with real turns, chokepoints at 40–50% width, a wide arena, islands the
path curves around, obvious tower zones, colour and light to guide attention, a
final gauntlet where enemies accelerate, and a crossing that does not feel like
a trudge.

**Most of that is not a data change, because a route could not do any of it.**
A route was a polyline and nothing else: one road width in `js/game.js`, one
speed off the enemy type. So the first half of this is a mechanism.

**A ROUTE MAY NOW DECLARE WHAT THE ROAD DOES ALONG ITS LENGTH.** Two profiles,
`width` and `pace`, authored as anchor lists over fractions of the route's own
length and ramped linearly between. Everything that reads the road reads them,
and each rule still has exactly one copy:

- `buildClearanceOn` is half of however wide the road is *here* plus the
  footprint — the same derivation `buildClearancePx` always made. **This is the
  whole point of a chokepoint**: the road pulls its edge in, the clearance ring
  comes with it, and a gun stands closer. Measured on the new board: 18.8 px
  from the centre line at the wire gate, 27.1 on open road, 45.3 in the basin,
  which through the Rifleman's own reach is 196.7 / 193.1 / 179.5 u.l. of road
  covered. A plaza is a real cost and a gate is a real reward, and both fall out
  of one derived rule rather than a bonus.
- `GamePath.ribbon` resamples the route with a per-point half-width, and the 3D
  mesh, the 2D board, the map card and the height field all build from it.
- The mitre that offsets a polyline is now **one function** (`roadEdges`, in
  `js/path.js`) shared by both renderers. It was already in `GLGeometry.road`;
  a second copy in the 2D pass would have drifted and the road's corners would
  be one shape on the board and another on the card.
- `Enemy.positionAt` scales the lane offset by the local width, so a wave falls
  into single file through a gate and spreads across a plaza. Measured on the
  lead body of wave 1: 2.4 px off the centre line at the wire gate, 7.4 in the
  basin.
- `currentSpeedUlps` multiplies by the local pace — the same shape of fact as a
  type's `sprint`, on the other side of the same seam: `sprint` belongs to the
  TYPE, pace belongs to the ROUTE. Multiplied, not substituted, so a slow still
  halves it.

**GRACE IS A CLOCK, and length was only ever a proxy for it.** `Maps.analyse`
scored a route's grace off its length, which stops being honest the moment the
road hurries bodies along one stretch and holds them on another.
`Maps.walkSeconds` integrates the reciprocal of the pace instead. On the six
boards that declare no profile it is the same division by the same arithmetic —
a board's published score is not the place to move a last decimal for nothing.

**ABSENCE IS EXACT.** A route with no profile gets 1 from both lookups through a
null check, gets its **own points array back** from `ribbon` (identity, not a
copy), and takes the original five strokes in the 2D pass. All six other boards
are provably untouched, and a test walks all six and pins it rather than trusting
the reasoning.

**THE BOARD ITSELF.** Eleven legs, nine turns, 731° of turning against the old
route's six right angles and 540°. In order: the muster yard just inside the
gate (1.90), the notch on the descent (0.68), the crossing narrowed onto the
bridge (0.90), two switchbacks 190 and 170 units apart around two islands, the
basin around the top corner (2.95) and the wire gate into the final gauntlet
(0.62, pace 1.55). Wide before tight, every time: the yard before the notch, the
mire before the bridge, the basin before the gate.

*It is longer and it takes less time.* 2 451 u.l. against 2 154 — fourteen per
cent more road — crossed in 39.8 s against 43.1, because the stretches where
nothing happens are walked quickly and the ones where something does are not.
Divided rather than walked this route would take 49.0 s. It scores **0.78
against the old 0.79**: as hard as what it replaced, with good spots covering
276.3 u.l. against 260.2.

*Four raised decks are the tower zones*, placed rather than scattered — the west
spur, the relay island inside the first switchback (ninety units from the lane
going out and ninety from the lane coming back, both inside a Rifleman's 100),
the knoll, and the camp deck. **Nothing stands on any of them:** props draw at
floor height whatever they are standing over, so a prop on a deck sinks into it,
and a deck is where the guns go. Energy nodes mark the corners instead. A
validator swept every prop and every deck against the road and the river's
no-build column; ten props and three decks moved before it came back clean.

**THE ROAD WAS INVISIBLE AND THAT WAS THE REAL FIX.** Black asphalt on black
dirt has no value contrast left to be seen by. The first build of the new route
rendered as a bare board — the width profile was working perfectly and could not
be seen at all. A theme may now declare `roadGlow`, which lays two emissive
lines along the kerbs; with them the notch, the basin and the wire gate read
from the opening camera. Paid for once on the way: **both strips were wound
inside-out**, so with `CULL_FACE/BACK` on they were culled on every frame and
the road had no lights and nothing anywhere said why.

*And the second colour.* `accent2` on this board was a bone grey, which on a
floor where everything is within a few stops of everything else is not a colour,
it is a lighter version of the same one. The board now argues in two lights: the
camp is an ember (barrels, watchtower lamp, the relay consoles they took over,
the arch at the base) and the buried facility is cold cyan (cable cores, sensor
masts, deck-corner nodes, the leaks in the ground). Cyan props declare `accent`
per prop — one draw call per colour, and the only way a prop owns its own light.

*Three ground colours instead of one.* New zone kinds `plate` (cracked floor
panel) and `flux` (ground the plant is leaking into) join `dirt`, all at height
0 — a patch, never a slab, because `levelUnder` refuses a footprint that
straddles a slab edge and a puddle built as a platform is an invisible no-build
ring.

*Two new scenery kinds.* `conduit`, a buried cable run laid parallel to the road
— the only prop in the game whose job is to point *along* something — and
`gate`, an arch that straddles the road at both ends of the route. **`gate` had
been declared three times by Twin Confluence since it was written and had no
case in the scenery switch at all**; every one of them was rendering as the
default block.

The river moved to x 420 and is still crossed exactly once, on the long straight
after the notch. That test no longer names `points[2]` and `points[3]` by number
— it *finds* the crossing and pins that there is only one, which is the thing
that actually matters and does not have to be edited every time a leg moves.

Suite: content 222 → 225. Three added, self-tested by four mutations.

**2026-08-26 — The forest board gets a river under a bridge, a grave at the
spawn, and a watchtower you could actually put somebody on.**

At the owner's instruction: *"in the test map, between the second and third
turn, add a small bridge that passes over a running river, the river should run
off the map dropping into the void. for the spawn, also make it look like the
enemies are coming out of a casket in the ground, adding some purpleish
lighting. remove teh stool on top of the sniper tower, allowing it to have
troops."*

**The route is untouched.** Six right-angle turns, 2 154 u.l., still measures
0.79. Everything below is scenery and terrain; `Maps.analyse` reads none of it.

**THE RIVER IS THE FIRST TERRAIN IN THIS GAME THAT IS NOT FLAT**, and the first
geometry anywhere that goes below the floor. It runs north–south, the road
crosses it exactly once — on the straight between the second and third turn,
which is the leg the player watches every wave walk down — and it leaves the
board over the near edge.

*The floor is one quad, so a river needs a hole in it.* `GLGeometry.river` builds
a channel that goes below z 0 and none of it is visible under a lid, so the
ground and every ground PATCH painted on it are now laid in two pieces around
the river's band. The band edge is a number **shared** between the two files
rather than matched: an approximation shows as a strip of void down the whole
run. Pinned by a test, because nothing at run time compares them.

*The height field writes the channel flat and BEFORE the road.* Every other
stamp in `buildHeightField` is "highest wins", which is right for a slab laid on
a floor and exactly wrong for a hole cut through one — a bed at −34 loses that
contest to bare floor at 0 and the water never appears under anything standing
near it. Writing it first leaves the road's own stamp to win across the
crossing. Measured on the live board: 41 of 41 samples of an enemy on the
crossing report ground height 7, which is `ROAD_LIFT` and identical to the road
either side.

*"You cannot build in the river" had to be its own rule.* The rest of
`levelUnder` refuses a footprint that STRADDLES two levels, and a channel wide
enough to swallow a whole footprint passes that perfectly — the bed is as flat
as any deck. It is still a tower standing in running water twenty-five units
under the board. Verified live: open floor either side buildable, both banks and
the water and the bridge refused.

**Three numbers were wrong on the first pass and all three were settled by
reading the framebuffer, not by looking.**

*The waterfall came out brown.* Authored a cold grey-green and measured
(124,86,70) — a warm brown that read as a timber ramp. Emission in this shader
is `uGlowTint * vEmi`, ONE tint for the whole board pass, and on this board that
tint is the camp's ember: every emissive vertex in the channel, whatever colour
it was painted, was adding orange light. Water does not glow anyway. Nothing in
the channel emits now and all of its contrast is diffuse.

*The channel read as a stripe painted on the floor.* The banks were the floor's
own `terrainEdge` and measured (33,33,28) against a (34,34,29) floor — one value
apart. And a bench at 0.42 of the depth under a 34-wide bank is an eighteen-
degree slope, which from the game's own camera is flat. It now has a real value
ladder and a waterline BELOW the bench, so there is always a strip of dry wall
between the dirt and the water — that strip is the only thing in the picture
that says the water is down in something. Measured across the finished channel:
floor 31 → bank 21 → wall 16 → water (30,39,47) → wall 18 → bank 23 → floor 31.

*Most of the fall was under the build bar.* It dropped `depth * 5.5 + 90` — 277
units — and a probe down the sheet found everything past about a third of the
way projecting to screen y > 720. A fall the player can watch END reads as water
going into nothing; a fall that leaves the bottom of the screen reads as one
that was cut off. It is `depth * 1.8 + 55` now and finishes in frame.

**THE SPAWN IS A GRAVE.** The route's first point is off the west edge and
bodies simply existed there and walked in out of nothing. There is now a stone
casket sunk in the dirt just west of it, lid dragged half off, four leaning
markers and a violet light coming out of the gap.

*A prop that owns its own LIGHT needs its own draw call.* `accent: "r,g,b"` on a
model was the obvious first move and it is only half the answer: it changes the
prop's vertex colour, and emission is one tint per draw, so the casket's diffuse
went violet while every lit surface on it kept adding ember. Props that declare
`accent` are now split out of the board mesh into `accentMeshes`, grouped by
colour, and drawn straight after it under their own tint. The casket is the only
user in the game, and the violet is the point precisely because it is not the
camp's ember.

*And light on the ground is painted in the GROUND's colour.* The stain discs
were painted `accent` and driven at emission 0.045, and the outer edge still
measured (206,117,245): a violet surface lit normally IS bright violet, and what
was on the dirt was a hard-edged magenta ellipse the size of the spawn. They
take the floor's colour now and the violet arrives entirely through the emissive
channel, over six steps instead of three — which is also the only version that
dims correctly when the board's fog thickens over it. Measured on the finished
spawn: 10 950 violet pixels, 9 032 of them between brightness 40 and 80 (the
wash on black dirt) and 693 above 140 (the mouth, the marker tips, the wisps).

**THE WATCHTOWER'S LAMP WAS A STOOL.** It was a squat lit cone dead centre on
the platform — on a tower whose entire job is to have somebody standing on it.
It hangs on a corner post now, where it lights the approach instead of the shins
of whoever is up there, and the tower gained a ladder. Same light, same
only-lit-thing-in-the-forest; it is just not in the way.

Nine props moved off the water. Scenery is never validated against terrain, so a
tenth added later would be a dead stem growing out of a river bed with every
suite green — hence the clearance test.

**One thing this does NOT do:** the casket is invisible on the map card and in
the 2D fallback, because it stands at x −82 and the 2D board only covers
0..1280. That is not a regression — the route's own first point is at −60 and
has always been off-canvas — but it does mean the grave reads in the 3D board
only. The river and the bridge are on the card.

`tests/content.test.js` 219 → 222. All three are self-tested, and the third one
FAILED its self-test first: the deck check originally looked only at the height
band the OLD lamp occupied, so putting the current lamp back on the axis left it
above the window and the test stayed green through exactly the regression it
exists to catch. Widened to the whole standing volume, it now measures 0.000.

**2026-08-26 — A seventh map, `test`: a dead forest on black dirt, with fog,
and a human camp dug in at the end of the road.**

At the owner's instruction: *"add a map. this map will be called test for now.
it is an eerie apocalyptic forest with black dirt and tree stems, add some fog
aswell ... the end goal is the start to a human camp, meaning add some barriers
to make it look as if the humans were defending. think along the lines of the
walking dead."*

The route is authored, six right-angle turns, 2 154 u.l., and measures out at
0.79 — normal, which nobody typed: it is what `Maps.analyse` says about the
geometry. Nothing about the forest is read by the measurement. The camp is a
picture, and the same route drawn across bare floor would score the same.

**THE THREE THINGS THIS BOARD NEEDED THAT THE ENGINE DID NOT HAVE.**

*Fog.* There was no fog anywhere in the renderer. It is now two uniforms in the
one shader, mixed **in linear light before the sRGB conversion** — mist is light
scattered on the way to the eye, not paint on the surface, and mixing it after
the curve washes the dark end out exactly the way multiplying an sRGB colour by
a light term did (the same mistake this project already made once, and the
reason the shader converts where it does). Depth comes from `gl_Position.w`,
which a perspective projection has already computed, so it costs a varying and
no matrix. A second term thins the fog with height over an e-fold, so the bank
buries a barricade and the tops of the stems stand out of it — which is what
makes it read as weather rather than as a dimmer.

Density 0 is clear air, it is what `GLRenderer.begin` restores every frame, and
it is what every other board runs at. Rune Circuit was re-rendered after the
change and is unchanged.

**The density is MEASURED, and the first number was wrong by a factor of two
and a half.** 0.00048 looked plausible and produced a board reading (41,43,37)
against a (43,46,39) mist — eighty-eight per cent fogged, which is not weather,
it is a white sheet with a road printed on it. The view depth across this board
is about 3 000 units; 0.00019 puts the near edge near a fifth fogged and the far
edge near a third. Read off the framebuffer with `readPixels`, not judged from a
screenshot — per the rule at the top of AGENTS.md.

The same measurement killed the first version of the clear colour. It cleared to
the FOG's colour, on the theory that the far edge fades to fog and the void
should meet it. It does not: at a playable density the far edge only travels a
third of the way to the mist, so clearing to the mist put a band of BRIGHT sky
around a dark board. The theme's own `background` is the answer, and was all
along.

*A shape.* `frustum` stands upright and `boxAt` only turns about z, so between
them there was no way to draw a leaning trunk, a branch reaching up and out, a
stake driven in at an angle or a brace holding a wall off the ground. `segment`
is a square prism between two points in space. Wound outward — checked, and it
was inside out on the first pass; `tools/check-winding.js` now audits it in
three orientations, because it picks its reference vector from the direction it
is given and the near-vertical case takes the other branch. A winding correct
only for leaning trunks would have left every fence post in the camp hollow.

*Ground that is not a platform.* The board wants bare earth scraped through the
litter, and every zone kind was a raised slab. That is not a cosmetic
difference: `World3D.levelUnder` refuses a tower that straddles a slab edge, so
a patch of mud built as a slab would quietly have become a no-build ring in the
middle of open ground. `dirt` has height 0, which now means a PATCH — a colour
painted at the floor's own height, no rim, no height stamp, and no way to move a
build spot.

**WHAT IS ACTUALLY ON THE BOARD.** Twelve new prop kinds beside the ten machine
kinds: `tree`, `snag`, `stump`, `log`, `brush`, and the camp's `barricade`,
`spikes`, `sandbags`, `watchtower`, `wreck`, `barrel`, `fence`. The wild kinds
skip the milled footing every machine stands on, because a dead tree does not
stand on a plinth. Each stem leans, and the lean grows with the square of the
height so the base still meets the dirt square; the limbs reach up as well as
out, because a branch drawn flat reads as a plank nailed to the trunk. The
variation is hashed from the prop's own position, so the same tree is the same
tree on every machine and every restart — the mesh is built once per map, and a
prop that moved between builds would be a prop that moved when the player
restarted.

**Half the treeline stands OUTSIDE the play area.** The board is built 120 units
proud of the 1280x720 view on every side, so there is real ground out there — and
a prop out there can never hide a tower, an enemy or a build spot, because none
of those can be there. It is the one place a forest can be dense. Inside the
route's pockets everything is knee-high, for the opposite reason.

The only lit things on the board are the fire in the two barrels and the lamp on
the watchtower, and that is the whole reason the theme's accent is an ember
rather than a ley line. The barrel flame is driven at half the board's emission:
at full it clips through orange to a white-yellow cone and the drum under it
disappears, which is a flare, not a fire in a barrel.

**THE CHOOSER HAD TO LEARN A FOURTH COLUMN, and this is the part that was a real
bug rather than new content.** Its grid took the column count and the card size
as constants and simply stacked more rows. At six routes that was two rows; at
SEVEN it is three, which ends 902 px down a 720 px canvas — the bottom row
entirely off screen and unclickable. `mapGrid` now derives the layout: up to six
routes it returns three columns at the full authored 372x240, byte for byte what
it did before, and past six it opens a fourth column and fits the card to the
viewport, taking the height from the width at 16:9 (the render's shape is not
negotiable, so the card is the thing that gives). Rows are centred on the cards
they actually hold, so the short last row sits under the middle.

The narrower card exposed a second fault underneath: the stat rows fitted the
LABEL first and gave the value what was left, so "2153.8 u.l." clipped to
"215...". A truncated label is still legible from its column; a truncated number
is not a number. The value now reserves its width first.

Two tests added. One pins the board's own contract — that it declares weather
and wildness, that every camp prop it names is a kind the geometry can actually
build (a rename in the scenery switch would otherwise turn every barricade into
the default block, silently), and that its ground patches are the flat kind. The
other pins that the chooser's rows never overlap and that the grid leaves room
for the line under it. `tools/ci-check.js` baseline tightened 217 -> 219 in this
same change, as that file asks.

**2026-08-26 — The Vanguard is imported, in two bodies and two gaits: it
dashes, then bounds, and its shield is thrown onto the road and pulled back
every seven seconds.**

At the owner's instruction: *"using the vanguard models, model the animate the
vanguard enemy ... in the shattered model, the fragments of shield you see must
be modeled as to be shooting outwards, and then drop to the floor from the
shields that are broken in the shielded model. they will stay there for 3
seconds, then in the last 4 seconds, they start flying back to the vanguard, as
if attracted to him magnetically and form the shield again, to complete the 7
second cooldown."* And for the movement: *"an explosive burst of speed, a dash,
with his arms swept back, body leaning forward, energy trails emphasizing the
acceleration ... then transition to a bouncing attack run at normal speed where
the Vanguard bounds forward in elastic hops, with aggressive arm swipes and claw
motions synchronized to each bounce. The body should coil and twist with
predatory intent."*

`glb/vanguard.glb` and `glb/vanguard-shattered.glb` become `enemy-boss_fast`
and `enemy-boss_fast-shattered`, both through the new `--rig vanguard` in
`tools/glb_to_model.py`. 5 035 and 5 218 triangles, next to the Tyrant's 4 568.
The chassis-built Vanguard is retired — see the TARGETS note below.

**THE TWO STATES ARE TWO BANDS, NOT TWO FILES, AND THAT IS THE OPPOSITE OF THE
BULWARK.** The Bulwark's pair of GLBs are two gaits because its shield break is
permanent: the body before it and the body after it never move the same way
again. The Vanguard's two states are not before-and-after anything — it dashes
the opening 400 u.l. (`Enemy.TYPES.boss_fast.sprint`) and bounds the rest of the
road, and it does both whether or not its shield is up. So one rig, two cycles,
concatenated into one frame list with a declared `bands` pair, and BOTH files
carry both. `enemyModel` picks the file off the shield; `gaitBand` picks the
band off the sprint; neither has to know about the other.

`glb_to_model.py` grew `bands` for this, and it is the same contract
`export_mesh.py` already emits: absent means "this rig declared no layout", and
every single-cycle import reproduces byte-identical across the change (checked
on `enemy-shielded`, `enemy-shielded-broken` and `enemy-flying`).

**BAND 0 IS THE SKATE AND BAND 1 IS THE DASH, in that order on purpose.** Band 0
is what every reader that does not know about bands falls back to, and the
skate is the gait this body spends all but the first 400 u.l. of its life in. A
fallback should be the common case.

**BAND 0 WAS A BOUNDING ATTACK RUN FOR THE FIRST HALF OF THE DAY.** The owner
replaced it the same day: *"make the vanguard slide as if he has roller skates
after his initial dash."* The bound is DELETED -- phase table, duty, rise,
crouch, pitch and all -- rather than left unreachable, because a zeroed gait
draws a flawless-looking body standing still and reports nothing. No
`VANGUARD_BOUND_` constant survives.

**THE SKATE IS THE FIRST GAIT IN THE FILE THAT IS NOT A SOLVE, AND THAT IS THE
POINT OF IT.** Every walker in `glb_to_model.py` exists to keep a planted sole
on ONE patch of road; a skate is the opposite claim, because the wheels roll and
the contact travels forward with the machine. So there is no plant window, no
swing lift and no `leg_series` in it -- the legs are authored, splayed out to
the side and driven by one `stroke` term that also drives the sway, the roll,
the dip, the coil and the arm rake, so none of them can come apart from the
others. The one thing it borrows from the walkers is `set_down`, extracted from
`plant_leg` (which is now written in terms of it, byte-identically), and that
keeps the wheels ON the road while they slide along it.

**SO IT SCORES THE WORST GAIT ERROR IN THE LIBRARY AND MUST.** A = 53.7 px on
band 0. `check-gait-slip.js` grows a `GLIDES` table for it, keyed **per band**
(`enemy-boss_fast#0`, `enemy-boss_fast-shattered#0`) and not per model --
exempting the mesh would have stopped grading the dash, which still plants and
still reads 0.000. The band is still walked, still measured and still printed,
with a note saying why the number is the animation.

**AND THE HEALTH-BAR MARGIN CAME BACK.** The bound's 0.135 of rise had left
1.3 px of clearance against the 10 px pad, the thinnest in the library after the
Tyrant; the skate's only vertical is a 0.022 dip, and the margins are 6.3 and
5.8 px.

**IT SPAWNS WITH ITS SHIELD UP** (*"he should also spawn in with his shield"*).
`supportTimer` starts at a full interval, so a self-shielding type used to walk
on bare and stand there for seven seconds -- and on this body that is worse than
untidy: the opening sprint is 400 u.l. at 175 u.l./s, so the one stretch of road
where the shield matters most was the stretch it did not have one. Granted
through `grantShield` rather than by assignment, so the non-stacking rule has
one implementation, with `shieldFlash` put straight back to zero: a body that
ARRIVED with a shield did not gain one in front of the player. Only for
`pick: "self"` -- a Shieldbearer's plate exists to be given away, and reading
`support.shield` alone would have armoured every supporter with it.

**FOUR CHANNELS WERE ADDED TO `biped_cycle` AND THREE OF THEM ARE THE BRIEF'S
OWN WORDS.** `arm_set` is a posture where `arm` was only ever a motion — the
dash holds the arms 0.95 rad back and pumps them 0.20, and scaling a swing can
only ever pump less about the same hanging rest pose. `swipe` is the claw raking
across the chest; `twist` is the coil through the waist; `arm_flare` holds the
arms clear of the ribs. **All three moving ones are driven off the SOLVED LEG
ANGLE, normalised to -1..+1, and never off a sine of their own** — the file
already carries that argument for the arm swing, and a fourth channel should not
have had to re-derive it: a phase-authored gesture keeps its timing when a duty
is retuned and silently stops landing on the footfalls.

**BOTH GAITS SOLVE CLEAN, AND `check-gait-slip.js` HAD TO BE TAUGHT TO LOOK.**
It read band 0 and only band 0 — which on a library where every banded body had
one gait was a full sweep, and on this one would have been grading the bound
twice and calling it a check on both. It now walks every declared band and
prints one row per band (`--band N` grades one); band 0's row is bit-identical
to what it printed before. All four Vanguard rows read A = 0.000 px.

**THE SHIELD FRAGMENTS ARE DRIVEN AT DRAW TIME, NOT BAKED, and the reason is
that this boss does not stop.** A baked frame is a pose in the MODEL's space, so
a fragment baked onto the floor travels down the road with the body — and at
175 u.l./s the three seconds the brief asks them to lie still is 525 u.l. of
road. `Enemy.prototype.breakShield` records the position and heading it broke
on; `shardPose` in gl-world.js converts that fixed world point back into the
body's current model space every frame and composes a matrix per shard, over the
top of the baked gait (the mechanism the Hedger's strike already uses). Nothing
is integrated and nothing accumulates.

**THE THREE PHASES ARE SHARES OF THE GAP, NOT SECONDS.**
`Enemy.prototype.shieldReformProgress` is 0 on the frame the shield went and 1
on the frame it comes back, so the reassembly lands exactly on the pulse that
refills the pool. At the full seven-second cadence the shares ARE the brief's
0.9 / 3 / 4. A shield broken two seconds before its own pulse gets the same
picture in two seconds rather than one that finishes after the shield is already
back.

**`shieldOut` IS A THIRD FLAG AND IT IS NEITHER OF THE OTHER TWO.** This is the
third time the distinction has had to be drawn on `ENEMY_VARIANT` and the second
time it has gone the other way:

- `shieldBroken` is one-way and permanent — the Bulwark's, because what a
  Bulwark loses is not coming back. Used here it would leave the fast boss in
  its wreckage for the rest of the run.
- `shield <= 0` is true of a body that has never been shielded AT ALL, and the
  Vanguard spawns exactly that way and waits out its first seven seconds. Used
  here it would walk the boss onto the board already in pieces.
- `shieldOut` is "the pool has emptied and nothing has refilled it yet". Set in
  `breakShield`, cleared in `grantShield` — by ANY grant, so a Shieldbearer's
  plate ends a Vanguard's reform exactly as its own pulse does.

**A LATENT BUG WAS FOUND BY THE ONLY CALLER WITH NO FALLBACK.** `GLModels.get()`
never exposed `positions`: `expand` built the array, filed it under `expanded`
and nulled `raw`, so `m.positions` was `undefined` on every model in the
library. `bodyExtentRadii` guards on it and returns null, so **every shield
bubble in the game has been drawn at the stand-in size meant for bodies with no
mesh at all** — 1.0 plan radii and 2.2 top — while thirty lines of comment
beside it explain how the measurement is cached per model. Nothing threw and
nothing was reported. `shardsOf` has no fallback, threw on the first frame, and
is the only reason this surfaced. One line in `gl-models.js` fixes it. **This
changes how every shielded body's bubble is sized** — the Bulwark's now hugs
its own hull instead of floating around it — and that is the behaviour the code
already claimed.

**THE SPRINT WAKE IS ON THE 3D BOARD NOW.** The 2D board has drawn one behind a
body with a `sprint` block since the type existed, for a reason that is teaching
rather than decoration — the player has to be able to SEE where the burst ends,
or "it arrived early" is the only evidence they ever get. The 3D board drew
nothing, so the one state change the Vanguard announces about itself was
invisible on the board the game ships. Three lanes rather than the 2D board's
one flat stroke, and 78 u.l. rather than 26: a world-space length is
foreshortened to roughly half of itself under an elevated camera, and the near
half of it is behind a machine 78 board px tall. Keyed on `isSprinting()` and
naming no type, so a second sprinting body gets it with no edit.

**FOUR PANES AND SIXTEEN NODES ARE DROPPED ON THE COMMAND LINE, and that is the
Bulwark's `--exclude Integrated_Kinetic_Field` rule holding rather than
bending.** This format has no translucency: a palette row is `[r, g, b,
emission]` and there is no fourth channel for an alpha. The intact file's eight
`bulwark_pane_*` are the shield's energy fill at alpha 0.16 and would ship as
eight opaque navy slabs walling the machine in from every angle; the shattered
file's `field_remnant` is a 1 560-triangle dome at alpha 0.05. Both go, and
gl-world's own translucent shell — which the fix above finally sizes correctly —
draws the field the artist authored in the renderer that can actually blend it.
The opaque frame-and-node octagon stays, and it is what reads as the barrier.

**`enemy-boss_fast` LEAVES `export_mesh.py::TARGETS`, THE SIXTH TIME THIS TRAP
HAS BEEN DISARMED** — the Skimmer, the Tender, the Tun, the Tyrant, the Courier
and now the Vanguard. A `.glb` import and a Blender target must never name the
same output; whichever runs last wins, in silence. `enemy_vanguard.py` is KEPT
for a reason unrelated to the row: it was the first body whose swing angle was
SOLVED rather than authored, and `check_group_gait.py`'s notes are written
against exactly that. **And the prefix hazard is back in the other direction** —
`enemy-boss_fast` is now a prefix of `enemy-boss_fast-shattered`. Neither has a
TARGETS row, and the importer takes an exact `--name` with no prefix matching at
all, so it is a note rather than a defect.

**MEASURED, NOT ASSERTED.** `check-model-top`: 1.298 and 1.302 rest, 1.441 and
1.442 posed, both `ok` — but at 1.3 and 1.5 px of margin against the 10 px pad,
which is the thinnest in the library after the Tyrant's 7.3. That is the
bound's 0.135 rise being spent, and it is the number to move first if the health
bar ever needs room. `check-gait-slip`: A = 0.000 px on both legs of both bands
of both bodies. `ci-check`: 112/217/72/45/53 and the manifest clean.


**2026-08-26 — Three rulings reversed: the Healer flies, the Shieldbearer stops
shielding itself, and a shield now absorbs the WHOLE blow. Every other menu is
the Ash Waste.**

Four owner instructions in one message, and three of them overturn a rule this
document argues for at length elsewhere. Each is recorded as a REVERSAL rather
than as a tweak, because the old argument is still on disk and a reader who
finds it should know it was decided against rather than forgotten.

**THE HEALER IS `isFlying` NOW** (*"make the healer a flying unit"*). Its row
carried a `hover` block and an explicit paragraph on why it was NOT flying:
hover is only a picture, every ground tower could still shoot a Healer, and
killing it first was the whole lesson of wave 32. That is reversed.
`Targeting.sees` and `RangeFilter` both fail closed on `isFlying`, so the Healer
is answerable only by a tower with air reach -- the Arcane Sniper, which has it
at base, and the Warbringer once its beam path buys it. **A board with no air
reach can no longer answer wave 32 at all**, which is the Aether Wisp's lesson
applied to a body that heals.

The `hover` block is DELETED, not left beside the flag. Every reader takes the
flying branch first -- `visualBodyLift`, and `bodyLift` / `clockRate` in
gl-world.js -- so it would have been a declaration nothing reads sitting next to
a comment explaining why the thing it declares is deliberately not the other
thing. Height comes from `Enemy.FLIGHT_LIFT_RADII` (20 px of clearance becomes
55) and the drift rate from the flier's `HOVER_HZ`. `check-gait-slip.js` needed
no edit: `enemy-healer` is on its `HOVERS` table already, and that table is
about "this body's frames are clock-driven", which is as true of a flier as of a
hoverer.

**A SUPPORTER NO LONGER PICKS ITSELF** (*"the shieldbearer should not shield
himself"*). It used to, and on the Shieldbearer it did so RELIABLY rather than
occasionally: `pick: "strongest"` sorts on life still standing, the beacon has
60 HP against a normal's 4, and its own stacking plate made it the strongest
body on the board by a wider margin after every pulse. One of its ten plates
went on itself every ten seconds, compounding, so the type that exists to make
everything else expensive was quietly the hardest thing to remove. Its tenth
pick now reaches one body further down the board.

**ONE LINE, IN `supportCandidates`, WHICH IS THE WHOLE OF WHAT THE INSTRUCTION
CAN MEAN.** `pick: "self"` never comes through that function -- `supportAllies`
short-circuits to `[this]` -- so the Vanguard, whose entire mechanic is
shielding itself, is untouched. A supporter aimed at others never lands on
itself; one aimed at itself still does.

**A SHIELD ABSORBS THE WHOLE BLOW** (*"if a enemy has 100 HP and 10 shield and
gets hit for 200 damage, the shield breaks because it is inferior to 200 but
nothing happens to the health"*). Damage used to SPILL from an emptied shield
into health, and the argument for that is still true and is now the point:
stopping the spill wastes the overflow of every heavy weapon, which is the same
"bullets landing on corpses" waste target claiming exists to prevent. A shield
is therefore worth a whole SHOT rather than its own thickness, and the answer to
a shielded wave becomes many cheap hits instead of one expensive one -- the
heaviest single-target weapon on the board is now the worst tool for it.

Three things a reader will assume moved with it and which did not: **a shield
still pays nothing** (`soaked` is reported in `lastDamageTaken` and never in
`dealt`); **effective HP is unchanged** (`waveEffectiveHealth` counts a shield
as health that must be removed, and it still must -- what changed is how many
shots that takes); and **it is not a damage cap** -- only the hit that BREAKS
the shell is absorbed by it, and the next one lands in full. `breakShield` still
fires on the same frame, so the Bulwark still doubles its speed and the Vanguard
still throws its fragments onto the road.

**THIS IS A REAL DIFFICULTY CHANGE AND IT IS NOT MEASURED HERE.** Every shielded
body on the board -- the Bulwark, a Hive's brood, anything a Shieldbearer has
touched, the Vanguard on its seven-second cadence -- now costs at least one more
shot than it did, and the schedule's authored figures cannot see that because
they count points and not shots. The owner asked for the rule; the retune, if
one is wanted, is its own piece of work.

**FOUR FIXTURES TURNED RED AND ALL FOUR WERE DESCRIBING THE OLD RULES**, which
is the outcome to want: `the Shieldbearer stacks 20 of shield onto the ten
strongest` (asserted "itself first, being the toughest thing there"), `the
Healer hovers, and hovering is a height and not a targeting rule` (asserted "a
tower without air reach can shoot it"), `the support hook runs from the real
main loop` (asserted "and it shielded itself too"), and `a shield is sized off
the enemy's OWN health, and soaks before it` (asserted "a twenty spills through
and pays only the six"). Each now asserts the reversal, and the last one also
spells out the owner's own 100/10/200 example on a body carrying his figures.

**THE OTHER MENUS ARE THE ASH WASTE** (*"arrange the other Menu UI's to match
the main menu theme"*). The title screen became the Ash Waste on 2026-08-25 and
the chooser, index, armoury, pause menu and run-over overlays were explicitly
deferred; this is that pass. The game had been opening on a burnt sky and then
cutting to a blue sci-fi grid the moment anything was clicked.

**IT IS SMALL BECAUSE THE SCREENS ALREADY SHARED TWO FUNCTIONS.**
`drawSelectBackdrop` and `drawBackButton` are called by the chooser, by
js/codex.js and by js/store.js, so re-cutting those two re-cut all three, and
nothing in the index's or the armoury's own layout had to move for the theme to
reach it.

**AN INTERIOR KEEPS THE THEME'S SURFACE AND DROPS ITS SUBJECT.** The title
screen is a composition -- a fractured pylon, a downed relay, a rift, four
controls between them. These screens are dense: six route cards, an enemy list
with a live 3D viewer, a shop grid. A scene behind that is not atmosphere, it is
noise competing with the content for the same pixels. So `drawAshInterior` is
the burnt sky, the horizon heat, the ground, the ash, the vignette and the
corner frame, and no pylon, wreck, rift or skyline. It is baked through the same
`drawMenuLayer` machinery the title screen measured at 72 ms a frame and fixed;
only the falling ash reads the clock.

New shared pieces, in game.js so all three files can reach them: `ASH_EMBER` /
`ASH_LEY` / `ASH_BONE` / `ASH_DUST` / `ASH_IRON`, `drawAshInterior`,
`drawAshFrame`, `drawAshHeading`, `drawAshPlate` and `drawAshControl`. **The
plate is `menuPlatePath`'s, the title screen's own two sheared corners**, so the
interiors and the title screen are the same piece of hull rather than two
designs that resemble each other.

**THE HEADING'S SUB-LINE GOES ABOVE THE TITLE WHEN A SCREEN HAS TABS**, and that
is a collision rather than a taste: the index and the armoury put their tab row
at y = 78, and a centred sub-line landed on it. Two screens of four wanted it
above, so it is an argument in one function instead of two hand-placed y values
that would come apart the first time a tab row moves.

**THE REST WAS A COLOUR SWEEP, DELIBERATELY.** The index and the armoury carry
dozens of ink and panel-fill literals from the old screen. Re-cutting each panel
by hand would have been a week and a redesign; mapping the palette -- `#cfe3ff`
to bone, the `140,179,230` structural blue to ember, `#ffd76e` to ember, the
"good" green to ley-teal, and the cool-grey panel fills to ash-brown at the same
alphas -- moves every one of them and touches **no rectangle, font size or
layout number**. `TIER_COLOURS` is re-cut too, and the new set is also an ORDER
(ley-teal easy, bone normal, ember hard) where the old teal/yellow/pink was not.

**TWO COLOURS OUTSIDE ANY PALETTE SURVIVED UNTIL LAST**: the run-over overlay's
red loss and green win. Both are now in-theme -- a loss burns, a win holds the
ley -- and the endings stay as distinguishable as they were.


**2026-08-25 — The title screen is a post-apocalyptic fantasy-tech world now,
and it moves. Every control is a salvaged plate; the type is Impact and
monospace instead of system UI.**

At the owner's instruction: *"change the menu themes entirely. for the main
menu, add an animated background of a post apocalyptic fantasy tech world, and
remodel all the buttons to fit that theme, along with the button fonts."* Only
the main menu — the chooser, index, armoury and pause menu are untouched and
were explicitly deferred.

**WHAT WENT.** The 2026-08-18 command deck in full: `drawMenuHex`,
`drawMenuReactor`, `drawMenuComms`, the grid, the recessed bays, the signal
trunks, the cyan-and-gold rule, and the 700-weight `system-ui` every label on
the screen was set in. "Entirely" was the word used, so nothing was kept for
continuity's sake.

**WHAT REPLACED IT.** A burnt sky over a dead skyline; a colossal fractured
ley-pylon leaning in the left bay with its core still burning and glyph rings
turning around it; a sky-relay that came down in the right bay, its dish
thrown clear and its feed horn still sweeping; rock torn off the ground and
left hanging with shards in orbit; rifts in the upper air on two different
strike periods; ash falling, embers rising, dust rolling along the horizon,
fissures with ley-fire in them.

**THE SCREEN ANIMATES, AND THAT IS THE POINT OF THE CHANGE.** `draw()` has
always run every frame on the menu — the old screen spent that on one
breathing halo around PLAY and nothing else. There is no new loop, no state
kept between frames and no timer: every animated value is a function of
`performance.now()` and an index.

**NOTHING ANIMATED MOVES A HIT TARGET.** The four rectangle functions are
untouched and still the single source for both drawing and hit testing; not
one of them reads the clock. Motion only ever reaches a colour, an alpha, or a
decoration's own position.

**MEASURED, NOT EYEBALLED**, per the visual-testing rule in `AGENTS.md`. The
pane throttles `requestAnimationFrame` when it is not being captured, so
`__frames` came back 0 and the naive "sample, wait, sample again" probe proved
nothing — which is exactly the limit-condition-read-as-data trap that file
warns about, and it reported "no animation" on a screen that animates. The
real measurement drives `draw()` directly against a stubbed `performance.now`:
the pylon's core reads `[56,85,80]`, `[50,66,65]`, `[54,78,75]` at t = 0, 1.7
and 4.3 s, and **the hover states were diffed at ONE fixed time** so the
difference could not be the clock — PLAY's left edge goes `[24,18,20]` →
`[36,27,28]` and its bloom `[58,28,23]` → `[69,34,25]`. The palette rule is
readable off the same probe: the sky at (640,470) is `[232,211,189]` and the
ground `[31,22,20]`, both warm, while the pylon core at (196,372) is
`[47,64,62]` — green over red, because arcane energy is the only cool thing on
the screen.

**THE FONTS ARE `MENU_DISPLAY_FONT` AND `MENU_TECH_FONT`, AND THERE IS NO
WEBFONT.** The game runs from a double-clicked `file://` page, so a downloaded
face would need either a server — which this project does not have and does
not want — or a megabyte of base64 in `index.html`. Impact ships on both
macOS and Windows, is condensed, heavy and all-caps, and reads as stencilled
salvage rather than as system UI, which is the job `700 15px system-ui` was
failing at. Tracking is done by hand in `drawMenuText` rather than through
`ctx.letterSpacing`: that property is recent enough that a browser without it
would silently draw every line on the screen too tight, and a silent
wrong-looking fallback is worse than none.

**THE BUTTONS ARE PLATES, NOT PANELS.** `menuPlatePath` shears the top-left
and bottom-right corners — two cuts rather than four, because four corners
rounded off reads as a sci-fi pill and two reads as a piece of hull cut to
fit. The iron under all four is identical (mill lines, rust streaks, rivets,
hazard chevrons in the sheared corner); only the accent differs, so they read
as parts off one wreck rather than as four unrelated controls. Hover fills the
plate's foot with ley-light and runs a charge up its left flank; PLAY breathes
on its own. `drawMenuButton(r, label, key, rgb, primary)` keeps its signature,
because the title-screen test counts calls through it.

**TWO THINGS WERE DRAWN TWICE BEFORE THEY WERE RIGHT, and both were the same
mistake.** The floating islands were first a symmetrical wedge over a glowing
ellipse, and read unmistakably as a flying saucer; narrowing the ellipse to a
rune band at the rock's waist did not help, because it still projected in
front of and behind the silhouette. What fixed it was deleting the ring
outright and letting loose shards orbit instead — the same statement (this
rock is not obeying gravity) in a shape that cannot be mistaken for a hull.
The skyline had the matching problem: a row of intact rectangles is a city at
dusk, not a city that lost, so three of its four cases are now snapped,
collapsed or leaning and the whole building is the minority.

**IT SHIPPED AT 14 FPS FIRST, AND THE FIX IS THE MOST IMPORTANT LINE IN THIS
ENTRY.** Once the picture was right, the frame was timed properly — Canvas2D
queues its commands, so timing `draw()` on its own measures submission and not
rasterisation, and one `getImageData` after the loop is what forces the queue
to flush and makes the number honest. It came back at **72.73 ms a frame**
against a 2560×1440 backing store. Per-function timing put **51 ms of it in
two places**: `drawMenuSky` at 14.3 ms and `drawMenuAtmosphere` at 36.7 ms —
full-screen alpha gradient passes and 144 scanlines, none of which read the
clock. They were being re-rasterised sixty times a second for a picture that
never changed.

`drawMenuSkyBase` and `drawMenuVeil` are now baked once into offscreen
canvases at the backing store's own resolution and blitted: **1.8 ms a frame**,
sky 14.34 → 0.69, atmosphere 36.67 → 0.59. The cache is keyed on the backing
store's size, which is not a nicety — the canvas is still 300×150 for the
first frames after load, and without the key the whole screen would have been
blitted from a thumbnail. The sun lost its 0.7 Hz breath to this, deliberately:
it was the only thing keeping that layer out of the cache, and the scene has no
shortage of motion without it. **Anything time-dependent added to either baked
function from here will simply freeze** — that belongs in `drawMenuSkyBands`
or in `drawMenuAtmosphere`'s live tail.

**`menuLinear` and `menuRadial` fall back to a flat colour.** Not defensive
habit: the harness's canvas stub answers every unknown method with a function
returning `undefined`, so `createLinearGradient(...).addColorStop` throws
there. A flat colour in a suite that never looks at pixels costs nothing; a
crash costs the file. `menuNoise(i)` is a pure hash rather than a generator
for the same kind of reason — the scene carries hundreds of authored details
without storing one of them between frames, and looks identical on every boot.

All six suites re-run and unchanged: 108 / 217 / 72 / 45 / 53 pass, 0 fail,
plus the sandbox smoke test. (`AGENTS.md`'s "How to run and test" table still
prints the older 107 / 207 + 5 figures; that drift predates this change and is
not touched here.)
**2026-08-26 — Two clocks in the new scheduler were step-size dependent, and
its own suite could not see either.** Adversarial review of the timeline rewrite,
five readers each on one angle. Composition, wave identity and the diff came back
clean; the clocks did not.

**The ceiling closed one frame late on all 34 waves at the shipping step.**
`waveElapsed >= duration` carried no float tolerance while the emission beside it
carries `SPAWN_EPSILON`, and 1/60 does not sum exactly: 1920 of them reach
31.999999999999464, half a picosecond short of wave 1's 32, so the wave ran to
step 1921. The shortfall runs from 5.4e-13 on wave 1 to 5.8e-12 on wave 33's 125
seconds, growing with the ceiling because that is how many additions went into
it. The comment directly above the test promised this did not happen. Fixed by
carrying the same microsecond the emission carries.

**The overshoot of the crossing frame was discarded.** `endWave()` reset
`waveElapsed` and wrote the full delay onto the countdown, so the fraction of dt
already spent past the ceiling was charged twice — 0.217 s lost over thirteen
ceilings at 1/60 against 0.007 s at 1 ms, a campaign clock a fifth of a second
longer at one frame rate than another. It is now handed over, the same way the
transition already hands its own leftover to the wave it starts. A step longer
than the whole transition falls out of the same arithmetic instead of losing a
second.

**Auto-send's three seconds were 2.9.** `skipNextWave()` is called at the TOP of
`updateWaves()`, so the countdown it opened was decremented by the same frame's
`waveCountdown -= dt` — while the player's identical Send, arriving at the same
function from a click, got its full three. Gates 1 and 2 never had it: they are
evaluated below the countdown block.

**WHY THE SUITE MISSED ALL THREE.** "The same wave deploys identically at any
step size" moves the cursor by ASSIGNMENT and deploys each wave in isolation, so
no gate ever fires in it: it proves the emission independent of dt and says
nothing about the clocks either side. Two tests were added on the real
`update()`, and the first drafts of both were themselves useless — 1/60, 1/30,
0.005 and 0.001 all divide 32 exactly, so the overshoot was zero and the mutation
that drops the handover survived; and `Math.abs(gap - 3) <= step` called a stolen
frame a rounding difference at dt = 0.1, which is exactly the size of the theft.
The tests now use step sizes that divide none of the first five durations, and
assert the transition as a FLOOR rather than as a distance. All three mutations
go red.

**Nine factual errors in the new comments, corrected.** The repo's convention is
to cite the measured number, which makes a wrong one worse than none: wave 11's
body was called a "Champion" fourteen times across four files and no such enemy
exists (it is `midboss`, display name "Midboss"); wave 30 was credited with 168
bodies against its real 33, and no wave in the schedule has more than wave 12's
88; the tie-break's worked example named wave 4, whose three groups run 0-1.35,
3-4.35 and 6-7.35 and never collide at all, while the schedule has 42 real
collisions elsewhere; wave 35's "longest gap" is the 6.4 s before the T5, not the
3.1 s before the Tyrant, as the same comment block says correctly 25 lines later;
`AGENTS.md` gave 77 groups before the rewrite against a measured 82;
`allWavesDeployed` was documented as written by `spawnScheduledEnemy`, which no
longer touches it; that function's own header claimed the sandbox as a caller and
the sandbox has never called it; and `pinWaveBreak` said it was kept rather than
deleted from twenty call sites, of which there are six.

Suites: 135 / 217 / 72 / 45 / 53, 0 failing, `MANIFEST OK`. Composition
re-verified against a snapshot taken before the rewrite began: 35 waves, 830
bodies, 25 939 effective HP, $2 594 clear, $22 321 kill — identical.

**2026-08-26 — The documentation of the 2026-08-25 wave rewrite: every claim
that the timeline made false, rewritten rather than left standing.**

The scheduler, its tests and the wave HUD landed over the two previous days and
each entry fixed the rules it touched. This is the sweep that went looking for
the rest — the paragraphs that describe waves from somewhere else in the
document and were never edited, because nothing in a test suite fails when a
sentence goes stale. Grepped for `lead`, `WAVE_BREAK`, `90`, "break", "in
order", "deploy". **No executable code changed**: the only edits to `js/` are
comments, verified by stripping every `//` line from `js/game.js` before and
after and comparing — identical.

**What was actually false, and is now written the other way** (`AGENTS.md`
unless said otherwise):

- *"Each wave entry supplies `count`, `interval` … when a wave's last enemy
  spawns, the `WAVE_BREAK` countdown begins"* — the whole wave-entry model, in
  the section that defines it. Replaced with the timeline: `at` absolute from
  the wave's own start, body N at `at + N × interval`, `duration` a ceiling on
  the WAVE and not a gap after it, a missing field left missing.
- *"The groups deploy in order, so a wave reads top to bottom as the thing the
  player watches arrive"* — deleted. Measured on the shipping schedule: **134
  groups over 35 waves, 18 of the 35 with at least one pair of groups whose
  windows cross**, wave 22 running three at once and wave 30 opening two on the
  same frame.
- *"an optional `lead` — the pause before that group's first body"* — `lead` is
  not a field. Also removed from the authoring rule ("`interval` and `lead` do
  not pay for themselves", now `interval` and `at`) and from the Conventions
  table.
- *"The break is 90 seconds, and three things end it"*, its delay table and its
  two follow-up paragraphs — replaced by **A wave ends at a gate, and there are
  three**: eliminated (5 s), `duration` expired (5 s, survivors stay),
  Send/auto-send once fully deployed (3 s, survivors stay), all through
  `endWave()`. With the two things the old text could not say: survivors are
  never touched by a transition and cannot hold the next wave open, and wave 35
  has none of the three gates.
- *"the wave skip is gated on `betweenWaves()`, so outside a break its rectangle
  is ordinary map"* — it is `waveSendAvailable()`, and the two halves of the
  wave chrome disagree for the whole of wave 35.
- *"`waveElapsed` … starts at the wave's FIRST SPAWN"* (in `AGENTS.md` and in
  `js/game.js`, which is where it mattered) — it starts when the wave OPENS.
  Same origin as `at`, which is the point; for 34 of the 35 waves that is the
  same instant, and **wave 11 opens four seconds before its Midboss** (`at: 4`
  inside a 60 s window). The arbitration is recorded in both files and in the
  test that would fail if the other reading was meant.
- *"Its group carries a six second `lead`, the longest silence in the
  schedule"* — the wave-35 Tyrant is `at: 13`, against a wave whose last body is
  at 28 s, so it walks in at 46% of the deployment by choice rather than by
  accumulation.
- *"the next wave's first spawn — the 90 s ran out with stragglers still
  walking"* — the third of three bounty routes, in `AGENTS.md` and in the
  comment over `payWaveBounty()`. There are four call sites now and the
  ordinary one is `endWave()`; the other three are latched safety nets for a
  cursor moved without a gate.
- *"The flat form is not legacy, it is the single-group case"* and the
  measurement under it (*19 of 35 bare, 58 groups against the true 77*) — the
  flat form was deleted with the rewrite and `waveGroups` now throws a named
  error on a wave without `groups`. The warning it carried is kept in its new
  form: walking `wave.groups` by hand gives the AUTHORED order, which is no
  longer the order anything arrives in — `waveTimeline()` is.
- *"Each [spine wave] still OPENS a wave with its exact count, interval and
  type"* — it CONTAINS that type and that total count. Old 2 is still eight
  stock Normals; they arrive 4 + 4.
- The harness bullets: `pinWaveBreak(5)` is a named no-op, and **figures
  measured through those fixed windows before 2026-08-25 are not comparable
  with today's**; `boot(mapId)` no longer calls `spawnScheduledEnemy()`.
- The test-results block, which still read `107 / 207 with five content
  failures` from 2026-08-14. Measured today: **run 133, content 217,
  long-range-dps 72, beam 45, blub 53, sandbox smoke passed, MANIFEST OK, all
  zero failures**. The five named content failures under it all pass; the
  paragraph is kept and marked as history, because the lesson in it — diff the
  failure NAMES, never the totals — is what found the second bug in it.
- Assorted comments in `js/game.js` that quoted the 90: the `WAVE_CALL_DELAY`
  header (the owner's "timer of 90 sec" is quoted as history now), the
  auto-send block (it sends the frame a wave is fully deployed, which on a long
  tail is most of a minute earlier than the old "the frame the break opens"),
  the toggle's placement argument, the countdown's whole-seconds argument, and
  the Send button's header.

**Numbers cited in the rewritten sections, all measured against the shipping
schedule rather than carried over:** 35 waves, 830 bodies, 134 groups, 25 939
effective HP, $2 594 in clear bounties, $22 987 in scheduled kill bounties
through `Enemy.bountyOf` (**$22 321** pricing every body off its type row, the
$666 between them being the six fractal roots and nothing else); `duration`
from 30 s to 125 s and never closer than 26.02 s to its own last arrival (wave
7, the tightest); wave 35 with no `duration`, its Tyrant at 13 s and its T5
slime at 28 s; transitions of 5 s, 3 s and the 10 s opening pause.

**Known incomplete, and deliberately not fixed here.** Nobody has re-measured
the campaign against a real tower board since the floor under a losing board
disappeared — a wave that is not being killed now ends on its own ceiling and
the next is announced over the survivors. Retuning by simulation is out of
bounds in this repo, so the change is documented as the difficulty change it is
rather than balanced away. There has also been no visual pass on `file://` for
any of the six steps: the Send button is now visible over the map during a
deployed wave, at (22, 100), and no one has looked at it.

**2026-08-26 — The wave scheduler's tests: six new names, a composition gate,
and a run of the whole campaign with nobody touching it.**

The timeline scheduler landed on 2026-08-25 and its tests landed with it: the
old sequential ones were replaced, not weakened, and the suite was already
green. This entry is the pass that went looking for what those tests still
could not see. **No production code changed.** `js/game.js` is byte-identical
to what it was before this pass — it was mutated seven times to prove the new
assertions have teeth and restored each time, verified with `diff -q`. The only
files touched are `tests/run.js`, `tools/ci-check.js`, `AGENTS.md` and this one.

**Six tests added** (`tests/run.js`, baseline 127 → 133, tightened in
`tools/ci-check.js` in the same change, with the reason, as that file requires):

- **`the timeline rewrite moved when bodies arrive and changed nothing else`.**
  The rewrite edited roughly a hundred and thirty group literals, so "the
  content is unchanged" is not a claim a diff can carry and was not a claim any
  test made. This one holds the pre-rewrite snapshot of all 35 waves — bodies,
  effective HP, clear bounty, kill bounty, and the AUTHORED SIGNATURE of every
  group with the absence of `health`/`tier` distinguished from any value — plus
  the roster rules the schedule is built around and a check that every ceiling
  strictly outlasts its own last arrival, read off the event list rather than
  off the group arithmetic the shipping validator uses. Self-tested by writing
  `Enemy.TYPES.normal.health` onto wave 1's group: that changes no aggregate
  anywhere in the game, and it is red here.
- **`wave 22 runs three groups at once, and wave 30 opens two on the same
  frame`.** Wave 12 next door is the two-group interleave; this is the
  three-group one, plus the pair of groups sharing an `at` — a sentence the old
  one-cursor-plus-`lead` model could not say at all. Eighteen of the thirty-five
  waves overlap at least one pair of groups, so it is the ordinary case.
- **`wave 35's Tyrant walks in at thirteen seconds and its T5 slime at
  twenty-eight`.** Both are authored numbers now; before `at` existed the boss
  arrived whenever the four groups in front of it had finished emitting, which
  nobody could read off the file and which moved with every earlier retune.
- **`a wave's clock starts when the wave opens, never when it finishes
  arriving`.** Wave 1's ceiling fires at 32.0 s, not at the 35.2 s the old
  anchor would have given. It also RECORDS THE ARBITRATION: `at` and `duration`
  share one origin, so wave 11 — the only wave whose first group is not at
  `at: 0` — spends four of its sixty seconds on empty road. See `AGENTS.md`.
- **`the whole campaign runs itself dry, with every authored arrival emitted
  once`.** Thirty-five waves with no Send, no auto-send and no click, every wave
  closing on elimination or on its own ceiling, with `emitWaveEvent` wrapped to
  record each arrival by (wave, group, body). 830 arrivals, none twice, none
  missing, per wave as well as in total, and the cash delta exactly the 35 clear
  rewards. Every other count in the suite reads `WAVES` rather than the run, so
  a dropped or doubled arrival is invisible to all of them. Self-tested both
  ways: red on skipping one arrival per wave, red on emitting one twice.
- **`a second road mirrors the whole timeline, and is still one wave and one
  reward`.** `content.test.js` owned the first beat of Twin Confluence; this
  owns a whole wave — all 88 bodies of wave 12 down each road, in the same
  order, off ONE cursor — and the reward, which a per-route payout would double.

**One test renamed, assertions untouched:** `the skip button only exists during
a break` → `the skip button does not exist while a wave is still arriving`. The
old name became false on 2026-08-25 — there is no break, and the button is live
for the tail of every deployed wave — while what the test measures never moved.
A green test carrying a false claim is worse than a red one. Its stale comment
(`drawn from the same betweenWaves() test that gates the click`) now names
`waveSendAvailable()`, and one assertion was ADDED, not relaxed.

**Nothing was weakened, removed or relaxed.** No existing assertion was edited.
The 830 / 25 939 / $2594 totals, the twenty-wave spine, the camo and air rules
and the tier ladder all still hold, and `scratchpad` equivalence gate still
reports `DIFF EMPTY`.

**Known incomplete.** `AGENTS.md` gained a section on what guards the schedule,
but its older wave paragraphs are still written for the pre-timeline model
(`lead`, "the groups deploy in order", the flat form, `WAVE_BREAK` and the 90 s
break, "Send only exists during a pause") and so are the suite totals in "How to
run and test", which still read 107/207. That is the documentation pass's work,
not this one's. There has also still been no visual pass in a browser.

**2026-08-26 — The wave HUD, audited: the states nothing swept, and the
banner nothing added up.**

The readout and the Send button were rewritten with the timeline scheduler the
day before and were already right. This entry is the audit that says so, plus
the three holes it found in what PROVED it. No production behaviour changed:
the only non-test files touched are a stale comment in the sandbox and this
document's rules in `AGENTS.md`.

**What was checked and needed nothing.** `waveStatusText()`'s four states; the
3 s / 5 s / 10 s transition line reading `waveCountdown` rather than a per-gate
constant; `FINAL WAVE` in the slot where a timer would be, with
`waveTimeRemaining()` answering `null` and not 0; `waveSummary()` keyed on
`(type, health, tier)` and not on the display name. Every enemy creation and
click path was re-walked: `onClick` is the only one that places a tower —
`onMouseDown` claims the middle button, `onMouseUp` and `onRightClick` place
nothing — so `waveSendAvailable()` really is the whole of the button's claim on
a click. All 35 banners were printed and read: no wave lists one display name
twice today.

**Hole 1 — the final wave was never swept.** The invisible-but-live trap was
swept in two states, mid-wave and past the end of the schedule. Both have BOTH
halves of the wave chrome off. The state that was missing is the one where they
disagree: wave 35 on the road, `waveControlsShown()` true (the AUTO toggle is
still drawn) and the Send button down. It is the state a run spends its last
minutes in, on a board the player is still building on. Now swept — all 344
points, through the game's own `overInterfaceChrome()` — and then built on for
real through the click handler, at the far end of the rectangle so the tower
already standing in the middle of it from the earlier case cannot mask a
refusal.

**Hole 2 — `waveSendReady()`'s last-wave guard was not falsifiable.** Deleting
`if (waveIndex === WAVES.length - 1) return false;` left the whole suite green:
`emitDueSpawns()` retires the cursor on the last body of the last wave, so a
running game can never hold "wave 35, fully deployed, index not yet past the
end", and every other assertion about the final wave was already false for a
different reason. The state is now held by hand and the refusal pinned. An
untested rule inside a predicate that the drawing, the click handler and the
build preview all read is a rule that gets simplified away.

**Hole 3 — no banner was checked against the wave it describes.** Two of the
thirty-five summaries are pinned as literal strings; the other thirty-three were
covered only by hand-built pairs. A summing bug is exactly the kind that hides
here — a dropped or double-counted salvo still prints a line that reads like a
wave. Every banner's printed counts are now summed and compared against
`waveCount()`, per wave rather than on the 830-body total. Checked with a
mutation: a filter that drops long-interval groups reports waves 26, 30 and 33
and nothing else in the suite notices.

**Also pinned: fully deployed is not over.** `5 / 5 deployed  ·  29 s left` is a
sentence the sequential scheduler could not produce, and the deployment count is
the only thing on screen that explains why a Send button appeared over the map
mid-wave. The readout test now walks wave 1 past its last body and reads it.

**`js/sandbox/sandbox.js`** — the comment claiming the corner "correctly says
every wave is deployed" described a string that no longer exists, and named a
banner "Wave 1 / 31" when the schedule is 35 long. Replaced with what is
actually true there: the sandbox switches spawning off with
`waveIndex = WAVES.length`, so its corner reads `Final wave · N still walking`
about bodies the roster put on the road by hand. Left that way deliberately — a
sandbox-only branch in the shipping readout would put a state on screen that no
run can reach.

**Known incomplete.** `AGENTS.md` still describes the 90 s break and the flat
wave form in the sections the earlier steps flagged (the *break is 90 seconds*
block, the *flat form is not legacy* paragraph, and the `Wave break` / `Wave
call triggers` rows in Conventions). Nothing in this entry made them worse; they
belong to the documentation pass. No visual check was run in a browser: the
whole HUD is canvas, and everything above was measured through the harness.

**Tests** — `tests/run.js`, no new test names. Assertions added to *while the
button is down its rectangle is bare map, and builds*, *the readout names the
wave, how much of it is out, and its time limit*, and *a wave summary sums
identical salvos and separates unlike ones*. Baseline unchanged at 127.

**2026-08-26 — Wave identity, audited: every creation site accounted for, and a
tripwire under the one that does not exist yet.**

No propagation was missing. The audit is the change: `waveId` is minted in
exactly one place and inherited in exactly three, all four were already correct,
and this entry writes down where they are and adds the two tests that were not
there.

**The complete list of places a body comes into being** — the point this task
usually fails is a site nobody looked at, so it is enumerated rather than
described:

| where | what makes the body | origin |
| --- | --- | --- |
| `js/game.js` `spawnEnemy()` | the scheduler, via `emitWaveEvent()` | **minted** — `waveIndex + 1`, the number the player is shown |
| `js/enemy.js` `spawnMinions()` | a Hive's brood | inherited, through the `born` overrides |
| `js/enemy.js` `splitOnDeath()` | a Fractal Slime's four children | inherited, five generations deep |
| `js/enemy.js` `summon()` | a phase's roar (the wave-35 boss) | inherited; queued through `pendingSpawns` and drained by `spawnMinions()`, so both reach the road by one door |
| `js/enemy.js` `tryRevive()` | a Revenant's second life | **no code** — it is the same object, so it keeps what it was born with |
| `js/codex.js` | a parked panel sprite | deliberately none: `waveId 0`, and stamping it would let the codex hold a wave open |
| `js/sandbox/sandbox.js` | the workbench spawner | deliberately none — it calls `spawnEnemy()` without the sixth argument |

**Two tests added** (`tests/run.js`, baseline 125 → 127):

* **"a wave stays open while a body it never scheduled is still walking."** The
  existing tests read `waveId` off a descendant; none of them made a descendant
  *carry* a wave. This one deploys wave 25 on the real clock, kills everything
  but its T3 Fractal Slime, then kills that — and from there nothing alive was
  ever emitted by the scheduler. The wave stays open for four generations and
  closes on the frame the last T0 goes, five seconds ahead of wave 26. A
  `splitOnDeath` that stamps its children correctly while the gate scans
  something else passes every other test in the section and fails this one.
* **"every place in js/ that builds an enemy from another one passes the origin
  on."** A source scan, because the expensive failure is a site nobody
  remembered: bodies born without the field wear `waveId 0`, hold nothing open,
  and close their parent's wave over their heads, and nothing on the road looks
  wrong. Every `new Enemy(` under `js/` must sit in a function that mentions
  `waveId`. The rule is coarse on purpose — `spawnMinions` passes an object
  built ten lines earlier and the other two pass literals, so a checker
  insisting on one shape would have been wrong the day the other was written.
  `js/codex.js` is the single exemption and the exemption is asserted to still
  have a call site behind it.

Self-tested: deleting `waveId: this.waveId` from `splitOnDeath` turns both new
names red plus the older cascade test; appending a `new Enemy(...)` with no
`waveId` to `js/systems/execute.js` turns the source scan red alone, which is
what proves the scan reaches past `js/enemy.js` into every subdirectory.

**Out of CI, twice over the whole campaign** (`update()` driven at 1/60 s with
steady damage, so Hives hatch, the boss reaches its phases and every fractal
splits): 1366 bodies with auto-send on, 2686 with it off. **Not one body reached
the road without an origin, and every origin was a real wave number** — 35
distinct, 1 through 35. With auto-send off, 31 of the 35 waves closed by
elimination with none of their own bodies alive; the other three closed on their
`duration` with survivors, which is what gate 2 is. Both runs ended in victory on
an empty road.

**One comment corrected**, `Enemy.prototype.tryRevive`. It said a rooted
Revenant cannot strand a run because "a break still ends on the 90 s ceiling
whether or not the board is clear" — a break that no longer exists, and the
wrong reason now. The right one: a rooted Revenant wears its wave's origin, so
that wave can never be closed by *elimination* again — but its `duration` and
Send both still close it. Only the last wave has neither, and no wave 35 group
and no phase of the roar calls a Revenant in, so the one gate that cannot be
forced is the one gate a Revenant can never reach. What a stranded body does
still hold is the **win**: victory asks for an empty road, and always has.

**2026-08-25 — The timeline scheduler: a wave is a set of independent groups on
one absolute clock, three gates close it, and `WAVE_BREAK` is gone.**

The data moved to the timeline form in the entry below this one; nothing read it.
`spawnScheduledEnemy()` still walked the groups back to back, returning "how long
until the next body", and `at` and `duration` were ignored. This is the code that
reads them.

**A wave is deployed by a MERGE, not by a walk.** `waveTimeline(wave)` expands
every group into the bodies it names, puts each at `at + N * interval`, and sorts
by **(time, groupIndex, bodyIndex)**. `updateWaves()` advances one clock and
drains everything due. That is the whole scheduler.

* **`N * interval`, never `interval` added N times.** Wave 12's Swarm group is
  forty bodies 0.2 s apart; an accumulating sum drifts by the dust of forty float
  additions and where the fortieth lands would depend on how it was reached.
* **The tie-break is a TOTAL order and ties are ordinary.** Fourteen of the
  thirty-five waves have at least one exact collision — wave 12 has four. With
  only `time` compared, those pairs would come out in whatever order the engine's
  sort produced and the schedule would play back differently on a different Node.
  It also makes the sort's own stability irrelevant, which matters because
  `Array.prototype.sort` is not required to be stable everywhere this file opens.
* **`type`/`health`/`tier` are copied, and `undefined` is copied as `undefined`.**
  Absent stays absent, for the reason the data entry gives.
* **`SPAWN_EPSILON = 1e-6`.** `waveElapsed` is a sum of one float addition per
  fixed step, so 3.2 s of stepping arrives as 3.1999999999999975 — and wave 1's
  fifth body is authored at exactly 3.2. Without the tolerance that body waits a
  whole extra frame, and *which* frame depends on how the time was chopped up,
  which is the one thing this scheduler exists to make impossible. A microsecond
  is eighteen thousand times smaller than a 60 fps frame and eleven orders of
  magnitude larger than the drift a 125 s wave accumulates.

**The event list is DERIVED and keyed on the index.** `waveTimeline` (the
variable) caches one wave's events and `activeWaveEvents()` rebuilds it the
moment `waveIndex` names a different wave. Keyed rather than cleared because this
game is driven from outside more than most — the sandbox assigns `waveIndex` by
hand, the suite parks the cursor mid-wave — and a cache only refreshed when the
scheduler said so would hand those callers another wave's events. `WAVES` stays
the only source of truth; nothing writes to the list.

**Three gates close a wave, and all three go through `endWave()`.** One exit, so
"the reward is paid exactly once" is a property of one function rather than of
three call sites agreeing:

| gate | condition | next wave |
|---|---|---|
| eliminated | every event emitted **and** nothing carrying this wave's number alive | 5 s |
| ceiling | `waveElapsed >= duration`, survivors keep walking | 5 s |
| Send / auto-send | every event emitted; the player says so | 3 s |

**A road that goes momentarily empty is NOT a beaten wave.** The elimination gate
asks the event cursor first. Wave 13 sends its twenty Angries as five salvos
4.5 s apart and a good board empties the road between every pair of them; under a
board-empty test that wave would have paid out and rolled on after four bodies.

**`WAVE_BREAK` (90 s) IS DELETED.** The ceiling moved onto the wave itself. What
is left between two waves is a *transition* — 5 s or 3 s — and it is never a wait
to be sat out. Everything the 90 was defended with still holds per wave: idle
seconds still earn nothing, so a long window can only be thinking room, never
farmed. What is deliberately gone is the FLOOR under a losing board: a wave that
is not being killed now ends on its own ceiling and the next one is announced on
top of the survivors. That is the change, not a side effect of it.

**Send is live once the wave has finished ARRIVING and never one instant before,
and it ENDS the wave rather than shortening a break.** Under the old scheduler
there was no break until the wave was over anyway, so the button could not do
anything a patient player would not have got. Now it closes a wave that could
have run another fifty seconds, with things still walking — a real decision.
`waveSendReady()` is the rule, `waveSendAvailable()` is the rule plus "is this
screen up"; the scheduler asks the first and the three UI readers ask the second.
A Send that worked mid-deployment would let a player delete the tail of a wave
they did not like the look of, which is editing the schedule, not skipping a
break. **No Send on wave 35** — there is nothing to send, and the button goes
away rather than going grey.

**Calling a wave in never pushes it away.** `callNextWave()` is still a ceiling
on the remaining countdown and never an assignment, so a Send with 1.5 s left
leaves 1.5 s. Auto-send's three still beats a cleared board's five for the same
reason.

**Auto-send cannot compress an interval or delete a spawn, by construction rather
than by care.** It routes through `skipNextWave()`, which is behind
`waveSendReady()` — so there is no moment during a wave's deployment when it can
do anything at all. Wave 1's five bodies still take 3.2 s with it on.

**A long frame loses nothing on either side of a transition.** When the countdown
expires mid-step the leftover is written onto the new wave's clock
(`waveElapsed = -waveCountdown`) instead of being discarded. At 3x a step is
50 ms; a transition expiring 40 ms into one would otherwise start every wave up
to a frame late, every wave, forever. `updateWaves(7)` from a 5 s transition puts
2 s on wave 2's clock and three bodies on the road, exactly as 420 small steps
would.

**Wave 35 has no gate.** No ceiling, no Send, no transition. Its cursor is retired
by `emitDueSpawns` the moment its last body is out — the only place
`allWavesDeployed` is ever set — and the run is won when the whole road, cascade
included, is empty. Its reward is paid by the elimination path, once.

**The opening 10 s pause is outside wave 1's clock.** Verified end to end: wave 1
closes at t=42 s of a real run, which is 10 + its own 32.

**New: `validateWaveTimelines(schedule)`, run at load and throwing.** Every
`duration` must be **strictly** greater than its wave's last spawn, and only the
last wave may have none. The mistake it catches is silent and expensive: a
ceiling at or below the tail ends the wave before the tail is emitted — nothing
throws, the road looks busy, the wave still *says* 88 bodies and still pays for
88, and the only symptom is that the campaign's stated 830 bodies are not the
ones that walked. Strictly greater and not `>=` because a body due at the exact
instant the ceiling closes is a body whose emission depends on the order of two
comparisons inside one frame.

**Deleted with the sequential scheduler:** `WAVE_BREAK`, `waveGroupAt()` and its
`opensGroup` flag (the last residue of `lead`), and the old
`spawnScheduledEnemy()` walk. `spawnScheduledEnemy()` survives as a **fixture
entrance** — emit the body at the cursor, no clock, no banner — because the
sandbox and the tests that pin what a *scheduled* body carries (its tier, its
wave identity) go through it, and that link shipped broken once already. Its
cursor is the timeline's, so a fixture that wants the Nth arrival counts
arrivals, not group members.

**Whole-campaign proof, run once by hand and once in the suite.** A board with no
towers and an oversized base wins at t=2207.8 s with `cash` exactly
`$600 + $2594 + $5000 + $4505`. Nothing was killed, a leak pays nothing, so the
only money that moved is the 35 clear rewards — a wave paid twice, or one that
slipped a gate unpaid, is a wrong total and nothing else. `tests/run.js` asserts
that sum.

**Tests: run.js 118 → 125 (+8, −1).** The removal is
`"a mixed wave deploys its groups in order, each at its own spacing"` — it passed
and it was true, and it is deleted rather than repaired because its subject was
deleted: groups no longer deploy in order, `lead` is not a field, `waveGroupAt`
is gone. Wave 12 is now walked by `"a wave resolves into one interleaved timeline
of arrivals"`. Five more kept their subject and lost the ninety-second break from
their names:

| was | is |
|---|---|
| wave 1 deploys five enemies, then wave 2 waits out the ninety-second break | a wave deploys on its own clock and its ceiling hands over to the next |
| if the ninety seconds simply run out, the next wave's arrival pays it | if a wave's ceiling simply runs out, the expiry pays the bonus |
| clearing the board calls the next wave in | wiping out a wave ends it, five seconds before the next |
| the player can call the next wave in, and it arrives three seconds later | the player can send the next wave once this one is out, and it takes three seconds |
| a mixed wave deploys its groups in order… | (removed, see above) |

**Assertions re-pointed, not relaxed.** Several tests looked up a group by INDEX
(`waveGroups(W[30])[1]`), which the salvo split silently re-pointed at a different
body — wave 31's "100 HP Brute" assertion was reading a 13 HP body and passing.
They search by type now. `"the campaign spends the whole tier ladder"` counted
GROUPS and found ten rungs in a six-rung ladder; it counts waves. Wave 24 and the
camo waves asserted `groups.length === 1` as a proxy for "nothing on the ground";
they assert the roster rule itself, which is what was always meant.

**Two measurements genuinely moved, and are re-measured rather than relaxed:**
wave 2's peak burst is 6.15 HP/s, not 4 — its eight Normals are now 4 at 1.0 s and
4 at 0.65 s, and peak burst is exactly what a re-timing is allowed to move. Two
gunners over 120 s of the opening now kill 5 and leak 8 instead of 4 and 9,
because the second salvo lands inside the first gunner's reload window; **base HP
is 83 either way**, which is what says the extra kill is a body that used to leak
with damage already on it. Composition is held still by the totals test: 35
waves, 830 bodies, 25 939 effective HP, unchanged.

**`harness.pinWaveBreak()` is now a named no-op.** It wrote `WAVE_BREAK` to get
more than one wave inside a fixed measurement window. There is no such number;
what replaced it, where the window actually needed it, is `autoSkipWaves = true`
— the same cadence, and it holds the spacing BETWEEN waves still without touching
a wave's own intervals. `defend()` in content.test.js needed that: without it
lattice and meridian tie at 84 and the route comparison has nothing left in it.

**One real bug found by driving the sandbox's own idiom, not by reasoning.** It
restarts a run onto the SAME wave by hand (`waveSpawned = 0; waveCountdown = 0`,
index untouched), and with the reward latch cleared only when the index moved,
that re-run wave deployed perfectly and never owed its bounty. The latch is now
also cleared whenever the cursor is at zero — a wave that has put nothing on the
road has by definition nothing to have been paid for.

**Known incomplete:** `AGENTS.md` still describes the sequential scheduler and is
not updated by this entry.

**2026-08-25 — The wave HUD: a corner readout with a clock in it, a Send button
behind one predicate instead of three copies of one, and wave summaries keyed
on `(type, health, tier)` rather than on the display name.**

The readout used to say two things — `Wave 8 in 90 s` and
`Wave 8 / 35 · 12 / 22 deployed` — and neither of them was the number a player
now needs, because a wave has a `duration` since the timeline rewrite and no way
to show it. `waveStatusText()` has four states:

| state | line |
|---|---|
| a wave is on the road | `Wave 7 / 35  ·  12 / 22 deployed  ·  38 s left` |
| a transition | `Wave 8 in 3 s` |
| the final wave, on the road | `Wave 35 / 35  ·  3 / 49 deployed  ·  FINAL WAVE` |
| the schedule is spent | `Final wave  ·  6 still walking` |

**The final wave gets a STATE where the timer goes, never a number.** Wave 35
authors no `duration`, and that absence is the data saying there is nothing after
it. `waveTimeRemaining()` returns **null** — not 0, not a default — and the line
prints `FINAL WAVE`. A materialised ceiling there would have been a countdown to
a wave 36 that does not exist, which is the one thing this readout must never
draw. Same rule the wave data follows about absent fields; here the cost of
breaking it is a lie on screen rather than a wrong enemy.

**One transition state, three delays.** The 10 s opening pause, the 5 s a
wiped-out wave buys and the 3 s a Send buys all print the same line, off
`waveCountdown` and not off a per-gate constant — so the corner cannot claim
three seconds while the scheduler is running five.

**`waveElapsed` is new: the wave clock, started at the wave's FIRST SPAWN.** Not
at the end of the break — `duration` is a ceiling on the wave, not on the pause
in front of it, so a wave called in early has exactly the same seconds as one
that waited its break out. It advances in `updateWaves()` next to the countdown
rather than in a draw function, because the timeline scheduler wants the same
clock to *enforce* the limit this readout *shows*, and two clocks would be two
things to disagree. `tests/run.js` pins that it advances.

**`countdownSeconds()` carries a 1e-6 epsilon and it is not superstition.** The
clock is a sum of ~60 float additions a second, so two seconds into a 32 s wave
`32 - waveElapsed` is 30.000000000000004 and a bare `Math.ceil` reads 31 — the
corner sits a second behind for one frame in three, at a moment nothing has
happened. This was found by a test expecting `30 s left` and getting `31`, not
reasoned about in advance.

**The Send button is now behind `waveSendAvailable()`, one predicate with three
readers** — the drawing, the click handler and `overInterfaceChrome()`. All
three used to spell out `waveControlsShown() && betweenWaves()` for themselves
and **the drawing had already dropped a term**. The rule it states: live once
every scheduled body of the wave in play is on the road, never one instant
before, and nothing to do with whether the road is empty.

The failure that shape rules out is not "invisible and dead" — it is
**invisible and live**: 168×30 of open map at (22, 100), near the top-left where
a player builds early, silently eating the click meant to put a tower there. So
the test does not reason about the predicate. It sweeps all 344 points of the
rectangle in three scheduler states, asks the game's own
`overInterfaceChrome()`, and then actually builds a tower there. Self-tested by
widening the chrome test back to `waveControlsShown()`: red, with all 344
mid-wave points claiming a click.

**`waveSummary()` is keyed on `(type, health, tier)`, not the display name.**
Aggregating salvos was already right — the timeline cut wave 13's twenty Angries
into five groups of four, and `4 × Angry` five times is not a roster. But
`Enemy.typeOf` maps every rung of the Fractal ladder onto one row, so a name-only
key printed a T1 salvo and a T5 salvo — 4 HP and 1024 HP — as one
`8 × Fractal Slime`. No wave in the schedule splits a type across two `health`
values or two tiers today (checked wave by wave, all 35), so this prints exactly
what it printed before; it is strict anyway because the banner is the only place
a player can see the difference, and the day someone authors that wave nobody
will remember to come back here.

`tests/run.js` 112 → 118. Self-tested by three mutations, restored after each:
dropping `waveElapsed += dt` goes red on both clock tests; widening the chrome
test goes red on the sweep; keying the summary on the name goes red on the
health and tier cases.

**2026-08-25 — The 35 waves are now TIMELINES. Every group carries an absolute
`at`; every wave but the last carries a `duration`; `lead` and the flat wave
form are gone. Pure re-timing: not one body, health override or tier moved.**

`EASY_WAVES` was a queue. A wave listed its groups, each group started when the
group above it finished, and an optional `lead` bought a pause in place of the
previous group's `interval`. So every entrance in the schedule was the SUM of
everything authored above it, and re-spacing any group silently moved every
group after it — the wave-25 Fractal root's "six seconds of silence" and the
wave-35 Tyrant's mid-wave entrance were both accidents of arithmetic that
happened to hold.

Each wave is now `{ duration, groups: [ { at, count, interval, type?, health?,
tier? } ] }`. `at` is seconds from the start of the wave, absolute; body N of a
group lands at `at + N * interval`; groups are independent and may overlap,
start together, or leave a gap. `duration` is a ceiling on the wave measured
from its start, not a pause appended after its last spawn. Wave 35 carries
none, because there is nothing after it to time out into.

**NOTHING ABOUT WHAT WALKS OUT OF THE GATE CHANGED, AND THAT WAS THE GATE ON
LANDING IT.** Composition was frozen per wave before the edit — type, count,
`health` presence-or-absence, `tier` presence-or-absence — and re-derived after:
35/35 waves identical, and identical again through the game's own
`waveCount` / `waveEffectiveHealth` / `waveKillBounty` / `waveBounty` against the
pre-edit group table. 35 waves, 830 bodies, 25 939 effective HP, $2 594 clear
bounty, $22 321 kill bounty — unchanged to the unit. **Do not read a re-cut as a
retune**: the cut is a TIMING decision, and a comment saying otherwise is how
this file has misled people before.

`duration` is strictly past each wave's last scheduled spawn, by 26.0 s at the
tightest (wave 7) — the ceiling is a floor under a board that is losing, never
a guillotine on a wave that deployed normally.

What the cut bought, wave by wave, is in the comments: the Vanguard now sprints
in THROUGH wave 34's river of swarm at 2.2 s instead of four seconds after the
last speck, wave 27's two Shieldbearers stand at 2.5 s and 7.5 s inside their
wave instead of behind a wave that is already dead, wave 30 interleaves three
Hives, two Shieldbearers, three bursts of Swarm and four Angries across twelve
groups, and the Tyrant enters at `at: 13` — 46% of a 28 s deploy — because
someone chose 13, not because the sum came out there.

`waveSummary` now SUMS salvos of one type: wave 13's five salvos of four print
`20 × Angry`, not the same entry five times. The banner is a roster; the cut is
timing, and the banner aggregates it away.

`waveGroups` lost its `wave.groups || [wave]` fallback and throws a named error
on a wave without `groups`, because the callers still writing the flat shape are
hand-built test fixtures and an unnamed `undefined.length` four frames away is
the worst possible way to tell them.

**THE SCHEDULER IS NOT MIGRATED IN THIS ENTRY.** `spawnScheduledEnemy` still
walks the groups back to back and ignores `at` and `duration` entirely. The game
boots and every wave deploys its exact roster, but wave TIMING is wrong until
the timeline scheduler lands. Ten test names are red on that and on fixtures
that still author the flat form; they are listed in the follow-up entry that
lands the scheduler. Nothing was weakened to make anything pass.

**2026-08-25 — Every enemy carries the wave that sent it, and a wave now ends
when ITS bodies are gone rather than when the road is empty.**

`Enemy` grows `waveId`: the 1-based number of the wave that scheduled the body,
matching the number on screen. `0` means nothing scheduled it — sandbox spawns,
codex sprites, test fixtures — and a `0` can neither hold a wave open nor close
one.

**THE BUG THIS FIXES IS THAT A DEAD WAVE COULD BE HELD HOSTAGE BY A LIVE ONE.**
The clear test was `enemies.length === 0`, so *any* body on the road suppressed
it. The 90 s ceiling exists precisely to start the next wave over the top of a
wave that is not finished, and a Fractal Slime cascade can take longer to unwind
than the wave that authored it — so beating wave 30 outright paid no clear
bounty and called nothing in while one wave-29 Brute was still walking, and
nothing on screen told the player which body was doing it. The road going empty
and the wave being beaten stopped being the same event the day waves were
allowed to overlap; the code had not noticed.

`waveStillOnTheRoad(n)` scans for `waveId === n`; the clear branch in `update()`
asks it about `lastDeployedWave()`, which is `waveIndex` — the wave *behind* the
cursor, never the one still spawning, so a road that goes momentarily empty
between two groups cannot close a wave early. `lastDeployedWave() > 0` replaces
`!beforeFirstWave()` and carries the same load, plus the sandbox's bodies.

**THE IDENTITY IS INHERITED, NEVER RE-DERIVED,** and finding every place it has
to travel is the whole of the change. Four board-facing `new Enemy` call sites
exist: `spawnEnemy` (game.js) **mints** it from `waveIndex + 1` — the only place
an identity is created — and `spawnMinions`, `splitOnDeath` and `summon`
(enemy.js) each copy the parent's across, for a Hive's brood, a Fractal Slime's
four children and the Tyrant's roar. The fifth site is `codex.js`, a parked
sprite that never joins `enemies`. A **Revenant needed no code**: it gets back up
as the same object.

A global "current wave" read inside the child would have been wrong rather than
merely indirect. A T5 slime leaves 1 364 descendants and a Hive drops five
hatchlings every seven seconds; those bodies outlive their ancestor's wave
routinely, and re-parenting them onto the current one produces a wave that can
never be closed.

**VICTORY STILL ASKS ABOUT THE WHOLE ROAD,** deliberately, and the asymmetry is
commented at both sites. A transition is a question about one wave; winning is a
question about the map, so `allWavesDeployed && enemies.length === 0` stays —
a stray wave-33 Brute walking during wave 35 has to keep the victory screen
away, and `waveStillOnTheRoad(35)` would hand the player the win over its head.

**ONE EXISTING TEST WAS RELYING ON THE BUG.** "wave 1 deploys five enemies, then
wave 2 waits out the ninety-second break" rooted a wave-1 body to hold *wave 2's*
break open, which only worked because any body would do. It roots one of wave 2's
own now. Four tests added in `tests/run.js`, one per hop the number takes:
minted by the scheduler (wave 25's slime is stamped 25, not its index 24),
inherited through the whole 84-body cascade and through boss → summoned Hive →
brood, a straggler failing to hold the next wave open, and the win still waiting
for the road. `tools/ci-check.js` run.js baseline 108 → 112. Self-tested by
dropping the `waveId` out of `splitOnDeath`: red on the origin assertion with the
84 descendants still counted correctly, which is why the origin has its own test
rather than riding on the tier one.

No enemy, tower, HP, quantity, cost, reward or map was touched: 35 waves,
830 bodies, 25 939 effective HP, all six suites at their measured baselines.
**2026-08-25 — The route cards were the map's mirror image, in one axis
exactly. `drawMapThumbnail` now flips its render vertically while the board is
the 3D one.**

Reported by the owner as the cards and the battlefield being "inversées" since
the move from 2D to 3D, and that is precisely what it was: a **vertical mirror,
horizontal untouched**.

**MEASURED, NOT EYEBALLED.** Rune Circuit's own route points, pushed through
`camera.worldToScreen` at the opening camera:

    world (-60, 160) -> screen (166, 436)
    world ( 300, 460) -> screen (437, 327)
    world (1340, 220) -> screen (1101, 412)

World y rising 160 -> 460 moves screen y 436 -> 327, i.e. UP. World x rising
-60 -> 1340 moves screen x 166 -> 1101, i.e. right, same as the card. One axis,
inverted; the other, identical. Nothing was rotated and no waypoint order was
reversed.

**THE CAUSE IS A CONVENTION, NOT A BUG IN EITHER RENDERER.** Routes are
authored in canvas pixels where +y is DOWN, and `drawMapThumbnail` still paints
them on a 2D canvas, which honours that. The GL board reads the same world y
through a camera parked on the -y side of its target (`OrbitCamera`'s default
`yaw = -PI/2`, `gl-camera.js`) with world up at +z, so its screen-up is
`0.56*y + 0.829*z`
and +y goes UP. Both are correct on their own terms and they disagree by a
mirror.

**THE CARD IS THE SIDE THAT GIVES, because the board's side cannot be turned
round.** A camera anywhere above the ground plane maps (x, y) to the screen the
same way round; swinging it to the +y side to send y downward sends +x leftward
with it, since `right = cross(fwd, up)` flips too — that trades a vertical
mirror for a horizontal one and fixes nothing. The only genuine board-side
fixes are a negated y through every mesh, every actor and `screenToWorld`, or a
mirrored projection, and a mirrored projection inverts every triangle's winding
and hands every model its other hand. Against that, the card's fix is
`translate(0, VIEW_HEIGHT); scale(1, -1)`.

**GUARDED ON `World3D.isEnabled()`, deliberately.** With no WebGL the
battlefield falls back to the 2D pass in `draw()`, which really is +y-down, and
a card flipped against that would break the same promise in the other
direction. The flip is therefore a statement about which renderer is on, not a
correction to the authored data.

**NOTHING SIMULATED MOVED.** No route point, no `GamePath`, no `Maps.toWorld`
output and no analysis figure changed — the whole change is a canvas transform
inside the preview's own `save`/`restore`. `tools/ci-check.js`: 495 / 0 and
`MANIFEST OK`, unchanged.

Verified on screen for Rune Circuit (road entering low-left and rising, both
sides) and Null Meridian (its one long ley-line descending left-to-right on
both, where before the card climbed and the board fell).

**2026-08-20 — The Bulwark is TWO imported bodies, and breaking its shield
swaps one for the other. `glb_to_model.py` grows a pair of rigs: a jog with a
suspension in it, and a bound that hops one leg at a time.**

At the owner's instruction: *"add the bulwark with shield and no shield model,
the no shield appearing after the shield break. the animation of the bulwark
should be fast and nimble with the shield, whilst without his shield, he would
be moving in a very springy manner, like a kangaroo, but one leg at a time"*.

**THE MECHANIC IS EIGHT MONTHS OLD AND HAD NO PICTURE.** `shield.onBreak`
doubles a Bulwark's speed to 90 u.l./s the moment its 24 points of shield empty
— past the Fast type's 87.5, which is the whole design of the type — and until
now the only thing that changed on screen was that the blue bubble popped. The
same navy Courier walked on at twice the pace. There are now two meshes: the
shielded specialist inside a twenty-segment energy halo, and the stripped
machine with the halo gone, four bare mounts where it clipped on, and its back
vents open.

**THE SWAP IS THE REVENANT'S MECHANISM, GENERALISED.** `ENEMY_VARIANT` in
`gl-world.js` was one type naming one model off `revived`; it is now a map of
state-flag → model per type, first match wins, and the Bulwark's flag is
**`shieldBroken`** — a new one-way field on `Enemy`, set in `breakShield`.

**IT IS NOT `shield <= 0`, AND THAT IS THE ONE TRAP IN THIS CHANGE.** A
Shieldbearer's pulse hands 20 points of shield to the ten strongest bodies on
the road, and a broken Bulwark is exactly the kind of body it picks. Its pool
goes positive again; its doubled `speedScale` does not, because nothing ever
puts that back. Reading the pool would have bolted the halo onto a machine still
running at 90 u.l./s. Same argument, and the same one-way shape, as `revived`.

**AND THE BUBBLE'S CACHE KEY WAS A LATENT BUG THIS WOULD HAVE SPRUNG.**
`shieldBubble` cached its shell under the type id plus a hand-written
`:revived` suffix. The bubble draws while `shieldFlash` decays, and by then
`shieldBroken` is already set — so the first Bulwark bubble a board ever drew
could be one measured off the *stripped* body, whose plan extent is the torso
alone against the shielded body's halo, and every Bulwark for the rest of the
session would have worn it. It is now keyed on the model name `enemyModel`
resolves, which is the thing it actually measures.

**TWO RIGS, ONE GROUPING, AND THE GROUPING IS ONE TOKEN.** Both files name
their legs `Lead` and `Trail` — a stance, not a side, because both are authored
mid-stride — and in both files every part carrying a `lead` or `trail` token is
leg geometry and nothing else is. `lead` → `leg_l`, `trail` → `leg_r`, which
matches the corpus: `Lead` parts sit at x < 0, the side `boss.glb` spells
`Left`. Three traps are live in these sources and are written up at
`bulwark_group_of`: `left`/`right` DO appear and must be ignored (they are on a
faceplate, two helmet fins and a pair of back vents); `Overdrive_` is a model
prefix that is on the toes AND on the hip core, the sternum and the helmet; and
`vent` is on both a back panel and a calf.

**THE GAITS ARE THE DUTY BEFORE THEY ARE THE AMPLITUDE.** `walk_cycle` holds
each boot down for exactly half the cycle so no frame has both feet in the air.
The jog gives that up a little (0.46, two single-frame suspensions) and the
bound gives it up entirely (0.25 — half the cycle airborne, more than the
hound's gallop). Both read their body's rise off the plant windows through
`airborne_lift`, so a retuned duty cannot leave the body at the top of its arc
with a foot planted.

**WHAT THE BOUND ADDS IS THE HALF `airborne_lift` HAS NO OPINION ABOUT.** It
answers the flight and returns 0 for every supported frame, and a body that
rides zeros through its own landing is being *carried* over the road rather than
pushing off it. `bulwark_body_rise` eases the mirror of the same curve DOWN over
each stance, so the body compresses onto the leg that caught it and extends off
it — one continuous curve whose every inflection is a footfall. The pitch is
then that curve's own vertical velocity: nose up climbing, nose down falling,
which cannot come apart from the footfalls the way a phase-authored cosine can.

**`BOUND_REACH` WAS 0.95 AND THE RENDER SAID 0.35.** `swing_reach` buys arc in
the air, which is right for a jointed gallop. These legs have ONE hinge, at the
hip, so an overshoot cannot fold a limb — it swings the whole rigid thing
further, with a foot nearly a third of the body's own height on the end of it.
At 0.95 that was a straight-legged high kick, twice a cycle. The spring is
bought where a one-jointed rig can spend it: in the body.

**BOTH SLIP 0.000 px** (`node tools/check-gait-slip.js`), which for the bound is
a real result rather than a formality: the swinging boot follows the body DOWN
into the other leg's crouch and still has to clear the instrument's 0.015 plant
band while it does.

**ONE SCALE, NOT ONE HEIGHT.** The two files are 3.0771 and 3.0371 source units
tall, so fitting each to the Courier's 1.354 would have made the stripped body's
every part 1.3% larger and grown the Bulwark at the instant its shield popped.
The stripped import takes `--span 3.0771` — the shielded file's own measured
span, the mechanism that already exists for the Revenant's two halves — and
comes out at 1.336 as a *consequence* of being the same machine.

**`Integrated_Kinetic_Field` IS DROPPED BECAUSE THIS FORMAT HAS NO ALPHA.** That
node is the shield's energy plane, authored at baseColor alpha 0.075, spanning
the body in x and z and cutting through the torso in y. A palette row here is
`[r, g, b, emission]` with no fourth channel for it to land in, so imported it
ships OPAQUE — a navy disc bisecting the machine. Nothing is lost: `gl-world.js`
has drawn a real translucent shell around any body whose shield holds since
2026-08-18, sized off this mesh's own extent, so the field is drawn by the
renderer that can actually blend it.

**`--glow sum` GOT THE ONE LAMP WRONG AND `BULWARK_TINT` FIXES IT.**
`Bulwark_Energy_Gold` — the chest paths, the halo segments, the leg springs, the
visor — carries a bright base AND a bright emissive, which is neither case the
`glow` argument was written for: summed in linear light they clamp to
(1.0, 1.0, 0.125), and the authored strength of 1.0 then adds 0.16 of white on
top. The springs shipped as WHITE stripes on a navy machine, seen on the real
renderer. The tint takes the emissive's own hue at a heat of 0.55 — the hound's
lava crust — on the argument HOUND_TINT already makes at length: the resting
floor is white, so a saturated lit part is bought with a small number.

**AND THE FIFTH TARGETS ROW IS GONE.** `enemy-shielded` was built here by
`enemy_courier.py`; a `.glb` import and a Blender target must never name the
same output, and this is the fifth time that trap has been disarmed (the
Skimmer, the Tender, the Tun, the Tyrant, now the Courier). `enemy_courier.py`
is kept — `enemy_tender.py` and `enemy_vanguard.py` both measure against its
chest. `enemy-shielded-broken` has never been built here and must never be
given a row.

**2026-08-20 — The Fractal Slime's six tiers are SCHEDULED, one rung per wave,
placed by the HP the index has always printed for them.**

At the owner's instruction: *"i want the slime tiers to spawn in accordance to
their HP as stated in the index and behave in that manner"*.

**THE MECHANIC WAS NEVER BROKEN — THE SCHEDULE WAS EMPTY.** A tier spawned by
hand has carried its stated health since 2026-08-12 (T0 = 1, T1 = 4, T2 = 16,
T3 = 64, T4 = 256, T5 = 1024), splits into four of the rung below, and the index
derives every one of those figures from the type's own `fractal` block. What the
campaign actually sent was **one rung of the six** — the T3 in wave 25 — so five
tiers existed only as somebody else's split children and the guide was
advertising a ladder the schedule never climbed. Verified before touching
anything: all six tiers spawn at the stated HP, bounty, radius and birth stun.

**T0 in 16, T1 in 17, T2 in 22, T3 in 25 (unmoved), T4 in 33, T5 in 35.** HP is
the placement rule, but the number that decides a rung's home is not the root —
it is `root × (T + 1)`, what clearing the whole cascade costs, and `4^T`, how
many terminal one-point bodies end up walking at a 100 HP base. T5 is 6 144
points and 1 365 bodies; there is exactly one wave in a thirty-five-wave
schedule that can host that, and it is the one with the Tyrant in it.

**THE SCHEDULE PAID FOR THE LADDER RATHER THAN GROWING BY IT.** Authored
effective HP 25 898 → 25 939, +0.16%: wave 33 funds its T4 exactly (two Bulwarks
and a Brute), wave 35 covers −340 of the T5's 1024, and waves 27, 29, 30, 31, 32
and 34 give up 641 more at 5–9% each; waves 16, 17 and 22 cover their own three
small rungs locally. 1 267 points trimmed against 1 308 added, and the 41 points
of difference are the entire rise. **Nothing came off a v0.4.4 spine
opener** (`tests/run.js` pins each old wave's opening group) **or off a mechanism
body** — halving a Hive, Shieldbearer, Healer or Colossus is a design change, not
a trim, which is the rule the 2026-08-13 retune already wrote down. What got
thinner is ordinary escort.

**DO NOT QUOTE THE AUTHORED TOTAL AS IF NOTHING CHANGED.** The real load is up
sharply and the accounting is deliberately blind to it, exactly as it is to a
Hive's brood: the six roots count 1 372 points, and a board that clears every
cascade removes 7 748 across 1 826 bodies. Kill money moves the other way — scheduled bounties
FELL $451 to $22 987, because the Fractal Slime prices health at $0.50 a point
where an ordinary body pays $1 — and comes back conditionally: the generations
pay $3 874 against the $686 of roots the purse counts.

**MEASURED, NOT ARGUED.** Headless, maxed boards, leaks counted directly
(`baseHp` is useless as a meter here — upgrade paths heal it):

- 20 mixed maxed towers, wave 35: 1 453 kills, **peak 151 bodies on the road**,
  zero leaks, 55 s. Without the T5: 88 kills, peak 40, 37 s. The peak is the
  number that mattered — the cascade resolves in generations, so 1 365 bodies
  never stand on the road at once, and update cost is linear anyway (1.13 ms
  per frame at 1 024 bodies).
- 14 maxed Arcane Snipers and nothing else, wave 35: 146 points of leak damage
  against a 100 HP base — it LOSES. That is the intended shape: the finale now
  asks for coverage, not only for single-target damage.
- Five un-upgraded towers took the same 11 / 70 / 100 points of leak damage on
  waves 16, 17 and 22 with the ladder in and with it stripped out. The three
  early rungs are texture and income, not difficulty.

**T0 IS IN 16 AND NOT IN 12, AND THAT IS NOT ARBITRARY.** Wave 12 is the suite's
mixed-wave fixture (`tests/run.js`, "a mixed wave deploys its groups in order",
which counts its groups and reads its banner). A fixture that changes shape
whenever content lands stops testing the scheduler, so the content moved instead.

**ONE TEST CHANGED TECHNIQUE RATHER THAN EXPECTATION.** "the last wave's bonus
is paid for clearing the board" killed every body on the board in one sweep and
stepped once; with a T5 in wave 35 that leaves four T4s standing, so it now
sweeps until the board is actually empty. `noBounty` is inherited by children
(`splitOnDeath` passes it down), so the clear bonus is still the only cash in
the sum.

**The index needed no edit and must not get one.** Tier range, highest campaign
HP and the campaign-waves list are derived in `js/codex.js` from the schedule
and the `fractal` block, so the guide moved on its own: it now reads
`T0–T5 (1–1024 HP)`, `1024 HP` and `16, 17, 22, 25, 33, 35`. Confirmed in the
browser, along with a live T5 dividing into four 256 HP T4s for $512 with the
0.5 / 0.67 / 0.83 / 1.0 s birth stuns.

**`tests/content.test.js` gains "the campaign spends the whole tier ladder, at
the index's own HP"** — the correspondence in both directions, plus a check that
no fractal group carries a `health` override (`Enemy.healthOf` discards one, so
it is a no-op on the body and a lie in `waveKillBounty`). Self-tested by
deleting the T4 group: red on the rung count, on three T4 assertions and on the
codex's derived wave list; green again on restore.

**2026-08-19 — The Tyrant gets its Hunter-Killer body, and its aimed shot fires
from its eyes and blows up where it lands.**

At the owner's instruction, two things: "ive implemented the tyrant model. add
that", and "when the tyrant attacks a tower, he shoots lasers out of his eyes at
that tower and it creates an explosion on impact".

**`boss.glb` breaks BOTH import conventions at once**, and is the first file to
do so: z-up like the beacon, and facing **−Y**, which nothing before it did. See
the facing entry below — it was written for the plodder and the Tyrant needed it
the same hour. `--rig tyrant` supplies only a `group_of`; the pivots and the
gait are the humanoid's, by reference. The names are matched differently from
the plodder's because this file names parts for the MACHINE rather than for the
limb — the arms are the `Hunter_` one and the `Windup_`/`Executioner_` one, so
half the right arm carries no side token at all. **Two orderings in that
function are traps**: `Foot_Claw_Left_+0.00` carries "claw" AND "foot", and
`Chest_Armor_Left` carries "left" and is TORSO. Fitted to **1.076 u** — the body
it replaces, and the "82 tall and 70 wide" the roster is balanced against —
4568 triangles from 5392, 16 frames, **A = 0.001 px** of slip with both feet at
50% duty.

**THE TRAP SPRANG A FOURTH TIME, AND REMOVING THE ROW CLOSED A SECOND HAZARD.**
`enemy_tyrant.py` built `enemy-boss.js` until this import; its TARGETS row is
gone for the Skimmer's reason, the Tender's and the Tun's. It was also the first
target name in TARGETS that is a PREFIX of another (`enemy-boss_fast`), so
`--only=enemy-boss` rewrote the Vanguard too — identical in triangles, not in
bytes. With the row gone that prefix has one match again. The script is kept: it
remains the worked example of a swing angle derived from leg depth.

**The eye beams are two marks, not one.** `tyrant-gaze` carries both endpoints
and has a renderer on each board, for `lance-remnant`'s reason — a beam is a
line, and the circular fallback draws an expanding ring centred on the middle of
the shot. `tyrant-blast` has NO renderer on purpose: an unrecognised kind falls
through to the shockwave-and-debris path both boards already end in, which is
the shape an explosion wants, and naming it anyway lets a skin pack claim it
later. Opt-in on the SPEC, never the type id — the roar's leap must not inherit
eyes. All four numbers are measured off the model: the sensor band is 2.62 radii
up, the outer lenses ±0.235 radii apart. The old `attackBeam` bolt is suppressed
rather than drawn underneath, because it leaves the body's CENTRE and read as a
shot from the belly — and because it is drawn by the 2D renderer only, **the
boss's signature attack was invisible on the 3D board before this**.

**2026-08-19 — Which way a `.glb` faces is now the file's to say, and the
plodder was walking backwards.**

A rig declares `source_forward` beside `source_up`. The up-axis remap fixes
which way is UP and says nothing about which way the body POINTS once standing;
the y-up remap sends source +Z to the game's forward +X, so every import until
now assumed "this file faces +Z" — true of all six, and not true of `slow.glb`
(−Z) or `boss.glb` (−Y).

**NOTHING IN THE TOOLCHAIN MEASURES FACING.** The plodder shipped backwards
first and every instrument was green: the gait solved, and `check-gait-slip.js`
scored **A = 0.000 px**, because a heel plants exactly as well as a toe. What
caught it was comparing the head group's mean x against a body known to be
right — the Revenant's 0.0709 against the plodder's −0.0753.

The defaults are the old behaviour exactly, and a zero yaw skips the rotation
rather than multiplying every point by an identity built from cos and sin.
Verified by printing the yaw each shipped rig resolves to — all six are exactly
0.0 — rather than by re-running them, since their original flags are recorded
nowhere. (An attempt to re-run `enemy-revenant` from guessed flags produced
14801 triangles against the shipped 4410, which is its own warning: **do not
regenerate a model from a guess**. The generated headers were retargeted to the
new filenames by editing the one comment line, which is exactly what a
regeneration would emit for it and nothing else.)

**2026-08-19 — Every `.glb` is named for its enemy.**

At the owner's instruction: "in all glb files, rename the corresponding .glb
file to its enemy name". `glb/` held `robo-hound.glb`,
`Auroris_Shield_Beacon.glb`, `plodder_slow_enemy.glb` and five more named for
what the artist drew, so answering "which file is the Fast?" meant opening
files. It is now the model's own id with `enemy-` taken off. **Nothing at
runtime reads a `.glb`**, so the rename cannot break the game; what it touches
is every `--name` line in the importer's header and the "Source of truth is
X.glb" line each generated model carries, and both moved with it.

**TWO FILES ARE DELIBERATELY NOT RENAMED.** `fractal-slime.glb` is the unit
sphere — 84 500 triangles, zero materials, every vertex 1.0 from the origin —
and is not the Fractal Slime's source, so giving it that name would assert the
exact thing AGENTS.md exists to deny, and would put the filename one `--name`
away from the body `enemy_slime.py` builds. `raptor-war-machine.glb` (392 parts,
a segmented spine) corresponds to no type in the roster and is imported by
nothing: it is a source waiting for a body, and naming it for an enemy before it
has one is the same mistake pointing the other way.

**2026-08-19 — The Slow is a plodder, walking at 0.7x.**

At the owner's instruction: "implement the slow model (plodder_slow)" and
"change the slow enemy speed to 0.7x" (35 u.l./s, from 40). `--rig plodder`
borrows the humanoid's pivots and cycle *by reference* — a boot plants the way a
zombie's does — and supplies only a `group_of`, because **`slow.glb` is FLAT**:
all thirty meshes are direct children of one `Plodder_Root`, so `chain[1]`, the
limb the humanoid rig matches on, does not exist. Pointing the humanoid rig at
it is not a bad walk, it is a statue sliding down the road. The side comes off
the base name FIRST, because `Eye.L` ends the way `Fist.L` does and a
suffix-only rule welds the face onto the arms and swings it.

Fitted to **0.979 u**, the body it replaces rather than this mesh's own
proportions: the Slow has drawn 31.1 px since the chassis built it and is
deliberately shorter than a normal's 37.8, so the humanoid's own 1.19 default
would have quietly made the slow type the taller of the two. 636 triangles, from
2584. **A = 0.000 px** of slip. The Tun's TARGETS row is gone (the trap's third
springing); `enemy_tun.py` is kept because `make_preview.py` still uses it.

**2026-08-19 — Camo enemies are their normal variants, drawn through.**

At the owner's instruction: "all camo enemies are modelled as their normal
variants but just transparent", and `camo_heavy` "is a camo slow". This
completes a ruling whose other half already shipped — "do the camos like the
others, just make them a bit translucent or sum" is what the two-pass CAMO_ALPHA
draw was built for.

**THE TRANSLUCENCY WAS NEVER THE MISSING PART — THE BODY WAS.** `camo_fast` and
`camo_heavy` have never had a mesh registered under their own ids, so
`GLModels.has` failed and both fell through to the coloured sphere. The 3D board
was fading a ball, with every suite green. `CAMO_SHADOWS` maps each camo type to
the one it shadows and draws THAT model at 0.62 alpha.

**`camo_heavy` is a camo SLOW, and nothing in the code said so.** Its type row
still reads "this one shadows nothing", which was a claim about its STATS — it
is the only camo body with real defences — and never about which body it walks
in. What ties it to the Slow is what its own comment says out loud, "heavy, so
it plods": ×0.65 against the Slow's ×0.7, at sizeScale 1.4. The table is
explicit rather than a `camo_` prefix strip, because a strip finds no `heavy` in
the roster and would resolve a future type to whatever its name happened to
spell. `enemy-camo_normal` (the Cooper) is no longer the body the Camo Normal
walks in; the file, its tags and its export row are all left alone, because a
built body that may be wanted again is not something to delete.

**2026-08-19 — The six standing `content.test.js` failures are closed, and no
product code moved for any of them.**

The suite is green for the first time since the baseline was measured: 216/0 and
108/0, from 207/5 and 107/0. **Every one was the fixture being wrong about a
game that was right**, which is what the ci-check notes had already predicted
for five of them.

- **The two Tyrant number tests** were the stale-retune repair nadia ruled on,
  applied in the direction she named — the CODE is canonical. Shield 200 →
  **1000**, leap 50 → **90 u.l.**, post-roar 6 → **9 s**, roar summon 30 → **40
  bodies**. The 601/610 trap was real: `Enemy.TYPES.boss.attack` is a key the
  type row has never had (the pool is `attacks`), so the lookup threw instead of
  asserting, and repairing it exposed the summon count underneath. The shield,
  the interval and the body count are now DERIVED from the type in the test, so
  the next retune moves them instead of going stale a third time.
- **The alternation test** was a SETUP fault, not the behavioural defect the
  notes suspected. Its own comment claims "towers all along the road", but the
  row sat on a fixed y=505 line while the boss walked 675 u.l. away from it
  during the test's own 45 s pre-roar measurement, ending **248 px from the
  nearest tower against the leap's 228.8 px reach**. Every turn fell through to
  the aimed shot — which is documented, correct behaviour — and the test read
  that as a broken cycle. Spreading the row along the path's own length (~84 px
  worst-case gap) makes the leap eligible, the index then advances by exactly
  one, and the observed order is leap, aimed, leap. **The strict alternation
  assertion was kept, not weakened.**
- **The attack-posture test** asserted something its own helper can never
  satisfy. Damage lands at the START of the strike phase and
  `driveAttackToResolution` returns on the frame a hit comes back, so the hit
  arrives at 0.317 s with 0.7 s of strike and turn-back still to run — "turned
  back and resumed" could not be true on that line. The claim is real and is
  kept; it just has to be asked after the clock that clears it, so the remaining
  phases are driven out first.
- **The two Soldier throws** were one defect in `buyPath`: it bought for the
  global `inspected` instead of the `tower` it is handed and reads from on the
  line above. Callers that had set the global got away with it; the two that had
  not indexed with −1 and handed `buyUpgrade` an `undefined` tower.
  `buyUpgrade(tower, id)` never consults `inspected`, so the indirection bought
  nothing.

**2026-08-18 — The title screen becomes one command deck instead of a vertical
button stack between two unrelated props.**

The left-side defense tower and right-side orbital relay now aim and connect
into the controls between them. PLAY grows into the dominant 480×88 command;
Armoury, Index and Sandbox become a smaller horizontal rail beneath it, while
their existing click rectangles and keyboard shortcuts remain the source of
truth. The menu now uses cyan and gold as its only accent hues, pushes the dark
grid behind recessed panels, and adds static scanlines/data-stream ticks. Its
only ambient motion is a restrained opacity pulse around PLAY, so the screen
feels active without moving any control or hit target.

**2026-08-18 — The Shieldbearer is the Auroris beacon, standing upright; it
throws a bowed cord and a stream of plates at every body it shields, and a
shielded body now wears a clear blue bubble.**

At the owner's instruction, four things in one job: the beacon model ("make the
beacon stand upright"), "a clear curve towards each enemy he shields", "an
animation of the shields going out to that enemy", and "shielded enemies will
have a blue clear bubble around them".

**THE FILE IS Z-UP, AND THAT IS WHY IT ARRIVED LYING DOWN.** Every import before
this obeyed the glTF Y-up convention and `glb_to_model.py` had the remap wired
in as a fact rather than as a choice. `Auroris_Shield_Beacon.glb` is authored
with its base on z = 0 and its antenna tip at z = 5.35, so that remap tips a
five-metre spire onto its side. A rig now declares `source_up`, because the
convention belongs to the FILE and a rig is written against one file's
hierarchy; the z-up map is the identity, which is a rotation of determinant +1
like the other, so neither can flip a winding and put the back-face cull on the
wrong side of the mesh. `fit_axis` stays in source coordinates for both — 1 for
a y-up file, 2 for a z-up one — because it answers "which axis of THIS FILE is
the body measured along".

**A BEACON HAS NO LEGS, SO THE TYPE GAINS A `hover` BLOCK.** This is the
Healer's argument applied to a second body rather than a new one: a cycle is
driven by DISTANCE for a body with a foot on the road, and a legless body left
on the tarmac would skate — `check-gait-slip.js` grades a group planted in every
frame while the body advances as a full cycle of slip, **A = 37.0 px at this
type's scale**, which would have been the worst figure in the library. `hover`
hands the cycle a clock instead (0.18 Hz, one broadcast every five and a half
seconds) and lifts the body 0.55 radii — 8.2 px, a plinth floating clear of the
road, not the Wisp's 3.45 radii of air. **It is a height, not a targeting rule**:
every ground tower can still shoot a Shieldbearer. The gate is told, in the same
`HOVERS` table the Wisp and the Healer are in, and reports it as clock-driven.

**THE SILHOUETTE HEIGHT IS UNCHANGED, AND THE IMPORT HEIGHT IS WHAT PAYS FOR THE
LIFT.** The Tender it replaces stood 1.593 u — 68.4 board px, the tallest body
in the enemy roster. The beacon is imported at **1.40 u** so that
1.40 × 31.8032 × 1.35 + 8.2 = 68.3 px: the wave reads the same size of thing at
the back of it, and the hover is bought out of the model rather than added on
top of it. `check-model-top` reports **10.0 px of margin**, exactly.

**SIX GROUPS, AND THE STRUCTURE IS ONE OF THEM.** The base, the spire, the
guards, the fins and the antenna have no more reason to move than a tower's
plinth does; what moves is what the beacon is DOING. The crystal breathes and
turns, the focus rings counter-turn, the two broadcast arcs orbit the spire, and
the two halos are **separate groups for one reason: phase**. They are the same
gesture — a ring emitted low, rising and growing as it goes — and one ring doing
it alone reads as a hoop on a stick, so they run half a cycle apart. A rising
ring has to start again at the bottom, which is a discontinuity; it is hidden
the way a broadcast hides it, by scaling the ring to nearly nothing at both ends
of its travel. Nothing jumps because nothing visible is there to jump.

**FOUR LAMPS, ALL TOO HOT, RETUNED THE HEALER'S WAY.** The source emits at 2.25,
3.5, 5.0 and 8.0, and `GLModels.expand` spends emission as a resting floor of
min(1, e × 0.16) added to every LINEAR channel — a floor that is WHITE. Those
four arrive as floors of 0.36, 0.56, 0.80 and 1.00; the last is not a hot cyan,
it is the colour white. Colours unchanged, heats retuned: every rgb in
`BEACON_TINT` is the material's own `emissiveFactor` copied verbatim and the
fourth number is the entire edit. The ladder is what carries the read at 60 px —
the hotspot brightest because it is smallest, then the crystal, then the shield
field, and the channels dimmest because their lit area is the largest on the
body and an area that big at a lamp's heat stops being a detail.

**THE SECOND TIME THE SAME TRAP HAS BEEN HEADED OFF.** `export_mesh.py` built
the four-legged Tender into `enemy-shieldbearer.js`, which is now an import's
output. That row is removed, exactly as `enemy-fast`'s was: left in, a plain
`--only=enemy-` would quietly overwrite the beacon with the Tender and nothing
downstream would complain, because the filename, the registered id and the model
contract are identical either way. `enemy_tender.py` is KEPT — it is the
chassis's four-legged worked example and `enemy_dray.py` measures against it.

**THE CORD IS BOWED, AND THAT IS NOT A FLOURISH.** The Healer throws three
straight cords at the three most wounded and a straight line is right for it: it
AIMS. The Shieldbearer hands 20 points to ten bodies at once, and ten straight
lines out of one body is a star — they overlap near the source and there is no
reading which went where. A bow separates them and says the right thing about
the gesture: a plate of shield is lobbed across, not fired. `arc` is a fraction
of the SPAN, so a close target gets a small bow and a distant one a big one; a
constant height is invisible on the first and a rainbow on the second. The bow
is computed in the WORLD and projected per point, not bent in screen space,
which is what keeps it draped over the terrain and correct through an orbit.
Both boards read `arc` and `chips` off the same type row, so the flat fallback
makes the same claim as the 3D board and neither renderer holds a second copy.

**AND IT IS NOT DRAWN WITH `beam`, FOR TWO REASONS.** A curve through that
helper is fourteen calls, three strokes each, ten cords a pulse — 420 strokes a
frame for one enemy's ability, against three for a single path stroked three
times. And `beam`'s 0.95 white core is right for a shot and wrong for this: what
travels here is a SHIELD, and a white-hot cord reads as the beacon firing at the
bodies it is helping. The core stays at half the alpha, because a thin blue line
on a blue-grey road needs something down the middle of it to be seen at all.

**THE BUBBLE IS GEOMETRY, WHICH IS THE ONLY REASON IT CAN EXIST.** Clause 2 of
the model contract settles it: a translucent disc painted on the canvas is
visible THROUGH the bodies in front of it, which is what "looks like a sticker"
means. A real shell is occluded by what stands between it and the camera and by
the body inside it, which is what makes it read as a shell around a thing rather
than a wash over one. It is convex and closed, so with back faces culled exactly
one surface covers any pixel — the double-blend that forced the camo bodies into
a depth pre-pass cannot happen here, by the shape rather than by a tolerance.
Drawn after the wrecks and sorted far-to-near, because ten of them at once is
precisely what a pulse produces and depth writes are off while blending.

**SIZED FROM THE MODEL, AND "CLEAR" IS A CEILING.** A bubble has to contain the
body and the bodies are not the same shape — the beacon is 4.05 radii tall
inside 1.3 of plan, the Fractal Slime 2.6 inside 2.0 — so both radii are
measured off each model's own rest-frame geometry once and cached with the other
per-type primitives. The first build read as a frosted egg at 0.64 alpha on a
fresh grant; the shipped numbers total at most 0.42 and sit at 0.22 for a shield
merely holding. **The 2D board keeps its four panels**: that renderer tried a
complete bubble and rejected it (a full ring stack buried the model, especially
on a crowd of Swarm), and with no depth buffer and no real alpha the panels are
what that constraint produces. This board has both, so it draws the thing that
was asked for.

**MEASURED, NOT EYEBALLED.** A dark body inside a big shell is exactly the case
where a screenshot proves nothing, so the bubble was read off the framebuffer:
per-body boxes, one frame with the shields on and a control frame with every
shield set to zero, differenced. All three bodies on the stage changed pixels —
14.8% of the beacon's box, 15.3% of the Normal's, **8.5% of the Brute's**, which
is the one that had looked absent. The flat fallback was exercised on purpose
too (`World3D.isEnabled` stubbed false, a live pulse, two frames drawn): no
exception on the path `index.html` uses when WebGL is unavailable.

**AND A TEST THAT RECORDED THE OLD DESIGN WAS REPOINTED, NOT DELETED.** The
Healer's tether test asserted "the Shieldbearer authors no cord" to hold the
rule that a cord belongs to the SPEC and not to supporting. The rule is
untouched; the example expired. It now runs on the Vanguard, which shields
ITSELF and so authors none — a cord from a body to its own chest would be a line
of length zero — and the Shieldbearer got a test of its own.

**2026-08-18 — The Fractal Slime is a body at last, and it JUMPS. `td_mesh`
learns a uniform scale; the sandbox grows a one-click tier ladder; and
`fractal-slime.glb` turns out to be a sphere.**

At the owner's instruction: implement the slime model, "it moves by jumping
forward", and let the sandbox spawn every tier, each bigger than the last.
`tools/blender/enemy_slime.py` builds `enemy-fractal_slime.js` — 1 192
triangles, 6 colours, 32 frames, three groups — and it is the FIRST enemy
authored through `td_mesh` rather than through Blender or an import. The type
had drawn `gl-world`'s fallback sphere since it was added.

**THE .glb IS A UNIT SPHERE, AND THAT IS A MEASUREMENT.** `glb/
fractal-slime.glb` sits beside the six real imports and is not the source of
this body: 253 500 vertices, 84 500 triangles, one primitive, **zero
materials**, and every vertex 1.000000 from the origin (min radius
0.9999999594, max 1.0000000430). Whatever displaced it into a slime lived in
the authoring tool's shader graph and did not survive the export, and this
pipeline has no texture path to bring it back. Imported it would ship the same
ball the fallback already draws, at 84 500 triangles instead of nothing. The
standing rule — a `.glb` import and a Blender target must never name the same
output, because whichever ran last wins silently — now has a second body it
applies to, and `enemy_slime.py`'s header carries the numbers so nobody
re-derives them.

**THE HOP IS SOLVED, NOT TUNED, AND THE FOOT IS THE WHOLE ANIMAL.**
`gl-world.js` advances a frame by DISTANCE — one cycle per 0.899281 model units
of travel, at every size and speed — so a planted foot must go backward by
exactly that much or it skates. This body has no feet, so while it is on the
road the whole of it must be motionless in world space and every unit the cycle
owes is paid back in the air. That fixes the numbers rather than leaving them
to taste: the ground phase is **13 of 32 frames**, so the horizontal excursion
is not an amplitude anyone chose, it is ±0.899281 × 6/32 = **±0.1686 u**, and
the only lever on it is the duty. Both halves of the relative x are straight
lines, because a body at rest and a body in free flight both hold a constant
horizontal velocity; the arc is `4·APEX·u(1−u)`, because that is what gravity
draws. `check-gait-slip.js` reads **A = 0.000 px on both weight-bearing groups**
across a 13-frame plant that wraps the seam, and **B = 2.145 px** at the T5
scale — better than every eight-frame walker on the board.

**SQUASH AND STRETCH WITHOUT A NON-UNIFORM SCALE.** The obvious 1.15/0.80 on z
is not available: the vertex shader transforms normals with `mat3(uModel) *
aNrm` and no inverse-transpose (`gl-renderer.js:46-49`), which is exact for a
rotation or a uniform scale and wrong for a squash — a normal scaled by S
instead of S⁻¹ tilts, about twenty degrees on a 45° face at that ratio, and it
would ship silently because the silhouette is right. So `td_mesh.trs` now
carries a **uniform** scale and `Node.set_scale` REFUSES a non-uniform one, and
the squash is built out of parts that move against each other: `slime_body`
shrinks on impact while `slime_hem` — the puddle it stands in — spreads, both
pivoting on the ground contact point, with `slime_core` sinking into the gel as
the follow-through. Measured off the real framebuffer at T5, side-on: the body
is **35.1 px tall at the impact frame and 51.4 px at toe-off**.

**A BODY THAT LEAVES THE GROUND BREAKS CLAUSE 3b's RECIPE, AND THE CLAUSE
SURVIVES IT.** `model.top` is the largest RAW z in stored geometry and
`crownOf` hangs the health bar 10 px above it; the clause's recipe — animated
root at z = 0, identity at frame 1 — is written for a body that never rises
above its rest pose, and this one rises 0.2025 u twice a second. Followed
literally the bar would be swallowed at every apex: 6.4 px inside a T1, 15.5
inside a T5, with **nothing reporting it**, because the bare enemy run of
`check-model-top` reads the rest frame. Each group is therefore a PAIR of nodes
— an animation node that is identity at frame 0, and the exported group as a
fixed child at z = −RISE — so the stored geometry is the world geometry lifted
by RISE while the drawn pose stays exactly what was authored. RISE is
*measured* (`_solve_rise` poses every frame and takes the highest vertex), so
the gate reports a margin of **exactly 10.0 px at every tier scale**. The cost,
stated because a clean gate is not the same as no cost: at rest the bar floats
RISE above the crown, and `bodyTopOf` — the Siphon's occluder capsule — is that
much too tall.

**AND THE GATES WERE GRADING THE SMALLEST BODY ON THE LADDER.** A fractal's
`sizeScale` row is 1 and no instance is ever drawn at it: every body carries
`fractalSizeScale = 0.65 + 0.35·tier` on top, so a T5 draws at **2.40**. Both
instruments multiply every figure by the scale, so both would have under-
reported a real miss by 2.4× on the tier the player meets at wave 25.
`check-gait-slip.js` gets a `SIZE_SCALE` entry at the worst tier (the
Revenant-variant argument, pointed at a different mechanism);
`check-model-top.js` now DERIVES it from the same three fields the game reads
(`minSizeScale`, `sizeStep`, `maxTier`) rather than being told. No other row in
either table moved.

**THE TIER IS THE SIZE, AND IN 3D IT IS THE ONLY TELL.** The 2D board prints
"T3" inside the disc; that text cannot exist here — colour is per face, there is
no texture path, and at 20 px a glyph is not resolvable as geometry either. It
is not a regression, because the 3D board has never drawn the 2D body, but it
does mean size carries the whole tier read. Hence the **four buds** around the
base: four children, on the body that divides into four.

**THE SANDBOX GETS THE LADDER IT WAS MISSING.** Picking the type, picking a
tier, spawning and clearing — six times over — is the workbench making a hard
thing hard, when what a size ladder has to be is looked at SIDE BY SIDE. Six
tier buttons plus **Ladder**, built from the type's own `fractal` block so a
seventh tier arrives as a seventh button with nothing edited, and derived from
"the row that carries a `fractal` block" rather than from a typed id. They do
not touch the dropdowns above them — a button that silently rewrote those would
leave the controls disagreeing with the board. Spacing is taken off the bodies'
own radii, because a T5 is drawn at 26.4 px and a T0 at 7.15 and any single gap
is either an overlap or a hike. `sandbox.smoke.js` reads the ladder back: six
bodies, each strictly wider and four times the health of the one below.

**HOW THE PICTURE WAS VERIFIED, INCLUDING THE TWO READINGS THAT WERE WRONG.**
`readPixels` on the real board, one T3 stepped through one cycle by progress.
The first two sweeps produced plausible curves and both were confounded: the
camera never moved, because `OrbitCamera` caches its view-projection on `_eye`
and `_eye` is only rebuilt by `_recomputeBasis()` — writing `.yaw`/`.pitch` by
hand does nothing. With the road running away from the camera, advancing along
it changed the body's DEPTH, and an oblique camera turns depth into screen y.
Fixed by looking ACROSS the road, so travel is purely horizontal and the only
thing that can move the body up the screen is the jump; a third of the frames
then read zero pixels, which is **not drawn** rather than **not lifted**, and
was excluded by name rather than averaged in. The clean sweep: a symmetric
parabola over the 19 airborne frames peaking at **9.74 board px against 10.81
authored** at the designed apex frame, flat across the plant, with a control
run at zero enemies confirming nothing else on the board is green.

**2026-08-18 — The Healer is a spectral apparition that floats over the road and
throws cyan cords at what it heals. `glb_to_model.py` grows a rig with no legs,
and hovering is separated from flying.**

At the owner's instruction: `spectral-healer.glb` is the wave-32 Healer — it
drew a green sphere before this — it "should shoot cyan/spectral tethers to heal
units", and it "should float slightly over the ground to walk the path."
Imported at `--rig spectre --frames 16 --cell 0.09 --exclude aura_shroud`:
5426 triangles from 36 768, 6 colours, **seven groups** — the core, two rings
turning against each other, six shards in orbit, a skirt of tails, a crown of
plumes and a bundle of tendrils. `check-model-top.js` reads **ok, 9.7 px of
margin** at 64.9 px tall, which puts it a shade under the Shieldbearer it is the
opposite of.

**A RIG NEED NOT BE A GAIT.** The three rigs before this are all variations on
one hard constraint — a planted foot travels back exactly the stride the body
travels forward, or it skates — and this body plants nothing. What replaces the
solve is a clock, and that is the SECOND case of the flier's exemption rather
than a new one: `gl-world.js::clockRate` is now the one list of bodies the
distance rule does not apply to, and it holds exactly two entries (`isFlying`,
or a `hover` block on the type). Everything in `drift_cycle` is a whole number
of turns or a sine of the cycle, because the caller loops the list and a term
that ends anywhere but where it started is a visible jump once per cycle
forever. Every joint is measured off the group's own points: a thing that spins
turns about its centroid, a thing that hangs swings from its top, a thing that
rises bends at its base.

**AND THE INSTRUMENT HAD TO BE TOLD.** `tools/check-gait-slip.js` graded the
new body as a walker and reported **12.5 px of slip on its skirt** — the
second-worst reading in the library, for a cycle doing exactly what it is
supposed to do. Registering it in `HOVERS` (the table that already carried the
Wisp) is the fix, and the lesson is that the failure was not a missing check but
a WRONG one, delivered in the same table of numbers as every real one.

**A TRANSLUCENT PART IMPORTS AS AN OPAQUE ONE.** A palette entry is
`[r, g, b, emission]`; there is no alpha in the format at all. The source
authors an `aura_shroud` at alpha 0.35 — a 0.9 u envelope around a 0.5 u core —
which arrives as a shell with the entire lantern sealed inside it. Dropped with
`--exclude`, the same mechanism and the same argument as the undead zombie's
`grave_ground`: a decision about the source belongs on the command line and in
the run's output, not buried in a rig. Two tint entries follow from the same
gap: `core_inner` emits flat white, which is correct seen THROUGH a cyan crystal
and is a white dot in the middle of a cyan body once that crystal is opaque, and
`core_crystal` arrives at `emissiveStrength: 2.6` — a floor of 0.42 of white
under everything. Both are given the crystal's own hue at a heat that keeps it.

**HOVERING IS A HEIGHT; FLYING IS A TARGETING RULE.** The float is a `hover`
block on the type and it is cosmetic in full — the Healer is a ground target,
every tower can shoot it, and killing it first is the lesson of wave 32.
`isFlying` is the other thing entirely, and a Healer that had quietly picked up
the Wisp's immunity from ground fire is a defect **nothing on screen would
show**, which is why there is a test asserting `Targeting.sees` both ways.
`Enemy.prototype.visualBodyLift` now answers three heights instead of two and is
still the only place any of them becomes a number; `gl-world.js::flightLift` is
renamed `bodyLift` because it stopped being about flight, and the health bar,
the hover card, the falling wreck and a shot leading its target all follow it
without an edit.

**THE CORD BELONGS TO THE PULSE, NOT TO SUPPORTING.** `support.tether` is
authored data — 1.4 s, `rgb(142, 232, 255)` — so the Shieldbearer, which runs on
the same machinery, keeps its expanding ring and throws nothing. The two cues
answer different questions: a ring says "a lot of bodies at once", which is
right for ten stacking shields from a body standing among them, and a cord says
**which three**, which is the only mark that can name three of a wave of twenty
and is therefore the mark that says what to shoot. It runs 1.4 s against a heal
of 4 because the cord is the DELIVERY and the target's own green ring is the
effect — nine cords standing across a board carrying three Healers would stop
naming anything. `supportLinks` is the one place `js/enemy.js` holds a reference
to another enemy, and it holds the enemy rather than a fixed point (which is
what `attackBeam` does) because a tower cannot move and a healed body is still
walking; the sweep drops a cord the instant its target is dead or leaked.

**VERIFIED ON THE REAL BOARD**, not only in the suites: the sandbox at
`--rig spectre`'s shipped file, a Healer beside a Shieldbearer, a Revenant and a
Brute for scale, and a pulse driven into three wounded bodies. Two new tests in
`content.test.js` cover the cord's lifetime, its sweep on a dead target, the
Shieldbearer throwing none, the three lift heights and the targeting assertion.

**2026-08-18 — The game makes a sound. Eight of them, synthesized, and "Sound"
comes off the out-of-scope list the way every other entry has.**

At the owner's instruction, and against a full specification: eight effects with
their frequencies, envelopes and durations named, the events to hook them to, a
Web-Audio-only constraint, and a volume/mute panel to put on screen. "Sound" had
been the second entry under "Deliberately out of scope" since that list was
written; this is the explicit ask it was waiting for. It does not generalise —
**music is still out of scope**, and the mixer's music fader exists because the
brief asked for the balance control, with nothing feeding that bus.

**NO NEW FILES, WHICH IS WHY THIS LIVES IN `game.js`.** The project's own
convention would put it in a `js/audio.js` beside `js/effects.js`; the ask was
explicit that everything go into the existing files, so `SoundSynthesizer`, the
audio panel and `fireKindOf` are two marked sections at the end of `game.js`.
`index.html` needed no edit at all — it already loads `game.js` — and the split,
if anyone wants it later, is those two sections plus one `<script>` line in
**both** `index.html` and `sandbox.html`.

**IT IS `effects.js`'s RULE, APPLIED TO A SECOND SENSE.** The simulation tells
it; nothing reads back. Every call site is guarded, every method no-ops without
an `AudioContext`, and `Math.random()` is used here for the same reason it is
allowed there — it picks a pitch and dies. This is not decoration: the harness
boots `game.js` in **Node**, where `window.AudioContext` does not exist, and a
constructor or a play call that could throw would take all six suites with it.

**THE HOOKS ARE AT DOORS, NOT AT CALLERS.** Three of them are the whole reason
this integration is small:

- **The hit sound is in `Enemy.prototype.takeDamage`** — the one line of audio
  outside `game.js`. That function is the single door every damage source in
  the game comes through, the same property that makes mitigation global; a
  hook at each of the dozen things that swing would have been a dozen chances
  to forget one. A killing blow is silent there, because the death explosion
  fires from the end-of-life sweep a moment later and the two ran together.
- **The shot sound has no line in any of the five tower files.** `update()`
  records `bullets.length` before the tower loop and plays one shot if the
  array grew. A projectile appearing in that array IS a tower firing, and it is
  the only definition all five types already agree on. The Siphon and the
  Summoner spawn no bullets and are correctly silent: neither of them fires.
- **The death sound sits beside `Effects.enemyKilled`**, in the sweep that is
  already the one place an enemy's fate is decided exactly once.

**WHAT THE RATE LIMITS ARE ACTUALLY FOR.** A beam tower deals damage every
step, so an unthrottled hit sound is sixty impacts a second and the game buzzes;
45 ms turns a rifleman's burst into three hits and a beam into a texture. They
are measured in AudioContext seconds — REAL time — because the speed toggle
means game time runs at up to 3× (20× in the sandbox) and a limit in game time
would stop limiting exactly when it was needed. Deaths are the exception and
deliberately so: up to **three stack** inside 90 ms, each quieter and detuned,
because a wave clearing is several bodies dying in one step and a rate limit
would report that as one kill.

**MEASURED, NOT LISTENED TO.** Verified by driving the real game in a browser
and reading the result back through an `AnalyserNode` tapped on the master
output, which is this project's rule for anything presentational. Silence
measures exactly 0. Each sound peaks between 0.14 (`playTowerFire`, the quietest
by design) and 0.56 (`playTowerPlace`). The first pass mixed badly and the
numbers said so: the wave swell peaked at 0.25 against a 0.60 placement clink,
the loss at 0.25, and the klaxon carried the highest sustained level in the
game at 0.146 RMS. Rebalanced to 0.44 / 0.50 / 0.091. **Worst case — a swell,
the alarm, twelve deaths, twelve hits, eight shots, a placement and the loss all
in one step — peaks at 0.70 with the voice cap holding at exactly 28**, so the
compressor and the `tanh` waveshaper ahead of the master fader do their job
without anything clipping. The event hooks were checked the same way, by
counting calls through a real `update()`: 57 kills produced 57 death sounds and
not one more, and the loss sound fired **once** and stayed at once through ten
further seconds of stepping.

**THE LOW-HEALTH WARNING IS A SOUND AND A LIGHT, AND THE LIGHT IS NOT A
FALLBACK.** The base HP readout has been red below a quarter for a long time;
it now PULSES, off the same latch that fires the klaxon, always, whether or not
the game is muted. An alert that exists only as a sound is an alert half the
audience never receives. Two details are load-bearing: the threshold has
hysteresis (arms at 25%, disarms above 32%) because base HP is a free counter
that the Siphon's lifesteal pushes back up, and a base hovering on one line
would otherwise chatter; and the whole thing is skipped once the run is over,
because a base that fell from healthy to zero in a single blow armed the latch
on the very step it died and fired the klaxon directly on top of the loss.

**The mixer is drawn on the canvas**, not as DOM over it. The canvas is
letterboxed and scaled by CSS, so a DOM slider would need its own copy of that
mapping to stay where it was put, while `toGameCoords` already solves it for
everything drawn here. It sits in the bottom-right chrome row for the reason
stated at `speedButtonRect` — the one region of the viewport nothing else
claims — at a position fixed relative to the speed button, so it does not close
up when the wave controls vanish at the end of the schedule. A control that
moves is a control the player has to find again. Opening it does not pause the
run, which the brief asked for and which is also the only way to balance a mix
against what you are listening to.

`M` mutes, **on the board only**. `m` already means "choose another route" on
the game-over overlay, and one letter that did two things depending on whether
you had just lost is a key nobody would trust.

**No regressions.** All six suites re-run: `run.js` 107/0, `content.test.js`
206/6, `long-range-dps` 72/0, `beam` 45/0, `blub` 53/0, `sandbox.smoke` passed.
**The content line is 206/6 at `dc165fc` as well** — checked in a clean
worktree at HEAD before concluding anything, because the totals in `AGENTS.md`
still record the 207/5 measured at `6ec794a` and a total is not a diff. The
sixth failure is "a tower out of reach is safe, and the swing lands the moment
one is not", it predates this change, and diffing the failure NAMES is what
established that rather than the count.

**2026-08-18 — The Midboss is a four-legged salvage walker. `glb_to_model.py`
grows a walker rig, and a stride stops meaning a step.**

At the owner's instruction: `midboss.glb` is the wave-11 Harvester, with the
walk described in the request — a deliberate mechanical gait, legs cycling
independently, the body lurching ahead and rocking side to side, arms that do
not swing but twitch as if sensing the path. It drew a pink sphere before this.
Imported at `--rig walker --frames 32 --cell 0.07 --floor 100 --glow sum`:
7090 triangles from 14 732, 10 colours, **eight groups** (four legs, two arms,
the turret, the chassis) — one more matrix per body than any other enemy, and
affordable for one reason: **one Harvester walks in, alone, once a run.**

**A CYCLE IS ONE STRIDE, BUT A STRIDE NEED NOT BE ONE STEP**, and that is the
substantive half of this change. Every earlier body plants each foot once per
0.899281 u of road; nothing in the format requires it, and it cannot work here.
A planted foot travels back exactly the share of the stride it is down for, so
one plant at 60 % duty asked this machine's 0.408 u leg for a **0.539 u sweep**:
83°, the front claw **digging 0.156 u through the road** at one end of it and
the chassis **jacking 0.136 u into the air** at the other — measured, on the
first build, and visible as a rig tearing itself apart. `MARCH_STEPS = 2` halves
every one of those and leaves the solver untouched: `solve_hip_angles` takes
`CYCLE_UNITS / MARCH_STEPS` and answers the same question it always answers.
`node tools/check-gait-slip.js` reads **A = 0.001 px on all four claws**, two
plants each, against 0.000 for the hound and 4.192 for the Brute.

**THE GAIT IS AN AMBLE, AND THAT IS WHAT MAKES THE ROCK REAL.** The request
pairs "the front pair extends forward and plants, then the rear legs drag and
reset" with "the body rocks side-to-side as weight shifts between leg pairs",
and the first reading of the first sentence makes the second impossible:
**with four legs paired front-to-rear, one foot is down on each side on every
frame at every duty**, the support is balanced left to right always, and
`support_roll` correctly derives no roll at all. The lateral sequence — front
left, rear left, front right, rear right — is the same sentence per SIDE, and it
is the one that puts both left claws down together and then both right ones.
That is the weight shifting, it is why an ambling elephant rolls, and the roll
is read off the support count rather than run off a sine, so it can never lean
the machine onto a claw that is in the air. Measured on the shipped frames:
±5.0°, 7.2 px between the extremes on a body 82 px wide. At `MARCH_DUTY = 0.6`
the support alternates **3-3-3-3-2-2-2-2**: never fewer than two claws down,
usually three, which is "inexorable" bought rather than asserted.

**A SOLVE CENTRED UNDER THE HIP COLLAPSES A SPLAYED STANCE**, and the
instrument is what caught it. `check-gait-slip.js` read nine-frame plants on two
of the four legs against ten authored, which is the signature of a rigid foot
rolling onto a different claw — and the cause was that `solve_hip_angles` puts
the sole directly beneath the hip at mid-plant. That is right for every body
whose leg hangs straight down (0.012 u of difference on the zombie) and wrong
for this one: its claws are authored 0.19 u ahead of and behind their own
shoulders, so the solve was rotating the front legs **27° back and the rear legs
27° forward on every frame of every plant** — the artist's splayed stance
collapsed into a machine standing on four legs tucked under it, and jacked 6 px
into the air to reach the road from there. `about_rest=True` centres the sweep
on the pose in the file. All four legs now read their full ten frames, the
chassis sits at its authored height, and `check-model-top.js`'s margin goes from
3.1 px to 8.4 px. It is opt-in, because it spends reach on the splay it
preserves (`|cx| + anchor <= R`), and the other three rigs do not want it.

**THE CHASSIS RIDES DOWN ON ITS OWN LEGS**, which addresses a defect the biped
and the quadruped both carry. A rigid leg does not hold its shoulder at a
constant height above its own claw through a sweep, and `plant_leg` spends the
difference by translating the LEG — the foot stays honest and the leg slides
through a socket that has not moved, here by 0.171 u (9.8 px) on a shoulder ball
6.9 px across, because a foot 0.255 u long rolling through a 41° plant lifts one
end of itself nearly as far as the leg above it is tall. `stance_drop` gives the
body the mean of what its planted legs ask for. **On this gait that mean is
nearly nothing** — front and rear legs roll in opposite directions, so the body
bobs 2.1 px and each socket keeps the whole of its own leg's roll: **0.091 u,
5.2 px**, spent upward as often as downward, under the chassis skirt. That is
the largest approximation in the rig and it is written down rather than left to
be found. **The real fix is a two-link leg with a knee** — 12 groups and an IK
solve no shipped rig needs, and the right next change if this body ever has to
bear scrutiny at a larger size.

**THE ARMS AND THE TURRET RUN ON A DIFFERENT CLOCK FROM THE LEGS.** The walk
repeats twice across the frame list; the arms twitch and the turret scans ONCE.
A twitch that recurs every half stride on the beat of the legs is not sensing,
it is more walking. Each arm holds its authored pose, then snaps to an offset
over two frames, holds four, and snaps back — **linear ramps, not eases**,
because a repositioning actuator travels at one speed and stops dead. The two
arms never move together: one moving alone is a machine checking something.

**A RIG MAY NOW PLACE A PART BY WHERE IT IS.** This source names all four legs
`leg` and both arms `manipulator_arm`, so the hierarchy says which KIND of limb
a mesh is on and only the geometry says which one. `build` centres the body in
plan BEFORE calling `group_of` so a sign test means something; the reordering
changes no geometry, and **all four earlier imports were re-derived and are
byte-identical** across it and across the `cycle_units` parameter. Pivots are
measured from the END SLICE of a group rather than its centroid — a splayed
leg's centroid sits 0.138 u outboard of the ball it hangs from, and turning it
about that swings the ball itself 0.083 u (4.8 px) out of its socket.

**The lens is repainted to the type's own magenta** (`MIDBOSS_TINT`, e = 0.85).
One emissive material on the whole body, arriving orange-red, on the one type
that puts a NAMED HEALTH BANNER across the top of the screen: "the pink bar
belongs to the pink-eyed thing on the road" is a connection the player makes
once, at a glance, and an orange eye does not offer it. This is the firefly's
case, not the hound's. The nine unlit materials arrive as authored.

Fitted to **1.19 u**, the same height the bipeds stand — 68 px tall and 82 px
wide at its own `sizeScale` of 1.8, against the wave-35 Tyrant's 82 tall and 70
wide. The widest thing that walks the road and still not the tallest, which is
the right way round for a body that arrives twenty-four waves before the boss.
`check-model-top.js` reads **ok, 8.4 px of margin**; `plan/ring` is **235 %**,
the highest in the roster (the Brute is 203 %), because the ring's 4 px pad is
absolute and this body is wide. Tagged on all three pages, so
`check-model-tags.js` and `check-script-manifest.js` both stay clean. The one
`content.test.js` name `ci-check.js` flags predates this change and fails
identically with the model file removed.

**2026-08-17 — The Fast type is a robot hound that gallops. `glb_to_model.py`
grows a quadruped rig, and the Blender exporter gives up the file it no longer
owns.**

At the owner's instruction: `robo-hound.glb` is the Fast enemy, running on all
four limbs. It replaces the Skimmer mech, which is the first time an import has
taken over a body this repo had already built — and that, not the animation, is
where the danger in this change was.

**`export_mesh.py` no longer lists `enemy-fast`, and removing that row is the
load-bearing half of the commit.** The Skimmer built `enemy-fast.js` from
`enemy_skimmer.py`; the importer now writes the same filename with the same
registered id under the same model contract. Left as it was, a plain
`--only=enemy-` — which is every batch run of that file — would have rewritten
the hound as the mech, and **nothing anywhere would have reported it**: no
check, no manifest, no test looks at which body a file contains. The only
symptom is the wrong animal on the road. `enemy_skimmer.py` is kept, because
`enemy_courier.py` and `enemy_vanguard.py` both measure against its chest, but
it no longer owns a shipped file. The general rule went into `AGENTS.md`: an
import and a Blender target must never name the same output.

**A GAIT IS FOUR PLANT WINDOWS AND NOTHING ELSE**, which is why `run_cycle`
shares `leg_series` with the walker instead of owning a second solver. A walk
and a gallop differ in which frames a foot is down; the leg's own question —
what hip angle puts this sole where distance-driven frames require it — has the
same answer either way. `node tools/check-gait-slip.js` reads **A = 0.000 px on
all four paws** at **25 % duty each**, against 0.280 for the mech it replaces;
**B falls from 3.575 px to 1.788 px** because the cycle is 16 frames rather than
8, which is worth spending on the fastest body on the board.

**THE DUTY IS THE GAIT, AND 0.44 WAS A FAST WALK.** The first version held each
paw down for 0.44 of the cycle, which sounds like a run and is not one: the four
windows overlapped end to end, every frame had something on the road, and the
owner read it exactly as what it was. At 0.25 the windows (16 frames: 0–3, 2–5,
7–10, 9–12) leave **frame 6 and frames 13–15 with nothing planted at all** — the
gathered suspension after the hinds push off and the extended one after the
fores. A quarter of the cycle in flight is the whole difference between the two
gaits to the eye.

**A SHORT CONTACT COSTS REACH, AND THIS IS THE TRAP IN SHORTENING ONE.** The
plant sweep is not a style choice — it is exactly the ground the body covers
while that paw is down — so quartering the contact quarters the leg's arc, and
the "gallop" would have swung its legs *less* than the walk it replaced.
`leg_series` grew `swing_reach`: a forward overshoot of 0.85 of the plant's own
sweep, peaking at mid-swing and zero at both ends, so it cannot move a touchdown
or a liftoff angle and is spent entirely on frames no instrument grades. A paw
in the air has nothing to slip against.

**THE BODY IS DRIVEN BY THE SAME WINDOWS AS THE LEGS.** `airborne_lift` reads
the gait, finds the runs of frames with nothing on the road, and eases a rise
over each — zero at both ends, so the chest is back at resting height on the
exact frame a paw lands, and the two suspensions each get the rise their own
length earns. `fore_centre` phases the pitch off the forehand's landing rather
than off frame 0, once per cycle (twice is a trot's rhythm): nose down under the
fore pair, nose up as the hinds drive. Neither is a sine of its own, and that is
the point — retune a phase and the body follows instead of holding its old
timing and cresting with a paw on the ground. Measured over the cycle, the chest
travels **0.434 u to 0.549 u**, 3.7 px of vertical at scale 1.

**A LEG FOLLOWS THE BODY'S RISE, AND NOT ITS PITCH**, which is the one judgement
call here with a number on both sides. Rise: non-zero only while nothing is
planted, so every leg is airborne on every frame it applies to and the animal
leaves the ground in one piece. Pitch: it moves each joint by up to 0.04 u, and
following that drags the paw which has just left the road back into it — with
the pitch followed a swinging paw sank to 0.004 u and `check-gait-slip.js` read
**2.946 px** on two of the four legs. Left out, the shoulder and haunch cowls
overlap their own thigh joints by ~1.25 px instead, which is geometry that was
already inside geometry. An invisible overlap beats a visible skim, and both
beat an instrument reporting this body as sliding.

`check-model-top.js` reads `ok` at 7.7 px of margin — the rise and the pitch
carry the posed crown 0.073 u above the rest pose, measured, not assumed — and
no vertex of any group on any frame goes below the road (lowest: −0.00000).

Three smaller decisions, all judgement:

**The rig declares its legs and a missing one is an error.** A source that
spelled a leg differently would otherwise have it swept into the body group and
drawn stiff — a body galloping on three, which survives a contact sheet and is
found on the board.

**`--emit-cap`, and it is a fact about the renderer rather than about this
model.** `uGlow` is 0 for everything except a flier, so at rest an emissive
material is entirely `GLModels.expand`'s floor of `min(1, e * 0.16)` added to
each linear channel. The hound arrives with strengths of 3.2, 2.4 and **5.0** —
a floor of 0.80 on all three channels — and the first import drew a black dog
with WHITE panels, verified on the real page before the rule was written down.
Capped at 1.55, which is what the mech's own brightest part used, so the hound
glows exactly as hard at rest as the body it replaces.

**The tint moved from the rig to the model name.** It was keyed on `--rig
firefly` when the Wisp was the only tinted import, and the file's own header
already named the hazard. A second tinted body makes it real — `--rig quadruped`
is a gait, and the next quadruped will not be lit like this one. The hound's
three emissive materials are retinted and the six unlit ones — carbon shell,
plating, gunmetal, joints, teeth, claws — arrive exactly as authored. Retinting
at all is not optional here: the eyes ship at `(255, 56, 0)`, which sits on top
of the `normal` type's red, so the fastest thing on the board would otherwise
have signalled itself in the commonest thing's colour.

**THE HOUND IS LAVA, AND LAVA IS THREE TEMPERATURES** (owner's call, replacing
the amber this first shipped with — that amber was the `fast` type's own
`color`, on the argument that a body should be lit in the colour of its codex
swatch, and it read as yellow, which is a lamp and not molten rock). The model
already carries the geometry for a gradient, so the three materials take three
heats rather than one colour three times: `ember_vent` is the ten cracks along
the spine and the rib, rear and cheek vents — **crust**, the deepest orange;
`ember_core` is the chest furnace, mouth, nose, brows, the four knee glows and
the six tail joints, everywhere the inside shows through a gap — hotter and
yellower for it; `ember_eye` is two triangles of white-hot, which is what keeps
the skull reading separately from the chest at 37 px.

**The heats are LOW, and that is what makes the colour saturated** — the
counterintuitive half, and the reason the numbers look wrong beside the source's
own 3.2 / 2.4 / 5.0. The resting floor `min(1, e * 0.16)` is added to every
linear channel **equally**, so it is white: raising the heat does not make a part
more orange, it drags all three channels toward 1 together, and the hottest
number available is also the whitest. Measured through the board's own lighting,
a key-lit face of each — crust `e=0.55` → **(254, 127, 93)**, furnace `e=0.90` →
**(254, 176, 117)**, eye `e=1.40` → **(254, 246, 165)**, against the amber's
**(254, 254, 167)** whose red and green were both pinned at 254. That is the
yellow, and no base colour fixes it at that heat.

So a tint entry may now carry a fourth number, the emission, and it beats
`--emit-cap` because it is a value chosen for one material rather than a ceiling
over all of them. It is applied where the tint colour is chosen and not earlier,
so it can only retune a material that already glows — a palette decision must
not be able to turn plating into a lamp. Three-element entries are unaffected,
which is why the Wisp still reproduces byte-identical. The cap stays on the
hound's command line as the backstop for any emissive material the tint does not
name. **What this gives up:** the type's swatch, hover card, kill burst and
minimap dot are all still amber, so the body no longer matches them exactly.
Orange against amber is a drift, not the firefly's outright miss; repainting
`js/enemy.js` is a decision about five pieces of 2D interface and not about this
mesh.

4771 triangles from 10 068 (53 % off at `--cell 0.045 --floor 100`, which
decimates the lathed joints and leaves the 88-triangle back plates alone),
inside the roster's range and close to the Revenant's 4410. The file is 349 KB
against the mech's 260 KB. **Both earlier imports reproduce byte-identical**
after the refactor — the firefly with defaults, and the humanoid walk checked
against a reference generated before `leg_series` was factored out. The one
failing name in `content.test.js` predates this change and fails identically
with the old model in place.

**2026-08-16 — The Revenant gets a body, and a second one for after it dies.
`glb_to_model.py` grows a humanoid rig with a SOLVED walk.**

At the owner's instruction: the Revenant walks in as `steampunk-zombie.glb` and
whatever gets back up is `undead-steampunk-zombie.glb`. It was drawing an
untextured sphere before this, because no `enemy-revenant` model existed.

**The swap is on `revived`, and the choice of field is the whole decision.**
`gl-world.js::enemyModel` now consults `ENEMY_VARIANT`, a table keyed by type
id. `rooted` and `revivesLeft` move at the same instant today and are not the
same claim: `rooted` is a movement fact any future snare could set on anything,
and `revivesLeft` counts DOWN, so a two-life type would swap on its first death
and have nothing left to say on its second. `revived` means exactly "this body
has been dead once", set only in `Enemy.prototype.tryRevive`. A missing variant
file falls back to the base mesh, never to the sphere.

**The .glb sources now live in `glb/` beside the game folder** — the two zombies
and `robotic-firefly.glb`, which is the Aether Wisp's source and had been
sitting untracked at the repo root since it was imported. They are the INPUTS to
`tools/glb_to_model.py`; nothing at runtime reads a .glb. That tool was itself
missing from this checkout and is restored in this change.

**A WALKER'S GAIT IS SOLVED, NOT TUNED**, which is the substantive half of the
importer work. `walk_cycle` inverts the hip rotation that puts the sole
centroid where distance-driven frames require it — `x(theta) = R cos(theta -
phi)`, closed form, one angle per plant frame — then re-plants the sole in z,
which is a translation along the leg and so cannot fight the rotation in x.
Same argument and the same 0.899281 as `tools/blender/gait_solve.py`, without
Blender. `node tools/check-gait-slip.js` reads **A = 0.000 px on both bodies**,
against 0.277 for `enemy-normal` and 4.192 for the Brute; only the two bosses
match it, and they buy it with 128 and 36 frames against these 12.

**Geometry is stored in WORLD space on this rig, not offset to each joint**, and
that fixes a real defect rather than dodging one. `GLModels.expand` derives
`model.top` — where the HEALTH BAR is drawn — from raw stored positions with no
group matrix applied, so a body stored relative to a joint halfway up itself
reports a top halfway up itself. `enemy-normal` reports 0.570 for a body that
stands 1.190 and draws its bar 9.7 px inside its own chest; Brute and Hive are
worse. Nothing forced the offset: a rotation about joint J is `T(J).R.T(-J)` on
world points just as well as `T(J).R` on offset ones. Both Revenants report
`ok` in `tools/check-model-top.js`. **The five bodies that were already buried
are untouched** — fixing them means moving a shipped health bar on the game's
most common enemy, which is its own change.

Two smaller decisions, both recorded because they are judgement and not
derivation. The undead source ships a `grave_ground` diorama base — a mound
floating at y 0.33 while the feet stand at 0, authored for a turntable — and it
is dropped by `--exclude`: left in it sets the plan extent at 2.3x the body's
own and paints a disc of earth into the air under every step. And the two bodies
import at ONE scale (`--span 2.1728`, the living one's measured height) rather
than each being fitted to 1.19, so the swap changes the creature and not its
size.

`--glow sum` is new and is NOT the default. `material_entry` took an emissive
material's colour from its emissive factor alone, which is right for the
firefly's near-black eye lens and exactly wrong for the zombie's `sick_eye`,
whose bright green base carries a dim emissive — that one ships a dark olive dot
where the artist painted a sick green eye. `sum` adds them in linear light. The
default stays as it was because `enemy-flying.js` is a shipped artefact and a
re-import must reproduce it: verified byte-identical after the refactor.

4410 and 4604 triangles, inside the roster's 1800–7776. Tagged on all three
pages, so `check-model-tags.js` and `check-script-manifest.js` both stay clean.

**2026-08-14 — `World3D.animHz` closes the flier-cadence seam: a preview can ask
what drives a body instead of re-deriving it.**

The board drives a walk by DISTANCE COVERED and a flier's wingbeat by a CLOCK
(`HOVER_HZ = 2.6`) — the one exception, and it is the one a viewer standing a
body still cannot see. The codex's enemy viewer had to invent a rate, derived
`ul(speed) / (radiusPx * 2.6)` for everything, and gave the Aether Wisp
**2.5668 against the authored 2.6**: close by luck, not by construction, and the
next flier would land wherever its own numbers put it.

Exported beside `walkBand`/`bandFrame`, which already exist so a preview does
not own a second copy of a rule. **A function, not the constant**: copying `2.6`
into `js/codex.js` puts a second copy of a number in the file that will never be
the one retuned, and that failure is silent — the viewer beats the old rate
forever and nothing renders wrong enough to notice.

It returns **null for every distance-driven body**, and that null is the useful
half: it says this body has no authored rate at all, so a caller standing it
still must invent one, which is the caller's business and not this file's.
Asserted in both directions through the real page — flier 2.6, Normal null,
Brute null, and null for a missing argument. The predicate is `enemy.isFlying`,
the same field `drawActor` branches on.

**2026-08-14 — Opaque is now the renderer's default rather than a promise each
caller makes, and the enemy viewer's four claims are settled in pixels.**

`b65435c`. Follow-on to the transparent-preview fix below. That one repaired the
two callers that exist; this one repairs the class, so the next caller to draw
through `GLRenderer`'s program without going through `begin()` cannot be handed
a transparent default again. `this.setFade(1)` in the constructor, placed after
`this.uniform` and `this._faded` are assigned and after `_link` has already made
the program current — **all three are required, because a uniform write with no
current program raises `INVALID_OPERATION` and is silently dropped**, which is
the shape of fix that reads as done and is not.

Proven rather than assumed, on a cold page with no board draw: `uAlpha` reads
back **1**, `gl.getError()` is **0**, and with `setFade` stubbed to a no-op —
which is what deleting the two per-caller calls would do — a body still renders
**21,040 opaque px**. The control that makes that mean something: stubbed AND
the uniform forced to 0 renders **0 px**, and `draw()` correctly returns
**false**, which is the new empty-bitmap guard firing. The per-caller calls are
now redundant and were left in place.

The viewer itself, measured through the real modal (clicks, not keys), clock
frozen at `performance.now`, SwiftShader, 1280×720, ROI 360×352 of the model box:

- **Mesh, not skin.** Meshed bodies 20,827–47,682 ink px with the "No 3D model
  yet" line absent (0 px in its band); unmeshed bodies 2,548–2,837 px with the
  line present (1,216 px). The same body with its mesh nulled: 20,827 → 1,681
  px, warning band 0 → 1,216, and restoring is bit-identical.
- **It walks, in order.** Sampled at whole revolutions so the turn is held
  **exactly**: all 8 (Normal, Armored), all 12 (Aether Wisp) frames, every frame
  index confirmed at `ModelViewer3D.walkFrame`, no dead pairs, wrap/mean
  0.925–1.16. Seam control — a different revolution landing on the same frame —
  **0 changed px**.
- **It turns without pumping.** Across 24 yaw steps at one held frame the raw
  silhouette swings a lot (width ×1.12 Normal to **×1.79 Swarm**) and that is
  the bodies' real shape: **px per model unit is flat to 0.25–0.91%**, which is
  the size of one pixel of edge threshold. Gating on raw width would have failed
  a correct fit.
- **The arrows wrap and the selection survives.** A full lap of 21 returns a
  bit-identical label and counter; left from 0 lands on 20 and matches enemy
  20's label exactly; the detail panel left behind by the viewer is
  **bit-identical** to selecting that row directly, against a different enemy
  differing by 8,841 px.
- **One render per displayed frame**, exactly, on both rasterisers (SwiftShader
  25/25, 24/24, 23/23; GTX 1660 Ti/D3D11 115/115, 128/128, 134/134), with the
  modal closed moving the counter 0 over 215 frames. **7.3–9.0 ms per render on
  the 1660 Ti**; 58–61 ms on SwiftShader, which is not transferable in a known
  direction and must not be converted into a frame rate.

**2026-08-14 — The strike is re-pointed at the Tripod's `mast` and now carries
mira's frozen numbers. The group rename caught itself.**

suki's tripod (`47190ee`) replaced `enemy-angry`'s groups with `angry_body`,
`leg_0`, `leg_1`, `leg_2`, `mast`. `crank` stopped existing **mid-job**, and the
guard added the same day did exactly what it was built for: `missingGroupOn`
went non-empty, the warning fired, and the strike drew 0 px instead of drawing
something plausible against the wrong part. That was the live test of the check,
on real geometry rather than on a rename.

**The gesture is mira's, from `tools/blender/BRIEF-hedger-tripod-gesture.md`
(frozen at `d2c567f`), and it is not the renderer's to tune:** group `mast`,
pivot `[0, 0, 0.8004]`, **34° = 0.5934119 rad**, and the curve is **LINEAR** —
`angle = 34° * attackFlash`, no easing, no overshoot, no hold. My first draft
eased the recovery with a smoothstep; that made the tool hover at extension,
which is a different claim about the machine than the brief makes. **Aim is 0
and the whole aiming mechanism is gone** — she measured it (strike silhouette
falls 82.8 → 62.8 px from 0° to 35° of aim, because at yaw 0 the model's +y is
the depth axis) and rejected it, so the bearing latch, the `attackBeam` lifetime
problem and the per-body `_glStrike` record all went with it.

**The pivot is 0.8004 and not the brief's 0.80, and that is deliberate.**
`tools/blender/enemy_hedger.py:196` derives `MAST_PIVOT_Z = 0.870 * F` with
`F = 0.920`, because the pivot's justification is that it IS the drum's centre.
0.0004 u is 0.016 board px — two hundredths of a pixel — and it is written down
only so that if the figure height moves, the pivot moves with it.

**Group and pivot now live in ONE record per model**, because they fail in
opposite ways: a wrong group name fails loudly (nothing draws, a warning, a
published list), a wrong pivot fails **silently** — right part, right moment,
right place on screen, swinging about the road instead of about its own axle.
Keeping the pair in one object makes "rename the group and forget the pivot"
impossible rather than merely discouraged.

**And the pivot has an instrument, which is mira's sign check doing double
duty.** At `attackFlash == 1` the bill tip must arrive **below** the drum's
centre line at z **0.509 u**, having started at 0.800. Measured through the
renderer's OWN matrix (`strikeSeam().last`, not a re-derivation): tip
**0.5145 u**, forward extent 0.5188 → 0.4329 against her predicted 0.520 →
0.431. Arming it: substituting the group ROOT for the pivot — the value anyone
would reach for, and the one that is at the road on this body — moves the tip
**0.468 u = 18.6 board px**, so the metric is not decoration.

**The health-bar budget reproduces to the digit, from a third instrument.**
Max z over the `mast` group across all 12 gait frames × 0–34°, through the
shipped model file and the renderer's pivot and swing:

| | mira predicted | suki, built | this rig |
|---|---|---|---|
| highest point in the window | 1.0225 u | — | **1.0231 u** |
| rise over rest | 4.1 board px | 4.10 | **4.10** (worst at gait frame 0) |
| clearance under the bar | 5.9 board px | 5.90 | **5.90** |

**The RENDERED silhouette top is a different quantity and moves less — 1 `#gl`
row.** 4.10 board px of geometry projects to ~3.2 `#game` px here, but the
topmost LIT row is set by the drum's front face while what rises is its rear top
corner. Both numbers are right; they are not the same measurement and must not
be differenced. The safety conclusion is unaffected: measured headroom from the
rendered silhouette to the projected crown line is **4.68 `#game` px**.

**One defect in my own instrument, found by it disagreeing with mira:**
`TDProbe.screenOf` projects heights from z = 0 because `project()` only adds
`groundRef` inside `withGround`, which the enemy pass uses and a probe does not.
The body stands on 7 board px of ground here, so the crown line read ~4 `#game`
px low and the headroom came out under a pixel. And the tip check first read
FAIL at 0.5386 u because "the vertex farthest from the pivot" lands on a *corner*
of the bill's end face, 4.10° above its centre line — a defensible statistic over
the wrong population, failing a seam that was correct. The tip is the centroid of
that face.

Controls, re-taken on the tripod mesh with `gl-world.js` served from `ff4c7d6~1`
so one file differs: two-launch null identical on every hash; a board with no
attacker **bit-identical** (`ecfe51b2`); a Hedger at rest **bit-identical**
(`edea5c15`); the window 24 of 26 real decay steps changing pixels, 186 px at
extension falling to 62, then 0 at the residue and 0 at rest; **wrap back to rest
0 px**; and with `mast` suppressed the rest and full-strike frames are **0 px
apart**, so nothing but the mast moves.

**2026-08-14 — The Hedger has an attack animation. It is a per-group override
composed onto the walk, not a second animation band, and it is driven by
`attackFlash` rather than by the attack timer.**

Diego approved the Hedger redesign and singled out the animation: *"the attack
animation needs to fit with the model tho, since it attacks."* It is the only
body below boss tier that attacks a tower and it had no attack animation at all.

**Why an override and not a band.** The walk is distance-driven —
`bandFrame(eBand, e.progress / stride)`, one cycle per stride, so a planted foot
stays on one patch of road. A band would REPLACE that cycle and stop the legs
dead in the road on every swing. `drawActor`'s `overrides` argument (built for
exactly this: *"a recoil, a hammer coming down"*) composes a per-group matrix
AFTER the baked pose in the group's local space, so the gait carries on
underneath and the strike cannot fight it by construction. **And the Hedger does
not stop to swing** — `currentSpeedUlps` returns 0 only for `rooted`,
`stunTimer` and `windUpTimer`, and `angry` has no wind-up — so it walks straight
through its own 0.4 s strike. A band was never viable.

**Driven by `attackFlash`, which had zero consumers under `js/gl/`** (0 hits in
the SERVED file, checked at capture time, not in the repo). It is set to 1 in
`resolveAttack` — when an attack actually RESOLVES — and decays at `dt * 2.5`.
Explicitly NOT `attackTimer`: that counts down every 2.5 s whether or not
anything is in reach, so a pose driven off it rears the body up at empty road,
which is the one state a strike must never appear in, and it would ship looking
deliberate.

**The gate is a crossing, never an equality — and measuring it corrected a
belief we both held.** `attackFlash` was assumed to rest at exactly 0.
`Math.max(0, f - dt*2.5)` clamps only on undershoot, so at a fixed 60 Hz the
24th step lands on **3.75e-16** and the exact 0 arrives on step 25. Both
statements are true of different steps, which is why an equality gate would have
been wrong in both directions. The same shape sits on `supportFlash`.

**The pivot is read out of the model, not taken from a brief.** An override
lands in the group's LOCAL space, and that space is not one answer per model.
Measured on the shipped `enemy-angry`: `angry_body` is authored in model space
with its root at z = 0 (it carries `model.top` and therefore the health bar),
while every LEAF group is authored about its own root — `crank` spans local
z [-0.582, 0] and the frame pose puts it at model (-0.020, -0.325, 0.600). So
`[0,0,0]` on `crank` is the axle at hip height and the identical constant on
`angry_body` would be the road. Re-derive per group; do not carry it over.

**A missed lookup is now loud.** `drawActor` skips an override whose name is not
on the model, and a Hedger drawing its plain walk because the lookup missed is
pixel-for-pixel identical to one that has not attacked — the same soft failure
that let the model-viewer exports go undefined past their own commit.
`strikeOf` warns once per model name and `World3D.strikeSeam().missingGroupOn`
publishes the list so a test can assert it is EMPTY. **The check was armed
before it was trusted**: renaming `crank` in the expanded model makes the list
`["enemy-angry"]`, emits the warning, and makes the strike draw 0 px rather than
something wrong.

**Measured, at the fitted board camera (distance 2021.2374, target [640,360,0],
#gl 1111x625, SwiftShader, lane and clock pinned).** Every figure below is
changed pixels on `#gl` unless it says otherwise.

- **Negative control by construction**: a board whose only body has no `attack`
  row is **bit-identical** before and after — hash `ecfe51b2` across three
  browser launches. Not a stub and not a disabled half; the same game on a
  different board, so the new code simply never runs.
- **Rest is bit-identical too**: a Hedger with `attackFlash` 0 hashes
  `b171a7d0` before and after.
- **Two-launch null** on unchanged source: every hash, bbox and sweep value
  identical across two separate browser launches, so the before/after
  comparison is attributable.
- **The window fires and closes.** 24 of 26 real decay steps change pixels,
  90 px at full extension falling monotonically to 15, then **0 at the 3.75e-16
  residue and 0 at true rest**, with the **wrap back to rest bit-identical**.
  No dead pairs in the interior. 25 distinct frames of 26.
- **It moves the crank and nothing else.** With `crank` suppressed, the rest
  frame and the full-strike frame are **0 px apart**. The all-groups-suppressed
  control reaches **exactly 0** against an empty board first, so the crank's
  44 px (walk bucket 0) really is the crank and not something else painting
  there.
- **The health bar is safe.** The silhouette's top row does not move at any step
  of the window; headroom to the projected `crownOf` line stays 4.43 #game px.
  Nothing in the pipeline checked this before.

**`STRIKE_SWING` and `STRIKE_AIM` are provisional and belong to art direction**,
not to the renderer. `STRIKE_AIM` defaults to 0 (unaimed) because the only
identity statement on record is that the Hedger is a machine clearing an
obstruction rather than a thing fighting, and because unaimed is the smaller
mechanism. The aimed path is not dead: `World3D.strikeSeam({aim: 1})` exercises
it from the same build (measured cost 67 px), and the bearing it uses is
**latched on a rise** because `attackBeam.life` decays at `dt * 4` (0.25 s)
against `attackFlash`'s `dt * 2.5` (0.4 s) — read per frame, the aim would snap
back to the walking heading for the last 0.15 s of every strike, with every
individual frame a legal pose. Measured: dropping `attackBeam` mid-window moves
**0 px** and the latch still reads its original bearing.

**How often it actually fires**, counted from the real `resolveAttack` over the
real wave 13 (20 Hedgers, interval 1.5): on a deliberately favourable board —
five towers set 28 px off the path normal, inside the 49.4 px reach —
**1 to 4 attacks per Hedger, mean 1.95**, over a mean 33.1 s on the road. The
strike window is **2.4% of a Hedger's life on screen**, so it has to read the
first time.

No test suite loads `js/gl/gl-world.js`, so the six suites are not evidence
about this change in either direction; the pixel work is.

**2026-08-14 — The Hedger is rebuilt as the Tripod: three legs, a drum, and one
working bill. `enemy-angry`, 4072 → 1800 triangles.**

Diego approved mira's candidate B. Built to her two briefs (part inventory and
attack gesture); the old body's geometry and its header are both gone.

**The gates, with numbers rather than assurances.**

| | |
|---|---|
| triangles | **1800**, from 4072 |
| `check-model-top` | raw 0.9200 = posed 0.9200, pad **10.0** board px, ok |
| `check-gait-slip` | A **0.258** board px, B 2.979, worst foot `leg_1` |
| `check_penetration` | **CLEAN**, 12 declared contacts |
| plan radius, envelope over all 12 frames | **0.5331 u**, from the shipped body's 0.7253 |

**A is authored slip and is now near zero on all three legs** — level with the
best on the roster. B is the quantisation sawtooth at 12 frames and no rig can
touch it. Foot excursion is ±0.1874 u, derived from the stride rather than
chosen: a plant is 6 of 12 frames, so the planted sweep is (6−1)/12 of a cycle.

**THE `mast` GROUP ROOT IS AT z = 0, WHICH IS A CORRECTION TO THE BRIEF.** The
inventory asks for it at the drum's centre (0, 0, 0.80) so the strike needs no
pivot arithmetic. It cannot go there: `export_mesh.py:199-204` stores geometry in
the **group root's local space** and `gl-models.js:120-124` takes `model.top` as
max z over the raw `positions`, so an elevated root's height never enters
`positions` at all. Verified on the body being replaced — its `crank` root sat at
z 0.600 and its stored geometry ran z [−0.582, 0.000], top reading **zero**. This
body's tallest geometry is the drum and the drum is in `mast`, so the bar would
have been painted through the machine at every frame, permanently. **The rule in
its sharp form: the group holding the model's tallest geometry must have its root
at z = 0.** Leaf roots still belong at their own pivots. otto takes the pivot back
as a `localPose` argument and nothing else in the gesture changes.

**`mast` is keyed to identity on all 12 frames, and that is not animation.**
`_group_root` walks up to the nearest ancestor holding an *action*, so an unkeyed
empty is transparent to it and the drum would have exported as part of the body,
leaving otto no group to override. One walk band; the strike is live.

**Two things measured that neither brief predicted.**

1. **The drum ploughs into the hub at full stroke — 0.0477 u, 1.9 board px.**
   Rotating a 0.221 u drum about its own centre swings its rim down by
   `R sin 34° = 0.123 u` and the hub is directly beneath it, so any hub taller
   than ~0.06 u is hit. Structural, not a sizing miss. The dipping edge reaches
   radius 0.116 against a hub surface at 0.156, so the intersection is buried
   inside the hub's own cylinder rather than breaking its silhouette — **a
   geometric argument, flagged for a render rather than closed.** `check_
   penetration.py` cannot see this at all: it walks the baked frames and the
   strike is not baked.
2. **The brief's plan margin compares a radius against a diameter.** It reads
   "plan radius 0.5212 u against the frost-ring budget of 0.8930 u, margin
   0.371". 0.8930 is the ring **diameter**; the ring **radius** at this sizeScale
   is 0.4465 u, which is what a plan radius has to be measured against. The built
   body is 0.5331 u = **119% of the ring radius** — and the body it replaces was
   0.7253 u = 162%, so this is a large improvement and not a regression. The
   inventory's geometry is right to within 2 points; only the margin sentence is
   wrong.

**One line of the inventory cannot be met and no ordering can meet it.** It says
the trailing leg "should only ever be off the ground while both leading legs are
planted". The shared support window is duty 0.5, so the body has exactly one foot
down on six frames of twelve; the trailing leg is airborne on frames 12, 1, 2, 3,
4, 5 and on four of those only one leading leg is planted. Every ordering is a
rotation of the same cycle, so this needs **duty 2/3** — a second change to
`support_left_frames`, reaching nine shipped bodies. Not taken unilaterally. The
footfall ordering itself (lead → other lead → trailing) is carried exactly, by
the group order.

Predictions from the gesture brief that the built geometry confirms: rise over
rest **4.10** board px against a predicted 4.1, clearance under the bar **5.90**
against 5.9, the sign check passes (tip below the drum's centre line at
`attackFlash == 1`), and the stroke pulls the tool inward — mast plan radius
0.4595 u struck against 0.5253 at rest — so the strike cannot break the plan
budget.

`core_red` is named **battery** throughout, per Diego. The 1.25 `sizeScale` is
not baked.

**2026-08-14 — The shared grouped gait was wrong above two leg groups: the
swing phase and the support window rotated in opposite directions.**

Found while proving the Tripod (the Hedger's replacement) could use the shared
gait at all — the first caller ever to pass three groups. Inside
`enemy_chassis.animate_walk_grouped`:

    group_phase(g, f)       phases[(f + shifts[g]) % frames]     LED  by shift
    group_plants(g, frame)  ((frame - 1 - shifts[g]) % frames)   LAGGED by shift

so a shifted group was planted through the wrong part of its own swing. Group 0
sweeps monotonically (`-1, -2/3, -1/3, 0, +1/3, +2/3`); group 1 ran
`+1/3, 0, -1/3, -2/3, -1, -2/3` and **reversed direction half way through its own
plant**. Measured on a three-legged stub at `frames=12`, hip 0.480:

    foot_0   0.2421 board px      <- the only leg the solver measures
    foot_1  19.3088 board px
    foot_2  14.3321 board px

The fix is one character — `phases[(f - shifts[g]) % frames]`. All three feet
then read **0.2421**, identical to each other and to the irreducible
sine-curvature residual the Gleaner (0.277) and the Drudge (0.294) already
carry.

**Why nine shipped bodies never showed it: at two groups the shift is
`frames/2`, and `+N/2 == -N/2 (mod N)`.** The function's own "verified at 2, 4
and 6 groups" line is not wrong, it is about something else — those runs checked
*support counts*, never planted travel.

**And the solver could not have caught it.** `gait_solve` steers on
`groups[0][0]` and measures no other foot, so it converged and reported success
on all three numbers above. **A clean solve is not a clean gait.** But
`tools/check-gait-slip.js` iterates every foot and reports a worst foot, so the
shipped gate would have caught this the first time a three-group body ran — the
defect was undetected because no such body existed, **not undetectable**.

**Proven inert on every shipped body, twice, at two different levels.** New
harness `tools/blender/check_group_gait.py` dumps every object's world matrix at
every frame for the ten bodies that import the chassis, built through
`export_mesh._build_enemy` so it exercises the shipping path: **0 differing
floats of 96,704**, before against after. Then end-to-end on the artifact,
because a rig dump is still upstream of the file: `framesDigest` on re-export is
**unchanged on the Dray `a3a9e9eb…`, the Tender `7b346e4d…` and the Hedger
`4a6288954…`** — the two multi-group shipped bodies and the one this work is
for.

**The first negative control on that harness was blind, and that is the part
worth keeping.** Perturbing `animate_walk_grouped`'s `bob=0.03` default to 0.031
also reported 0 differences — because `chassis.animate_walk` declares its own
`bob=0.03` and forwards `bob=bob`, and the two multi-leg bodies pass `bob=BOB`,
so the grouped default is shadowed on every path. **A control on a default
argument proves nothing.** Re-armed on the exact line under test
(`phases[(f + shifts[g] + 1)]`) it lights 26,276 floats across 8 of 10 bodies;
the 2 zeros are `enemy_normal` (own `animate_walk`, :342) and `enemy_vanguard`
(own, and its header says so), which never reach the shared gait. Every zero
explained by code, not by story.

**New gate in the same function: `frames % len(groups) != 0` now raises.** The
shifts are whole frames, so three groups at `frames` 8, 10 or 16 gives gaps of
3/2/3, 3/4/3 and 5/6/5 — legs unevenly phased, silently, and a second defect
independent of the sign. It passes all four shipped configurations by
construction (2 groups at 8, 12, 36, 128) and fails exactly those three, tested
both ways.

**Scope the odd-N caveat carefully, because it is easy to blur.** Odd `frames`
at two groups is broken *today* and this fix makes it **correct**; what is not
free there is the **inertness**, since `int(round(N/2))` is banker's-rounded and
`+s != -s`. Correctness and inertness are different claims. Every current frame
count is even (8 on eleven bodies, 12 Hedger, 36 Vanguard, 128 Tyrant), which is
why the harness reads zero.

**NOTHING SHIPPED IS WRONG, AND NOBODY NEEDS TO RE-CHECK THE ROSTER.** Say it
plainly because the fix reads scarier than it is: all ten bodies in
`js/gl/models/` are correct, were correct before this commit, and are unchanged
by it. The trap was armed for the first body ever built with **more than two leg
groups**, and that body is the Tripod, which does not exist yet. Every shipped
walker passes exactly two groups, and at two groups the defect cannot occur.

**Which bodies were re-exported, since "a chassis change" is two different blast
radii.** A chassis edit reaches the five bodies that call its sub-assemblies AND
the two that take only `materials()`/`animate_walk_grouped()`, so the honest
answer is per-file rather than "all of them": **re-exported to read the digests —
`enemy-colossus` (Dray), `enemy-shieldbearer` (Tender), `enemy-angry` (Hedger).
Not re-exported — every other model.** None of the three was committed, because
none of them changed: the digests are identical and the working copies were
restored.

Rule written into `AGENTS.md` under "Building a model that looks like the ones
that already work", and the one-foot-certifies-the-body warning into
`gait_solve.py`'s own header, where the next person reading the solver will find
it. No model file changed. (Re-exporting to check the digests
does rewrite `positions`/`normals` line ordering, but that is pre-existing
export nondeterminism — two consecutive exports with no edit between them
differ the same way, and the sorted triangle multiset is identical.)

**2026-08-14 — Three things the capture found once the viewer could be seen.**

Driving the real modal turned up two input defects and one that is a design
question rather than a bug.

**The Back button was live and all but invisible under the modal.** The viewer's
backdrop is 93% opaque, which leaves the button showing at a measured **141 ink
px in its 96x34 box** — and `js/game.js` still tested its rectangle *before*
handing the click to `Codex.onClick`, so it took the click anyway. All but
invisible and fully clickable is the worst of both. Worse, `Codex.open()` reset
`enemyIndex`, `enemyScroll` and `pick` but never cleared `viewer`, so leaving
that way and coming back put a **stale modal showing one enemy on top of an
index reset to another** — two states disagreeing about what the player is
looking at, with the wheel dead underneath because the viewer swallows it.

Fixed at both ends: the modal now outranks the button (`Codex.modalUp`), and the
button is not drawn under it either. This is the input-priority rule `AGENTS.md`
already states, applied one level in — anything drawn on top consumes clicks
before what is under it. **The control that matters is that Back still works
when no modal is up**; a fix that merely disabled the button would pass every
other check.

**The viewer opened at a different yaw from the picture that was clicked.** Every
static preview on the screen sits at `LIST_YAW` (−30°) and the modal started at
0, so the body visibly snapped through 30 degrees at the exact moment the player
was comparing the two. It now starts at `LIST_YAW` and turns continuously.

**And one that is NOT fixed, because it is a design question: the per-body fit
destroys relative size.** Every body is fitted to the same box, so the
**Colossus renders 231–277 px tall against the Normal's 307–333** — the game's
heaviest enemy shown *shorter* than its weakest, backwards from the board by a
wide margin. A shared scale would waste most of the frame on the small bodies,
so there is no free fix. Recorded rather than papered over: a field guide that
answers "how big is this" wrongly is worse than one that does not answer it.

Also recorded and deliberately not fixed: the codex derives every walk rate from
speed over stride, while the board drives a **flier** from a clock at
`HOVER_HZ`. That happens to give the Aether Wisp 2.567 against the board's 2.6 —
within 1.3%, which is why nothing looks wrong today. It is luck, not
construction, and the next flier will land wherever its own numbers put it. The
honest fix is to export the rule from `gl-world` rather than copy the constant,
so the seam is documented at the derivation instead.

**2026-08-14 — Every 3D preview on a cold page was rendering fully transparent,
and reporting success.**

Menu → Index → Enemies on a freshly loaded page: the viewer opened, the stage,
the label, the badge and "1 / 21" all drew, and **the body was absent.** So were
the meshed rows in the roster, the exhibit in the detail panel, the turning
tower body, and — by the same mechanism — every icon in the armoury.

**One uniform.** The fragment shader's alpha is `uAlpha`. It is written by
exactly one function, `GLRenderer.setFade`, and outside gl-world's camo pass
that function is called from exactly one place: `GLRenderer.begin`. **A GL
uniform initialises to zero.** On the index the board never draws — `draw()`
returns straight after `Codex.draw` for `screen === "index"` — so on a cold path
`begin()` has never run in the process, `uAlpha` is still 0, and every pixel
rendered by `ModelViewer3D` and `TowerPreview3D` came back fully transparent.
Both modules re-assert the entire render state rather than inheriting it —
viewProj, both light directions, ambient, fill, key strength, glow — and the
fade was the one they missed.

**It hides because it repairs itself.** Play one wave and `begin()` has run, and
every preview is correct for the rest of the session. The broken path is the
first one a player takes, and it is the only one — which is why it survived
every manual check by everyone who had already been playing.

`js/gl/tower-preview.js` carried the sentence *"the shader always writes alpha
1, so every lit pixel is opaque"*. That has not been true since the camo pass
made the fade a variable, and nobody revisited the two files that had written
the assumption down. The comment is now the record of what broke.

**The second defect is the one that made it silent.** `render()` returned a
canvas and `draw()` returned TRUE for a bitmap with no opaque pixel in it, so
the callers' fallback could not fire and the viewer's own honesty line — "No 3D
model yet — showing the flat marker", which exists precisely to say the picture
is not the mesh — never showed. "I rendered" and "there is something in it" were
the same answer. Both modules now scan for one opaque byte, early-breaking so
the cost falls on the failing case, and return null when there is none.
**That null is deliberately NOT cached**, unlike every other null here: it is
the one that can stop being null, and remembering it would hold a slot on its
flat glyph for the session over a condition that had already cleared.
`ModelViewer3D.stats().empty` counts them.

Found by driving the real game and reading pixels back, with a two-way control
on the single uniform: cold page 0 lit px, after one `setFade(1)` 21,273 lit px,
and put back to 0 it returns **bit-identical to the first capture**. No suite
could have caught it — the harness has no WebGL, so every green result on this
feature exercised the 2D fallback path.

**2026-08-14 — The Vanguard verifies both legs, and "groups" gets pinned down.**

`884f325`. `enemy_vanguard.py` ran `measure_plant("leg_l")` and nothing else, so
a shipped boss verified its gait on **one leg of two**. Found by kaz applying
the Tyrant job's own rule to the neighbouring body: **ask what case the check
has never been given** — the answer was its own right leg.

Measurement only, no geometry. The re-export is content-identical to the
committed file (same 2,760 triangles, position multiset identical, `frames` and
`groups` JSON identical), so the committed bytes were restored rather than
taking a diff that is pure Blender face-order noise.

    A (pre-export, posed)   leg_l 0.000000 u   leg_r 0.000000 u   delta 0

Clear by construction now instead of by argument. It was very probably fine —
two mirror legs on a half-cycle offset should agree — but **"fine by symmetry"
is immunity by coincidence**, and it is the same assumption that let
`gait_solve` steer on `groups[0][0]` and report SUCCESS on a body whose other
two feet slid 19.3 and 14.3 board px. Four one-case instruments surfaced in two
days; this one cost a line to close.

**`AGENTS.md` gets the vocabulary trap, at the point of use.** *Mesh* groups are
what the exporter emits, one per animated root, and what every tool prints;
*gait* groups are evenly-phased leg phases, which is what the 3+-group rules are
about. The Tyrant is **3 mesh groups and 2 gait groups**, and reporting the
first into a conversation about the second read as an alarm on a shipped boss.
Mesh count is always at least gait count + 1 — the body root is a mesh group and
is not a leg.

It also records **why both bosses are clear** of the `groups[0][0]` defect: not
because `+N/2 ≡ −N/2 (mod N)` hides it at two groups — true, and it expires
silently the day someone adds a third — but because **neither module calls the
defective functions at all.** Prefer immunity by construction to immunity by
arithmetic: the structural reason keeps holding when the leg count changes, and
nothing announces when the arithmetic one stops.

**2026-08-13 — The Tyrant gets a body, and it walks without sliding.**

`enemy-boss` — the wave-35 boss the whole campaign ends on, and the last of the
two bosses Diego released. 5,392 triangles, 128 frames, 3 groups, sizeScale
2.40. **Authored gait error A = 0.004 board px**, the lowest of any body on the
board; the Vanguard's 0.002 is on a body a third smaller, and every other enemy
reads between 0.28 and 19.87. Diego asked for this one by name — "make sure the
tyrant doesn't slide but actually walks."

**A container with legs.** No head, no face, no lens: `chassis.head()` is never
called, and the closed lid is the statement rather than an omission. The hold is
a **rank of three ordinary cargo cages** at scale 0.46, ranked along the travel
axis with 0.047 u gaps, breaking the top outline by 0.107 u — a row of identical
small cages says capacity where one big cage would say importance.
`cargo_cage()` is SEALED and was placed, never rebuilt. **The hold carries
nothing**: Diego ruled that the forty bodies the roar calls in come from the
enemy base, so the hold is empty because it has not taken anything yet, and no
geometry here depends on its contents.

**The legs are Diego's "2 big moving triangles, perpendicular to the ground",
apex DOWN** — the Vanguard's blade mirrored, so his primitive is on both bosses
rather than spent on one. The plate's PLANE is vertical and contains the travel
axis, so it rotates only about y and shows its whole triangular area at camera
yaw 0, which is the bearing 25 of 42 road segments give.

**`BRIEF-enemy-boss-tyrant.md` sections 2 and 3 are superseded and the module
says so.** They specify an apex-UP plate with a flat sole, a heel-to-toe roll
and duty 0.625. Two measured reasons beyond the art direction, both derived and
sent up before any geometry was cut:

- **`check-gait-slip.js` cannot score an apex-up Tyrant correctly.** It tracks
  the mean x of a fixed sole band — a material set, which is the right choice —
  and on a flat sole rocking about a pin above it that mean is the sole
  MIDPOINT. The midpoint sweeps 0.49124 u against a 0.55503 u requirement, so a
  PERFECTLY CORRECT apex-up body scores A = 0.0638 u = 4.87 board px. The gap is
  exactly the brief's own `B(1-cos θ)` term: the part of the travel that comes
  from the pivot moving from heel to toe, which no fixed material point can
  carry. Two people reached the same 0.55 by different routes.
- **Duty 0.625 is not buildable on a point contact.** Two point-contact legs
  both planted demand hip heights differing by 0.022–0.050 u against the brief's
  own 0.005 tolerance. Duty is forced to exactly 0.5 — and 0.5 is the better
  answer anyway: **exactly one blade is on the road at every one of the 128
  frames.** This body freezes for 1.3 s every 12 s while it aims, so every frame
  of its strip has to be a pose it can hold, and none is airborne.

**The general rule, which is worth more than the geometry it settled: a
measurement error in a report costs one correction; the same error in a GATE
costs every body the gate touches**, and it is harder to disbelieve because
turning a finding into a check reads as diligence. Note the direction too — this
family fails toward ALARM, not toward a false pass, and a scary result from an
unvalidated instrument is worth exactly what a clean one is.

**So the gate was shown to FAIL as well as pass, on real geometry.**
`TYRANT_GAIT_DEFECT` (default 1.0, documented, unreachable by a normal export)
re-exports this same body with its plant travel scaled. Predicted A at 0.8:
0.088523 u = 6.757 board px. The gate read **0.08850 u = 6.755 board px** on the
exported file, from an independent measurement path, against 0.00006 u on the
good build. A gate that has only ever been shown to pass has not been shown to
do anything, and synthetics prove the arithmetic while saying nothing about the
population.

**The swing angle is DERIVED, not typed.** Three constraints use up every degree
of freedom: P = 64 (forced), the brief's 0.4635 pin height (frozen by its own
section 8), and `2 D sin θ = 63 × 0.899281 / 128 = 0.442615 u`. So **θ =
28.520°, not the brief's 32** — that 32 was solved against the flat-sole
identity and died with the sole. `enemy_tyrant.theta_m()` computes it from the
depth and the schedule, so a later change to either cannot leave a stale angle
behind. That stale-angle defect is exactly what `gait_solve`'s header describes
on the chassis's fixed 28 degrees, "out to 19.867 px on the Dray".

**Two things are free and are not authored twice.** The bob: with the apex
directly under the pin the hip rides at 0.4690 at mid-stance and 0.4124 at both
extremes, so the body rises and falls 0.0567 u twice per cycle with no keyframe.
And the cadence: the cycle is distance-keyed, so the half-health speed change
speeds the walk up by itself and needs no second gait.

**A rigid single-segment leg with a point contact and duty 0.5 cannot clear the
road on the recovery at ANY swing path** — the swinging blade's clearance is
`D(cos θ_plant − cos θ_swing)`, which needs the swing angle to exceed the
planted one in magnitude, and the swing has to pass through zero. That is a
proof, not a tuning failure, so the leg root lifts through the swing and the
lift is swallowed by a hip housing whose depth is ASSERTED against the measured
lift. The Dray and the Vanguard both ship the same declaration.

**One `check_penetration.py` hit was excused, and it is the only excused hit on
the model.** The AABB pass reports 0.105 u of blade-in-hull overlap that is not
there: an apex-down plate's local bounding box is half empty, and the empty
corner is the one that swings highest — it rises 0.2006 u above the pin while
the real top edge rises 0.0483. That is this checker's own documented limit, "a
box is a poor proxy for a diagonal taper, whose box is mostly air". **The pair
is not merely excused; it is replaced** by exact convex separation on the true
triangle against the true hull footprint, every frame, both legs, raising at
build time and STRICTER than the test it stands in for. The same pattern covers
the cage rank, where prefix matching cannot tell cage 1 from cage 2:
`assert_rank_disjoint()` measures the real gaps. **Clause 8's failure mode is an
exclusion paired with nothing.**

That solid test earned itself immediately. Its first run returned a clearance of
**0.00006 u** — a pass by coincidence that any later edit would have turned into
a defect without anyone touching the line. Dropping `BLADE_B` from −0.160 to
−0.200 bought 0.035 u for free, because with the apex under the pin the plate's
area does not depend on that vertex's depth at all; the assert now demands a
0.020 margin rather than a sign.

**And that assert now has its own negative control, because catching a near
miss is not the same claim as rejecting a hit.** kaz's point, and it is the
right one: **a threshold that has never rejected anything is a threshold nobody
has tested.** `TYRANT_HULL_DEFECT` (default 0.0) lowers the hull by a stated
amount and nothing else — applied after the plate-rise assert and only to the
hull's placement, because a control that trips two instruments at once has
tested neither. Three predictions registered before the runs, three exact hits:

| defect | predicted | measured | result |
|---|---|---|---|
| 0.000 | +0.03486 u | +0.03486 u | passes |
| 0.020 | +0.01486 u | +0.01486 u | **raises** — margin, still air |
| 0.060 | −0.02514 u | −0.02514 u | **raises** — blade inside the solid |

The third is a genuine penetration rejected, which is the case the instrument
exists for and the case it had never been shown to catch. **The control also
found a defect in the check's own error message**: the first version reported
the third case as "comes within −0.02514 u of the hull", which reads as a near
miss and is a body part inside another body part. The two faults are now worded
separately. A check that cannot say which fault it found is half a check, and
only running it into a real failure shows that.

**Gates.** `check-gait-slip` A = 0.004 px, B = 0.536 px (F = 128 is three times
clear of the 43 the brief's frame-count law asks for). `check-model-top` ok at
the full +10.0 margin, raw top and posed top equal — this body has
`showHealthBanner: true` at sizeScale 2.40, the largest multiplier in the game
on that class of error. `check_penetration` CLEAN. `check-model-tags`: the enemy
family is now complete on all three pages, and the Vanguard's own missing
`3d.html` tag went with it — 11 gaps down to the 10 pre-existing blub ones.
Rendered through the game's own `GLRenderer` and shader at the dominant bearing
before commit; the read judgement is owed to juno.

**Plan extent is 115% of the ring**, against precedent of 203% (brute), 189%
(hive) and 162% (angry). The brief's own 106.4% counted the legs' x extent
alone: it omits the hull corner, which is what actually sets this body's plan
radius, and omits the plates' y offset. A body that does not slide has a plan
extent of roughly one stride, so the plan budget and a correct gait are
structurally in tension at every sizeScale above about 1.0.

**`--only=enemy-boss` now matches TWO targets.** `enemy-boss` is a prefix of
`enemy-boss_fast` and the exporter matches by prefix, so its header's claim that
"no full target name is a prefix of another" stopped being true with this model.
A Tyrant run rewrites the Vanguard too — identical in triangles, not in byte
order. Both files say so.

**2026-08-13 — The models are visible now: bigger previews everywhere, real
bodies in the index, and a viewer that turns a tier or walks an enemy.**

The owner's complaint was that the build-bar previews are unreadable because
they are too small, and that the index shows a picture that is not what walks
the road. Both were true, and the second was worse: `js/codex.js` magnified
`model.sprite` — the flat 2D fallback drawing, authored before these enemies had
meshes — so a player studied one picture in the field guide and met a different
one in the game. That is the one thing a field guide must not do.

**The pictures got bigger and nothing moved to make room.** Build slot 22 → 46,
store card 26 → 60, armoury loadout row 26 → 46, codex tower rail 22 → 52. The
build slot needed ten more pixels of height and they came out of the bar's own
bottom margin (`SLOT_SIZE` 76 → 86, margin 18 → 8), so **`BAR_Y` is 626 exactly
as it was**: no panel clamp moved, no playable ground was lost, and the five
suites that assert `L.y + L.h <= BAR_Y` never noticed. Growing the bar upward
would have moved all of it for a cosmetic gain.

**The armoury loadout row was drawing the flat glyph** while the bar it exists
to preview drew the mesh. So the row whose entire job is "this is the bar you
will play with" was showing something else. It draws the mesh now, same
fallback contract as the other three.

**`js/gl/model-viewer.js` (new) is the VIEWER path, and it is deliberately not
`js/gl/tower-preview.js`.** That module is the ICON path — five tower families,
frame 0, one fixed yaw, cached per (model, pixel size) — and every one of those
restrictions is what makes a 22 px slot cost one `drawImage` and no GL work.
The viewer needs any registered model at any yaw and any animation frame, which
is a live render loop, so it carries two policies and the caller picks: CACHED
(yaw quantised to 24 steps, one render per animation frame, misses fall back to
the 2D glyph for that frame so nothing is ever blank) for anything over a live
board, and LIVE (fresh every call, nothing kept) for the index, where `draw()`
returns before the board is asked to render. Getting the choice wrong costs
frame time one way and memory the other, never correctness.

**The fit is a bounding CYLINDER about the turn axis, taken across the whole
walk band.** Fit a turning body to its screen box at one yaw — which is correct
for the icon path — and it grows and shrinks as it turns, because a rifle
broadside is about twice the silhouette it is end-on. The body would pump once
per revolution and read as a zoom. One pass over the posed vertices gives the
exact extents for every yaw at once. And it is the whole band rather than frame
0 because a single frame of an animated model is a sample, not a measurement:
this project has already measured a 0.498 u rest-pose extent against a 0.598 u
all-frames envelope on one body, the difference occurring at two frames in
eight. Fitted to the rest pose, a walking viewer clips its own stride twice per
cycle — and only twice, which is exactly the kind of defect a per-frame review
passes.

**The enemy viewer** walks the body on the spot while it turns, with an arrow
either side to step through the roster and Escape to leave. The walk rate is
derived from the enemy's own speed over its own stride, which is the quantity
the board's distance-driven walk already uses, so a Sprinter scurries and a
Colossus plods for the same reason and by the same arithmetic. Frames come from
`World3D.walkBand`, never from arithmetic on `frames.length`: enemies index
frame 0 as a walk frame and the summoner family reserves it as a rest pose, so
any constant would be wrong for one of them. **Eight of the twenty-one types
have no mesh and reach the flat-marker path here on every load, and the viewer
says so on screen** — a magnified 2D skin standing in for a body that was never
modelled is honest only if it admits it.

**The tower body sits left of the upgrade tree on the index and shows the tier
that is picked**, so a5 and b5 stop being bodies nobody has seen without buying
them. It says "no new body at this tier" where a tier buys none — Rifleman A1,
A2 and A4 wear the body below them and the Siphon gives every tier its own, and
showing the same picture under a different tier name without saying so is the
guide implying a change the geometry does not make. Which mesh a tier wears is
asked of `World3D.modelFor`, the same resolver the board asks, so the guide and
the road cannot disagree.

**The viewer is a modal inside the index rather than a value of `screen`**, and
the consequence is that `Escape` has two jobs on that screen. `Codex.onKey`
returns TRUE when it consumed the key and `onKeyDown` routes to it first, so
Escape closes the viewer when one is up and leaves the index when one is not.
**That handler existed for a session and was not in the module's return block** —
written, correct, unreachable, and silent: nothing throws, the arrows simply do
nothing. It is the same failure as an untagged script file, one scope down.

Suites: 107/0, 207/5, 72/0, 45/0, 53/0 and sandbox green — the same five
failures, by name, as the recorded clean-extraction baseline. None of them is
this change.

**2026-08-14 — Clause 8 reaches a pose the exporter never sees, and no render
can discharge it.**

The first body with a live attack pose is **one body under three names** — the
Blender script `tools/blender/enemy_hedger.py` ("the Hedger"), the enemy type
`angry`, and the Tripod on screen. Its strike is a per-group `overrides` matrix
composed on top of the baked walk at draw time, driven by `attackFlash`, and
nothing exports it. `tools/blender/check_penetration.py` walks
`range(1, frames + 1)` — the baked frames — so it reports **CLEAN, correctly**,
over the walk, while at full stroke the drum's rim reaches **0.0523 u into the
hub at z 0.595**, from 18° of a 34° stroke, for **47% of each gesture window**
and about 1.1% of a body's time on screen. Found by suki against her own passing
gate.

**Disposition: the stroke goes to 17°, and no exclusion is declared.** First
contact at 18° of a 34° stroke is an overshoot, not an abutment, so the
design-intent claim an exclusion requires is one the geometry contradicts.

**CORRECTED SAME DAY — 17° DOES NOT COMPLY, and this entry said it did.** The
posed sweep landed and found **2 intersecting triangle pairs, `hold` against
`thigh_2`, at walk frame 6**. First real contact is between **7° and 8°**, the
largest clean angle is **7°**, which is not a stroke, and the curve is monotonic
at ~0.0063 u/deg from 2° to 34° — there is no safe pocket. **So no stroke angle
that reads as a gesture is clean; this is geometry, not a constant**, and it is
with art direction.

Three corrections in that, each about the instruments rather than the body.
**The operative pair is the holder against a THIGH, not the drum against its
hub** — a different pair from the one the 18° figure came from, so the window
everyone argued over was never the operative one and the body was violating
below half the smallest angle discussed. **The non-monotonic 15° peak that made
a safe pocket seem possible was an artefact of a point-set instrument.** And
"17° is clean by construction" was never measured — it was inferred from a
threshold found on a different pair, and it reached this file and `AGENTS.md`
before anyone tested it.

**RETRACTED THE SAME DAY: an earlier version of this entry said the gesture no
longer rotates. It does.** Verified in the shipping code — `gl-world.js:1792`
is `swing: 0.2967060`, exactly 17.000°, and `:1860` passes it as **ry**, a
rotation about y. The declared violation is still in the file's own header at
`:1731`. **The 17° rotation and its open violation are current state.**

A re-authoring of the strike as a **recoil** — a pure translation of `mast`
along its own axis, following the ruling that the implement is a gun — is
**proposed and not landed**. It would remove this overlap by construction, and
it would not clear the body: `mast` also carries the hold, slung under the drum
where the hub is, so a slide needs its own sweep of the full travel.

**The mistake is worth more than the correction.** A design decision was
relayed to me and I wrote it into `AGENTS.md` and here as current, ahead of any
code. That is the mirror of a stale claim — **a claim arriving before its
truth** — and it is the worse direction, because the operative document would
have described a gesture the code does not implement, making the code's own
header look like the thing that was out of date. **Record a gesture change
against a commit sha, never against a description of intent.** Neither the
rendering lead nor I can see the other's working tree; that is precisely why
the document has to follow the file rather than the plan.

**The body is UNPROVEN, not cleared.** A translation cannot produce that
intrusion; it can produce a different one nobody has measured. `mast` carries
the **hold**, slung under the drum in the same place as the hub — the drum stays
above the hub under a horizontal slide and is safe by construction, **the hold
is not, and it is in the same group.** A per-z-slice sweep of 0 → 0.12 u closes
it, with a number.

**And the clause is not settled by an instance that stopped existing.** The
ruling rests on the clause's own words — *"in some pose, whatever the numbers
say"* — and every condition that made the seam dangerous is unchanged:
`check_penetration.py` still walks baked frames, `overrides` still compose live,
and a body can still pass every gate with parts inside each other for part of
every gesture.

**The three-row validation this clause now demands is what made the result
assertable**, and it caught the mirror error in the same run: the instrument
reports CLEAR at 0–1°, flags 2–7° on the box test and then classifies them
**phantom** at zero intersecting triangles, reporting REAL only from 8°. **A box
test alone would have called 2° a violation** — exactly the false-fail direction
added to clause 8 hours earlier, caught by the instrument built afterwards.

**The group is `mast`.** It has been `mast` since `47190ee`; `crank` does not
exist on this body and appears only in a commit subject. Named here because the
change log is where people look to find when a value moved, and they will search
for the group.

**THE MARGIN BEHIND THE 17° IS NOT YET MEASURED, and that is recorded here
deliberately.** First contact was measured at 18°, so 17° is below the observed
threshold — but the clearance behind it, about 0.13 board px, is an
extrapolation from the 18°–34° span at ~0.0033 u/deg. A vertex-set sweep across
14°–18° came back **non-monotonic, peaking at 15°**, so the approach geometry
changes character inside the window we are operating in and a single crossing
cannot be assumed. **Until the solid sweep lands, "17° complies" rests on an
extrapolation, not a measurement.** A measured clearance at 14–18° is
commissioned. Nothing here says the ruling is unmet; it says the margin is not
yet a number.

**Complying costs one constant and no geometry.** The stroke is not in the mesh:
`gl-world.js:1740` is `angle = stroke * attackFlash`, and the model deliberately
exports one walk band with `mast` keyed to identity so the strike stays live. So
`enemy-angry.js` does not move, every gate figure on that body stands, and there
is no re-export to churn the file through export nondeterminism. Recorded
because the first sign-off on this ruling — mine — said "the 17° re-export",
and both the model smith and the rendering lead corrected it in the direction of
the ruling costing less, not more. Measured across bearings, 17° holds every bearing 34°
holds, at 42% of the silhouette change at the dominant one — **complying cost no
bearing that reads.** Recorded because the next person facing this clause will
assume it costs them something.

Two corrections folded in, both from the division that produced the original
figures: the exposure is 47% and 1.11%, not 53% and 1.25% — `attackFlash` decays
1→0, so time above a threshold `f` is `(1 − f)·T`, not `f·T` — and the proposed
top-taper fix was withdrawn after a per-z-slice sweep put the contact on the
hub's **side** at mid-height, not over its top face. Bearing 270 fails to read
at **both** angles and is a pre-existing gap, not a cost of compliance.

**Ruled: the clause applies, and the wording is widened to match how everyone
already quotes it** — any pose the player can be shown, and part-inside-part
rather than only weapon-inside-body. The grounds are in the clause's own text:
the failure arrives "in some pose, **whatever the numbers say**", which is a
direct instruction that a passing measurement does not discharge it. The tool
walks baked frames because those were the only poses that existed when it was
written. **The instrument narrowed; the rule did not.** A body must not be able
to satisfy every gate in the pipeline and still have parts inside each other for
half of every gesture.

**A clean silhouette is a statement about severity, not a clearance.** Clause 8
mandates solids precisely because appearance-based measurement gave a false pass
once — its own text records a version that "reported 10 mm of clearance while
the haft ran through the man's chest". So the capture of whether the outline
breaks is worth having and does not settle the clause.

**Two dispositions, and the distinction is the load-bearing part.** Either
remove the overlap, or **declare** it under the exclusion the clause already
carries — parts that are *supposed* to touch, stated in code with the reason.
An exclusion is a claim about **design intent**. "Small enough" and "not
visible" are **waivers**, and this clause has no waiver.

**Constraints on whatever grows to cover posed geometry.** One source of truth
for the pose — a Blender-side gate holding its own copy of a matrix the renderer
owns is two copies that will drift, which is why `CLAUDE.md` is a pointer today;
baking the stroke extremes as gate-only frames keeps one. And it must be shown
to FAIL on the Hedger at full stroke and pass at 17°, which is clean by
construction, before it is trusted.

**This is the third instance of one pattern, not an incident.** `crownOf()`
takes `model.top` from `GLModels.expand()`, computed before any frame transform,
and buries the health bar inside posed bodies — recorded 2026-08-12, never
gated. An unkeyed group root exports as part of its parent with no error. And
this. All three are a pipeline quantity derived from the rest or baked state and
consumed by something that poses.

**2026-08-14 — The manifest gate gets a third leg: the git index. Two commits
on this branch cannot be booted by anyone who clones them.**

`d828769` and `181119c` both tag `js/gl/models/enemy-boss.js` in `index.html`.
The file was not committed until `de30b50`, two commits later. `tests/harness.js`
`readFileSync`s every entry in the page's script list, so **at those two commits
every suite dies in `boot()` before its first assertion** — run 1/106,
content 0/212, blub 0/53. Found by simulation, the expensive way: seeded a
gate run from inside that window and spent minutes believing a comment-only
change had broken 371 tests.

**Yesterday's version of this check could not see it, and the reason is the
lesson.** It compared the page's tags against files **on disk**. The model was
on disk the whole time — merely untracked. **The author's own working tree is
always green**, so this class is invisible from the machine that creates it and
breaks everybody else. That is the opposite blast radius from the unwired case,
which only ever hurts the author's own feature, and it is why the untracked half
was named in yesterday's diagnosis and still left uncovered by yesterday's fix.

So the check now reconciles **three** sources of truth, not two: the page, the
filesystem, and the git index. A tag whose target is untracked fails the build
exactly as a tag whose target is missing does.

**Where it deliberately does not fire:** run against an extraction or an archive
there is no index to consult, so the git leg is skipped and the run says so in
its output — two legs of three is not a clean gate, and a gate that quietly
degrades to a subset of itself is the failure this whole file exists to prevent.

**`--rev <sha>` answers the other question, and they are not the same gate.**
The default is *prospective* — "is what I am about to commit self-consistent?"
— and it is the one worth having, because catching the mistake before it lands
beats proving it afterwards. `--rev` is *retrospective*: "was the branch
bootable at that point?" It reads the page and the file list straight out of
git objects with `git show` and `git ls-tree`, so it needs **no checkout and no
extraction** — which matters on this machine, where a rig filled the disk to
zero free earlier in the week by extracting the repo once per run. At a commit
"present" and "tracked" are the same thing, so the retrospective form needs
only two legs where the prospective one needs three.

**The reason it exists is a blind spot in how the first version was tested.**
That version was self-tested against a throwaway repo built for the purpose,
and material you build yourself is shaped by the same assumptions as the code
it is meant to test. This branch already contained a real known-bad and a real
known-good, for free: **`d828769` and `181119c` must fail, `de30b50` must
pass.** They do. That is a control on real geometry rather than on a fixture,
and it is the difference between "my check works on my example" and "my check
works". Kaz's call, and he was right to insist.

Two path conventions bit once and are now commented in the source: `git show
rev:path` resolves **repo-root-relative** and fails without the `TD_0.5.0/`
prefix, while `git ls-tree` takes its pathspec **relative to the current
directory** and prints matches the same way. Prefix one, not the other. The
plausibility guard caught the mistake — it refused to run rather than reporting
a clean sweep off an empty file list, which is exactly what it is for.

**Swept the last 120 commits: exactly two are un-bootable, and they are the two
already known.** The branch is otherwise sound at every point in that window.
Both broke `sandbox.html` as well as `index.html`, so no suite and no sandbox
could run there.

**A gate is only as good as the tree you seeded it from.** Materialising a
commit and running the suites there is the right technique and it inherits every
defect of the commit you seeded from. Take a **control run before the treatment**:
confirm the materialised tree boots at all before attributing any failure to
your own change.

**2026-08-13 — A manifest gate: every js file on disk must be loaded by a page,
because no suite can tell you when one is not.**

`tests/harness.js` takes its script list out of `index.html`. The corollary had
never been written down anywhere and it is the half that ships defects: **a file
with no `<script>` tag is never executed by any suite.** It cannot throw, cannot
fail, cannot appear in a count. Every number the six suites print is identical
whether that file is correct, broken or deleted, so a green board says nothing
about it at all.

The Vanguard boss demonstrated it the same day. Its model was on disk, tagged by
no page, **and untracked in git** — while the `boss_fast` type was wired into
`js/enemy.js`, `js/game.js`, `tests/content.test.js` and `tests/run.js`. So the
boss was scheduled, tested and green, with nothing reaching the renderer, and a
clean checkout would have deleted the only copy. Two people found the unwired
half by hand within minutes of each other; no instrument found either half,
because no instrument was looking. Rendering fixed both in `d11be9a`.

`tools/check-script-manifest.js` is a set difference in both directions, run
against `index.html` and `sandbox.html` together — loading only from
`sandbox.html` is a deliberate documented pattern and counts as wired. **Both
directions matter and they fail differently:** a tag with no file 404s and is
found the moment anyone looks; a file with no tag is silent, and that is the one
that ships.

**Three classes, not two, because a gate that instantly reddens the board on
somebody else's old defect teaches everyone to ignore it.** Deliberate
exceptions are listed with their reasons (a v0.3.5 tombstone, a skin-pack
template, a scene loaded by a node entry point rather than a page).
Pre-existing unwired files sit in a **dated ledger** that prints loudly every
run without failing the build — currently `js/gl/blub-hp.js`,
`js/gl/siphon-enemy-fx.js` and `js/gl/siphon-ground.js`, 2 737 lines between
them, two of which are called by files that *are* loaded. They were recorded
unwired on 2026-08-12 and were still unwired a day later, which is the argument
for the check: a defect nobody's instrument can see does not get fixed by being
noticed once. Anything in neither list fails the build.

**A leftover excuse outlives the problem**, so the check also fails when an
entry in either list is no longer unwired or no longer present. Fixing a file
and leaving its excuse behind is its own defect, and the next reader believes
it.

**Self-tested against planted violations rather than trusted.** A new unwired
file, a tag pointing at nothing, and a stale exception each turn it red; and it
refuses to run at all — exit 2, not a pass — if the disk walk or the tag regex
scrapes implausibly little, because a check that can only ever say "clean" is
not a check. The planted-orphan case reproduces the Vanguard exactly.

**2026-08-13 — The title screen's strap line is gone, and the title block moved
down 23 px to take back the space it left.**

The line under the rule read *"35 waves.  6 ley-lines.  N towers.  Hold the
base."* It counted the towers in `BUILD_SLOTS` rather than the five the armoury
sells, so it under-reported the game it was advertising. The owner's ruling was
that it should be **deleted, not corrected**.

Deleting it alone would have swapped one defect for another. Measured on the
real canvas, foreground ink per world row: before the change the last inked row
above PLAY was **240** (the strap) and PLAY's first inked row is **319**, a
clear run of **78** rows. Remove the strap and leave everything where it was and
that run becomes **101** — a 1.29x hole where the design had a gap. Moving the
whole block down by the strap's own line box gives **79**, one row from what the
layout always had.

`titleY` now carries the block: the shadow is `titleY + 5` and the rule
`titleY + 39`, so the three elements move as one thing and the next person to
adjust it changes one number instead of four.

**The evidence, because a layout claim is exactly the kind that gets eyeballed.**
Foreground ink was isolated by drawing the menu and then drawing
`drawMenuBackdrop()` alone into a cleared canvas and differencing the two — the
backdrop is the same function in both passes, so it cancels, and no threshold
has to be guessed for "what colour is text". Against the real previous file
(streamed out of git at HEAD and injected whole — not a stub, not a partial
disable), the two states differ in **88,539 device pixels, confined to world
rows 141–240**, and in **0 pixels below row 300**. Title band 142–202 → 165–225,
rule 215–217 → 238–239: both exactly +23, both the same height. Every control
below is untouched to the pixel.

Two traps caught on the way, both already written down and both still worth
repeating. **Searching the source for the strap's own words matches the
post-deletion file**, because the comment recording the deletion quotes the
line verbatim; the discriminator has to be the strap's `towerCount` variable, or
better, the pixels. And **the first `drawMenu()` of a page's life differs from
every later one** by a handful of antialiased pixels — that produced a phantom
78-pixel difference in the button rows which vanished the moment the first draw
was discarded. A run-to-run null on the same code state returned exactly 0, so
the phantom looked deterministic and real until the warm-up frame was dropped.

**2026-08-13 — Waves 12, 13 and 16 trade per-body health for bodies: four
groups at half the health and 2.5x the count. Eight further waves are held.**

**Reconstructed after the fact.** `6ec794a` landed the code and the test re-pins
with no entry here. Everything below is taken from the DIFF and re-measured
against HEAD through the game's own resolvers, not from the commit message —
see the note on the held count at the end, which is why.

Diego approved `k = 2, m = 1.25, b = 1.00` on twelve mid-game waves and asked
for a playtest. Three landed.

**The rule, per group:** `health -> health / 2`, `count -> round(count x 2 x
1.25)`, applied only where `Enemy.healthOf` resolves EVEN — so the halving is
exact and no health is invented by rounding — where `count > 1`, and where the
type is not a single-purpose body. **It is two separable operations.** The SWAP
(`health / 2`, `count x 2`) is exactly income-neutral, because `count x health`
is the invariant `Enemy.bountyOf` prices against; it buys texture and nothing
else. The INFLATION — the extra x1.25 on the count — is the only part that moves
a total. There is deliberately no bounty haircut: **$9 505 of the purse is
wave-number-only rewards** ($10 105 counting the stake) and no schedule change
touches it, so inflating health would dilute spending power with no second site
to keep it honest.

**It lands on four GROUPS across three waves, not on whole waves.** Wave 12's
`swarm` (16 x 2 HP -> 40 x 1) and its stock normals (12 x 10 -> 30 x 5); wave
13's `angry` (8 x 18 -> 20 x 9); wave 16's `armored` (10 x 10 -> 25 x 5). Each
of the three OPENS with a group the rule does not touch, which is why they land
clear of the spine. Every multiplication is exact; nothing needed rounding.

**Wave 11 is the floor, and it is not a matter of taste.** `tests/run.js`
deep-equals `WAVES.slice(0, 11)` against a literal — "the introduction, up to
and including the midboss" — so wave 12 is the first wave any retune may touch.

**The totals, all six re-pinned in `tests/run.js`:**

| | before | after |
|---|---:|---:|
| scheduled bodies | 797 | 866 |
| scheduled HP | 23 697 | 23 796 |
| effective HP | 25 799 | 25 898 |
| scheduled kill bounties | $23 333 | $23 438 |
| wave-clear bonuses | $2 579 | $2 590 |
| authored purse | $36 017 | $36 133 |

**And two DERIVED figures moved that no search for those totals would have
found**, because they quote no total: the money density in the balance-math
section is `kill bounties / effective HP` and goes **0.9044 -> 0.9050**, and its
declared-health counterpart in the next clause is `kill bounties / scheduled HP`
and goes **0.9846 -> 0.9850**. The first was stated in three places.

**Two ratios are called "money density" and they are not the same number.** The
balance tooling reports **1.3961 -> 1.3952**, which is *purse* over effective HP
— it carries the schedule-blind $10 105. `AGENTS.md` means *kill bounties* over
effective HP. Both are now pinned by name in `curve-verify.js`.

**The per-type bounty ratios did NOT move**, and the passage now says why: they
are computed at each type's BASE health, so they are properties of `Enemy.TYPES`
that a wave `health` override cannot touch — `Enemy.bountyOf` scales bounty in
the same proportion. Checked across all 21 types; none changed.

**Why eight are held, and it is the finding worth keeping.** `interval` is
untouched, so a retuned group deploys 2.5x the bodies at the old spacing. Driven
through the real loop with no towers, peak effective health ON THE ROAD across
the twelve fell **10 070 -> 8 482, -15.8%, while authored health rose 25%** —
eight of twelve got LIGHTER at their peak moment, and the twelve ran 3.9 minutes
longer. An analytic model predicted +18% by assuming groups stay co-resident;
that stops being true once a wave deploys over 87 s against a 46 s transit, and
only the loop showed it. Second ground: `tests/run.js` pins each of the twenty
original v0.4.4 waves to its opening group's exact count, interval and type, and
seven of the held waves are old-wave openers. That table is the only surviving
record of a curve somebody actually measured — nothing simulated currently
reaches past wave 20 — so it is held rather than re-pinned.

**Twelve were approved. Three landed — 12, 13 and 16, the waves a player
currently reaches. Eight were held: 19, 21, 22, 23, 27, 31, 32 and 33**, all
above the wave-18 camo wall that no simulated run passes, because the change
lowers peak load and no measurement of these waves was available to confirm the
effect. **One, wave 17, was never eligible:** all three of its groups resolve to
odd health, so the halving rule cannot reach it.

**The commit message says "nine are held" and then names eight. The correct
figure is eight held and one ineligible** — confirmed from the diff and by an
independent measurement of the schedule before the patch was cut, which found
eleven waves changed and wave 17 byte-identical. The message is pushed and
cannot be repaired, so this entry is the correction.

**Wave 12 ships WITH that regression, deliberately** — peak load 222 -> 164,
deploying over 90 s instead of 70 — because it is early enough that a player
reports it rather than a simulator inferring it.

**Widening the scope later means dividing each retuned group's `interval` by
2.5 in the same change.** That restores the deployment window and turns the
-15.8% into +25%. Anyone widening without it repeats the regression eight more
times.

Six suites at the recorded floor on the committed content: run 107/0, content
207/5 with the same five names, beam 45/0, blub 53/0, long-range-dps 72/0,
sandbox smoke passed.

**One note on the population entry below.** Its ceiling measurement was taken
against the TWELVE-wave draft of this retune ("16 RETUNED markers"), which never
shipped — the working tree now carries four markers across three waves. Its
conclusion survives, since the global peak stays wave 30 and none of the three
landed waves is wave 30, but it holds a fortiori for a subset and was not
re-taken for it.

**2026-08-13 — The population question answered by measurement: 400–500
ordinary enemies costs ~3 ms of a 16.67 ms frame, the failure point is around
3,000 bodies, and the renderer is not what would break first.**

Diego retired the triangle budget and replaced it with a population
constraint — *"even with 400-500 of those enemies on screen the game must run
cleanly"*. Nobody had data past 107 bodies. New rig,
`visual-pass/probe/pop-*.js`, outside the game tree; it changes no game file
and is not referenced by `index.html`.

**Answer: yes, with roughly 5x headroom.** 500 all-meshed damaged bodies cost
**3.10 ms/frame at 1x and 3.78 ms at 3x** sustained, against a 16.67 ms budget.
Frame time is linear in body count at **5.8 µs per body**, and 16.67 ms is not
reached until **~2,900–3,000 bodies**. On a heavily loaded machine the same
board reads 7.2/7.8 ms and the ceiling falls to ~1,150 — still 2.3x past the
constraint, so the verdict survives the whole measured load band.

**Simulation is not the limit and is not close to it.** kaz's stability model
`T = R / (1 − speed·60·S)` cliffs at `S` = 5.56 ms/step at 3x. Measured `S` is
**66 µs/step at 500 bodies** — 84x under — and still only 0.29 ms at 2,000. The
3x denominator is 0.988 at 500 bodies and 0.959 at 2,000, so simulation
contributes 1–4% of amplification and **the cost is essentially all render.**

**Draw calls are the scaling term; triangles remain free.** 6.16 GL calls per
meshed body, 0.70 µs per call, flat across 0.1M–9.7M triangles/frame. The
fallback sphere is 1 call and **1.55 µs/body against 5.76 for a meshed body** —
so meshing the rest of the roster is a 3.7x per-body cost, and still fits.

**The 2D overlay is NOT the wall, with one exception that is much worse than
the wall was expected to be.** Health bars — the term everyone expected to
dominate — cost **~1 µs/body** (0.3–0.4 ms at 400). The **camo ground ring
costs ~15 µs/body**, 15x more: it is 44 `project()` calls plus a dashed stroke
per camo body per frame, and `isCamo` separately makes the GL pass draw that
body **twice**. At 400 camo bodies the overlay is **68% of the frame**. Today
the schedule peaks at 28 camo bodies and it costs ~0.3 ms; at population scale
it is the first thing that breaks. `gl-world.js`'s own comment already says the
camo second pass "costs one extra walk of a list that is at most a few dozen
long" — that premise is what expires at 400.

**Towers are a fixed offset, not a scaling term.** 12 fully upgraded towers
firing add **2.5–3.9 ms of overlay, flat from 100 to 500 bodies** — a
per-tower cost, not a per-body one. It raises the intercept and does not move
the slope.

**What the schedule can actually reach: 115 bodies**, wave 30, the Nursery —
3.5x under the constraint. Measured per-wave against the **uncommitted**
`EASY_WAVES` retune in the working tree (`count → round(count × 2 × 1.25)` on
twelve waves), dated by content — 16 `RETUNED` markers in the served file, 0 at
HEAD — because a served working tree renders what is saved, not what is
committed. **The retune does not move the ceiling**: it lifts several waves'
scheduled totals to 88–95 but leaves `interval` alone, so they deploy over a
longer window and peak at 50–80; the global peak stays wave 30, which the
retune excludes.

Method notes that cost something to learn, all now in the rig's header
comments: SwiftShader is right for a pixel null control and **wrong for
timing** (software raster prices the exact axis the answer turns on); a 1×1
`readPixels` costs 8–24 ms of round-trip latency, so per-frame fencing swamps
what it measures; `performance.now()` is quantised to 0.1 ms here, so a single
`update()` step reads as a median of 0 and must be timed in batches.

**And the one that bounds every timing number this project will ever take: a
frame-time measurement is not repeatable in parallel with any other capture
work.** The same sweep, same code, same board ranged **2.5x** across one
afternoon — 400 bodies at 2.947 ms and later at 9.862 ms — because 33–52
foreign `chrome.exe` were alive, plus **101 leaked by this rig itself**. The
rig now counts browser processes at start and end and splits its own from
foreign; it immediately caught that a deliberately "clean" re-run was the most
contaminated of the set. Ratios within one launch are load-invariant (the
firing-board multiplier reproduces at 1.616 and 1.606 while the absolutes
behind it differ by 1.6x); absolutes are not. Quote the foreign browser count
beside any millisecond figure.

Four defects in the rig were caught before they reached a table, and the worst
is worth repeating: making bodies unkillable so the board would not clear meant
one leak charged the base 6e8 HP, `gameOver` latched, `update()` returned on
its second line — and **the renderer went on drawing 400 bodies at an entirely
believable frame time with the simulation at zero.** Both of that run's proof
metrics reported it and both read as "the towers are not firing"; one of them,
`tower.damageDealt`, is declared on `Tower` and never incremented by any
shipped tower, so it could not have been non-zero. Found independently and
concurrently by a second engineer on the same harness.

**2026-08-13 — The seven chassis bodies now SOLVE their swing angle against the
stride. A falls from up to 5.098 board px to 0.294–0.385, and not one triangle
moved.**

**CORRECTION TO THE 39f1f5c ENTRY, WHICH WAS WRONG.** That entry said the roster
shared one stale `swing_deg = 28.0`. It does not. 28.0 is only the chassis
DEFAULT; seven of the eight callers override it and they span **14 to 34
degrees**: Drudge 18, Skimmer 34, Tun 20, Hedger 22, Cooper 28, Courier 26,
Tender 18, Dray 14. I read the default and never counted the call sites.

**The finding underneath is stronger than the version it replaces.** These
angles were hand-tuned per body, by eye, and every one of them misses. So the
defect is not one stale constant copied around — it is that **the angle was
never once compared to the distance the body travels**, and eight independent
tunings all missed a target none of them could see. That is unobservability, not
carelessness, and the next person would have missed it too.

**THE MECHANISM.** `animate_walk_grouped` takes `solve_swing=True` by default.
The passed `SWING_DEG` becomes a bracket seed, and the function bisects the
angle on EVALUATED geometry until the planted sole's backward sweep matches
`(P-1)/frames` of a cycle — **transitions, not samples**: P planted frames give
P−1 transitions, and off-by-one here is a whole frame-step. Bisection lays the
full cycle per candidate rather than assuming `L·sin θ`, because
`_set_sole_height` translates the leg after the rotation and the body rolls.

One shared edit plus one hold-out line, so no hand-tuned angle survives by
accident.

| model | tri | multiset | A px before → after | B px | plan/ring |
|---|---|---|---|---|---|
| `enemy-armored` | 3520 | identical | 3.965 → **0.294** | 3.754 | 70% → 80% |
| `enemy-fast` | 3508 | identical | 1.901 → **0.280** | 3.575 | 85% → 79% |
| `enemy-slow` | 2584 | identical | 3.935 → **0.358** | 3.575 | 89% → 89% |
| `enemy-angry` | 4072 | identical | 3.164 → **0.385** | 2.979 | 162% → 162% |
| `enemy-camo_normal` | 3928 | identical | 0.277 → **0.280** | 3.575 | 79% → 79% |
| `enemy-shielded` | 4552 | identical | 0.985 → **0.322** | 4.111 | 85% → 85% |
| `enemy-shieldbearer` | 6452 | identical | 5.098 → **0.378** | 4.826 | 89% → **103%** |
| `enemy-colossus` | 3672 | identical | 19.867 → 19.867 | 7.508 | 105% | *held* |
| `enemy-normal` | — | not re-exported | 0.277 | 3.575 | 76% | *control* |

**EVERY TRIANGLE MULTISET IS IDENTICAL**, compared per body as a sorted multiset
of vertex-sorted triangles at export precision — not by count and not by hash,
since re-exports are not byte-stable on this pipeline. Only frame matrices moved.

**B IS UNCHANGED ON EVERY BODY AND THAT IS NOT A DISAPPOINTMENT, IT IS THE
POINT.** A and B have different fixes. This commit touches A only; B is set by
pose-hold time and its lever is the frame count, which is the separate frame
raise. **The Dray still slides visibly** — its 19.867 px of A is untouched by
design and its 7.508 px of B is the largest on the board.

**`enemy-shieldbearer` HAS CROSSED ITS RING, 89% → 103%, AND THIS IS THE
PREDICTED COST.** A foot planted for duty `d` must travel back `d × 0.899281` u;
a sliding gait is *cheaper in plan* than a correct one, so removing slip
necessarily spends extent. **No frame count changed in this commit, so none of
these plan movements are a sampling artefact** — they are the real new gait.
`enemy-armored` also rose, 70% → 80%, and stayed inside. Only the Tender
crossed, and it now draws its frost and hover rings inside its own silhouette.
That is a genuine regression traded for a genuine fix and it needs an art call,
not a threshold change.

**THE RESIDUAL IS ~0.3 px AND IS STRUCTURAL.** `walk_phases` says it is a
triangle and not a sine so that "the planted foot must sweep backwards in EQUAL
INCREMENTS". That intent is not delivered: the phase is linear in the frame but
the contact goes as `L·sin(swing × phase)`, so increments bunch toward the ends
of the plant — the exact fault the docstring attributes to a sine. The amplitude
solve pins the first and last planted frames; the curvature between them is what
remains. It is bounded by the curvature of a sine over one plant and **does not
grow with body size**.

A per-frame angle solve was attempted and **made it worse — 0.294 → 3.028 px on
the Drudge**, with interior frames landing ~0.085 u the wrong side of targets
whose arithmetic was verified correct by hand. It is reverted, and the failure
is recorded in place so nobody re-attempts it without an instrument on the
intermediate state.

**Also in this commit: `check-gait-slip.js` no longer counts `crank` as a
foot.** `enemy-angry`'s crank is a wheel hanging at z = 0.0180 that never
touches the road. It was being promoted to `worst foot` with 8.622 px in the
summary A column where the Hedger's legs read 3.164, and **a gate reads the
summary** — so the Hedger would have failed on a part with no ground contact.
Contact groups are now tested against the ground plane ABSOLUTELY (z ≤ 0.005),
not relative to the lowest group on the body: `enemy-hive`'s six feet sit
between −0.0057 and −0.0000, so a relative band tight enough to reject the crank
rejects four real feet. Excluded groups are **reported by name with their
height**, never dropped silently, so a genuinely missing foot cannot hide inside
the filter. Proved in both directions: the Hedger now passes on its legs at
3.164 and the tool still fails `enemy-hive` at 12.881 and `enemy-colossus` at
19.867.

**2026-08-13 — `gait_solve.contact_x` had the material-point bug it was written
to avoid. Found by the Vanguard build, in my own module, one commit after the
rule was written down.**

`contact_x` selected the contact corners by **world z** — *"the corners nearest
the ground right now"*, the obvious definition. A foot on a rotating hip ROLLS,
so the world-lowest corners are the heel edge at one end of the plant and the
toe edge at the other: the function silently changed **which material point it
tracked** half way through a solve. The two edges differ by
`half_length * cos(theta)`, which is **even in theta**, so no swing angle can
cancel it — the solver would converge, report success, and have solved the
wrong quantity.

This is the same artefact that made three people measure the Gleaner's planted
sweep as 44.6%, 55.3% and 98.6% of requirement on the same file, and it was
sitting in the solver written to remove that class of error.

**Fixed by selecting in LOCAL z and measuring in world x.** Local selection
picks a fixed set of material points once, whatever the pose; averaging their
world x tracks the sole CENTRE, which is the same quantity
`tools/check-gait-slip.js` reports — so the pre-export solve and the
post-export gate now measure the same thing rather than two things that happen
to be close.

**Why the original test passed: the synthetic foot was 0.08 u long.** Far too
short for a roll to show. The regression test now uses a **0.30 u** foot that
genuinely rolls, and additionally asserts that the selected local sole set has
**exactly one distinct membership across the whole plant** — the property that
was silently false before. Residual 0.000017383 u = **0.00105 board px** at
`sizeScale` 1.9.

**A negative control that cannot fail on an axis is not a control on that
axis.** The module had two negative controls and neither could see this,
because both used the same undersized foot.

Also: `enemy-boss_fast` added to `SIZE_SCALE` in `check-gait-slip.js`, so the
Vanguard is quoted at 1.9 rather than silently at 1 — a 1.9x understatement of
every slip figure for that body.

**2026-08-13 — The contact-measure rule, learned the hard way: a contact
measure must track a MATERIAL point, and the natural definition is the wrong
one.**

Three people measured the Gleaner's planted sweep and got 44.6%, 55.3% and
98.6% of requirement. The low answers were not arithmetic slips — they came from
the most obvious definition available, *"the lowest vertices, this frame"*.

**A foot ROLLS, so the set of lowest vertices is a geometric LOCUS that jumps
between different MATERIAL points as it rolls.** On `enemy-normal`'s `leg_l` the
changeover is total: the sole goes flat at frames 0 and 4 (26 coplanar vertices
at the minimum) and stands on a single corner elsewhere — rest x +0.125 through
the toe half, −0.035 through the heel half. Frame 0 to frame 1 shares **zero of
26** vertices; so does frame 4 to frame 5. The displacement of that locus is not
the displacement of anything physical.

Three measures, same file, same group, same window {6,7,0,1}:

| measure | sweep | of requirement | |
|---|---|---|---|
| mean of the lowest vertices per frame | 0.18643 u | 55.3% | **wrong** |
| fixed sole set, chosen once at rest | 0.33251 u | 98.6% | right |
| one material vertex (heel 2856) | 0.34252 u | 101.6% | right |

**The two material routes bracket 100% from either side.** The locus measure
under-reports by about 45% and reads as a body that slides — a **false alarm,
not a false pass**, which is the harder kind to disbelieve because it looks like
diligence.

`check-gait-slip.js` was already correct here: its `sole` is computed once from
the REST positions and then tracked, so it is a fixed set of material points.
The per-frame minimum z is used only to decide whether the foot is DOWN, never
where it IS. That was correct by construction and undocumented, which is exactly
the kind of correctness that dies when someone reimplements it — so the rule is
now written into the file's header, and the tool additionally reports
`worstLocusOverlap`, the smallest membership overlap between consecutive frames.
It reads **0.000** on `enemy-normal`, so anyone measuring the locus is told.

**And the premise this corrects: the Gleaner is not a defect.** At 98.6-101.6%
of requirement its slip is 0.168-0.277 board px, a fifth of a screen pixel.
*"No walker's foot is exactly still"* and *"the roster slides"* are very
different claims and only the first is true. The real defects are the heavies.

**2026-08-13 — `tools/blender/gait_solve.py`: solve the swing angle against the
stride instead of hand-picking it. Measured residual 0.00143 board px.**

The companion to `tools/check-gait-slip.js`. That tool measures the slide after
the fact; this one removes it before the export. A planted contact must travel
backward along model local +X by `duty * 0.899281` u across its plant, so state
where the contact must be per frame and find the angle that puts it there —
rather than the chassis's approach of fixing `swing_deg = 28.0` and discovering
the error afterwards.

**It solves the ANGLE, not a translation.** Translating a leg root in x would
also land the contact, and it would slide the leg horizontally out of its own
hip. The rotation is the joint the body actually has.

**Bisection on EVALUATED geometry**, the same rule `enemy_chassis._foot_measure`
follows — step the scene to the frame and ask Blender where the contact is, so
no analytic model of the leg exists to go stale when the part is reshaped.
Bisection and not a secant on purpose: which corner of a part touches the ground
changes as the leg rolls, so contact-x is piecewise linear in the angle and a
secant step across one of those corners diverges. Bisection needs only
monotonicity.

**Proved able to fail before being trusted, under Blender, on synthetic legs.**
Two pivots of different heights, 0.90 and 0.55 u reach, each solved over a
64-frame plant out of 128 that WRAPS past the end of the cycle (frames 96..31):

| reach | first-guess half-swing | residual | at sizeScale 2.4 |
|---|---|---|---|
| 0.90 u | 14.235° | 0.000018739 u | **0.00143 board px** |
| 0.55 u | 23.727° | 0.000018831 u | **0.00143 board px** |

**The residual is the same for both, and that is the entire point** — it is set
by the solver tolerance, not by the geometry, which is exactly what the fixed
28° was not. Against the shipped roster's 0.277 px (best) and 19.867 px (worst)
this is three to four orders of magnitude down.

Two negative controls, both of which must fail and do. A 0.12 u reach — the
Dray's — is REFUSED rather than given a plausible angle: *"contact cannot reach
x=0.22131 at frame 97: the bracket spans x -0.09859..0.09859"*, naming the
reachable span so the reader knows to change the geometry and not the angle.
And `verify_plant` rejects a deliberately truncated plant at a tolerance it
cannot meet. `swing_angle_for` returns `None` rather than a number when the
geometry cannot cover the span at any angle.

`verify_plant` is separate from the solver deliberately: the solver's own
convergence check can only report that it hit the target it was given, never
that the target was right. Verification re-walks the finished keyframes
including the cycle wrap, which the solver never sees — and the check that
actually counts is `tools/check-gait-slip.js` run on the EXPORTED file, because
only that reads what ships.

The arithmetic half imports without `bpy` and can be run and tested outside
Blender.

**2026-08-13 — `tools/check-gait-slip.js`: does a planted foot stay on the road?
No shipped walker is at zero, and the reason is one hard-coded angle.**

The walk is distance-driven. `gl-world.js` advances the frame index by
`progress / stride`, `stride = radiusPx * 2.6 = 28.6 * sizeScale` board px, and
`drawActor` scales the model by `unitsToPx * sizeScale` with `unitsToPx =
31.8032` on all 109 models in the library. So **one full walk cycle is exactly
`28.6 / 31.8032 = 0.899281` MODEL UNITS of travel — for every body, at every
`sizeScale`, at every speed.** A planted foot must travel backward along
**model local +X** (the heading; `GLMath.modelYaw` maps local +X onto
`atan2(heading.y, heading.x)`) by exactly that much per cycle, or the body
slides. Nothing in this pipeline had ever checked it.

**Two components, two different fixes, reported separately.**

- **A — gait error.** Peak-to-peak of the planted contact's world track across
  its plant, wrap included. Authored, rig-fixable, target zero.
- **B — quantization sawtooth.** `bandFrame` FLOORS (`gl-world.js:1565`), so the
  pose is held while the body keeps translating. A perfectly authored foot
  still creeps forward by `stride / N` and snaps back once per frame. The
  amplitude is `stride / N` no matter how good the gait is, and **the only
  lever on it is N.**

**The instrument was proved able to fail before it was trusted.** Four
synthetic rigs, one planted foot each: authored backward travel of exactly
`S/N` per frame reads **A = 0.00000000**; half of it reads 7.150 px; none of it
reads 14.300 px; double reads 14.300 px the other way. 14.300 is exactly four
frame-steps of `stride/N` at `sizeScale` 1, so the scale is calibrated and not
merely monotone. It also recovers `enemy_chassis.support_left_frames()`'s own
support windows without being told them.

**The shipped roster, at each type's own `sizeScale`, board px.** Not one body
reads zero:

| model (lore name) | size | N | A px | B px | A+B px |
|---|---|---|---|---|---|
| `enemy-normal` (Gleaner) | 1.00 | 8 | 0.277 | 3.575 | 3.852 |
| `enemy-camo_normal` (Cooper) | 1.00 | 8 | 0.277 | 3.575 | 3.852 |
| `enemy-shielded` (Courier) | 1.15 | 8 | 0.985 | 4.111 | 5.096 |
| `enemy-fast` (Skimmer) | 1.00 | 8 | 1.901 | 3.575 | 5.476 |
| `enemy-slow` (Tun) | 1.00 | 8 | 3.935 | 3.575 | 7.510 |
| `enemy-armored` (Drudge) | 1.05 | 8 | 3.965 | 3.754 | 7.719 |
| `enemy-brute` | 1.50 | 8 | 4.192 | 5.363 | 9.555 |
| `enemy-shieldbearer` (Tender) | 1.35 | 8 | 5.098 | 4.826 | 9.925 |
| `enemy-swarm` | 0.55 | 8 | 5.346 | 1.966 | 7.312 |
| `enemy-angry` (Hedger) | 1.25 | 12 | 3.164 legs / 8.622 crank | 2.979 | 11.602 |
| `enemy-hive` | 1.60 | 8 | 12.881 | 5.720 | 18.601 |
| `enemy-colossus` (Dray) | 2.10 | 8 | 19.867 | 7.508 | 27.375 |

`enemy-flying` is excluded from the slip claim and flagged by the tool: a
flier's band is driven by `boardClock * HOVER_HZ`, not by distance, so it has
no planted foot and A is not defined for it. The Hedger's worst contact is its
`crank`, a wheel with a two-frame contact, not a foot; its legs read 3.164.

**The cause is one number that was never tied to the stride.**
`enemy_chassis.animate_walk_grouped` authors the plant as a fixed hip rotation,
`swing_deg = 28.0`, so a planted foot's backward travel is
`L * (sin θ + sin θ/2)` where `L` is hip height above the sole — **a function
of leg length, and of nothing else.** Against the required `3/8 * 0.899281 =
0.3372 u`:

| body | hip z | predicted travel | shortfall | measured A |
|---|---|---|---|---|
| `enemy-normal` | 0.480 | 0.3415 | 0.0042 | 0.0087 |
| `enemy-slow` | 0.425 | 0.3023 | 0.0349 | 0.1237 |
| `enemy-brute` | 0.567 | 0.4026 | 0.0654 (over) | 0.0879 |
| `enemy-colossus` | 0.120 | 0.0854 | 0.2519 | 0.2975 |

So **the Gleaner is right by coincidence**: 28° happens to solve the stride to
within 1.3% for a 0.480 u hip. Every body that changed its leg length inherited
the same 28° and slid by the difference. The predictor is a mechanism, not a
formula to tune against — it explains the extremes and the ordering, and
`enemy-armored` departs from it, so a body's own measurement still governs.

**Addendum, same day — the tool also reports PLAN EXTENT, because a zero-slip
gait costs plan extent and the biggest bodies have the least of it.**

The frost and camo rings sit at `radiusPx() + 4` and the hover ring at `+ 9`
(`js/enemy.js:1134-1139`), in ABSOLUTE board px. The body scales with
`sizeScale`; that pad does not. **So the budget shrinks as a body grows**, and
`boss` at 2.4 has the least room of anything on the board. A foot planted for a
fraction `d` of the cycle must travel back `d * 0.899281` u, so **zero slip
necessarily spends more plan extent than sliding does** — the chassis's
under-travel is not only its defect, it is also how every shipped body has been
staying inside its own rings.

**Two metrics, and they disagree about which body is worst.** Fore/aft extent
against ring DIAMETER is the budget the gait spends. Max plan RADIUS at any
bearing against ring RADIUS is the test the ring can actually fail, since the
ring is a circle and a vertex is outside it or is not. Per frame in both cases,
not over the swept union — the ring is drawn around the pose the body is in.

| model | size | fore/aft px | % of dia | max radius px | % of radius |
|---|---|---|---|---|---|
| `enemy-armored` | 1.05 | 18.2 | 59% | 10.9 | 70% |
| `enemy-normal` | 1.00 | 19.0 | 63% | 11.5 | 76% |
| `enemy-camo_normal` | 1.00 | 19.0 | 63% | 11.8 | 79% |
| `enemy-shielded` | 1.15 | 23.1 | 69% | 14.2 | 85% |
| `enemy-fast` | 1.00 | 21.4 | 71% | 12.8 | 85% |
| `enemy-shieldbearer` | 1.35 | 27.5 | 73% | 16.8 | 89% |
| `enemy-slow` | 1.00 | 22.2 | 74% | 13.4 | 89% |
| `enemy-swarm` | 0.55 | 13.6 | 68% | 9.5 | 95% |
| `enemy-colossus` | 2.10 | 44.3 | 82% | 28.4 | 105% |
| `enemy-angry` | 1.25 | 35.9 | 101% | 28.8 | 162% |
| `enemy-hive` | 1.60 | 75.2 | 174% | 40.9 | 189% |
| `enemy-brute` | 1.50 | 51.9 | 127% | 41.6 | 203% |

**`enemy-brute` and `enemy-hive` swap places between the two columns** — hive is
worse fore/aft, brute is worse in the round — so quoting one without naming it
picks the wrong worst body. Overflow is already routine on the large bodies;
`enemy-colossus` at 105% is the only big one near its ring. The consequence of
exceeding is that the hover and frost rings draw INSIDE the silhouette, so
selecting the body and seeing it slowed both stop reading.

For a body at `sizeScale` 2.4 the ring radius is 30.4 board px = 0.39828 u, so a
symmetric gait at duty `d` with fore/aft contact length `c` needs
`d * 0.899281 + c <= 0.79656` u to stay inside — at duty 0.6 that leaves
**0.257 u, or 19.6 board px, of contact length.**

`node tools/check-gait-slip.js [--scale S] [--json] [--verbose] [model ...]`.
With no arguments it sweeps every `js/gl/models/enemy-*.js` at each type's real
`sizeScale`. It reads a built `.js` file only — no Blender, no browser. Note
that `first`/`count` in `groups[]` are **vertex** indices; reading them as
triangle indices lands every group matrix on the wrong third of the mesh.

**2026-08-13 — The Vanguard (`boss_fast`) gets a model, and the model gets a
`<script>` tag. It had neither a tag nor a git entry, and each hid the other.**

The first of the two bosses Diego released for creation. `enemy-boss_fast.js` —
**3,248 triangles, 3 groups, `sizeScale` 1.90.** Legs are two vertical
triangular blades, **apex DOWN**, raked so the bulk overhangs a contact point
that sits *behind* the hip pin: mass ahead of its feet as a coordinate rather
than as a mood. That is Diego's *"2 big moving triangles as legs, perpendicular
to the ground"* inverted for this body, which keeps his primitive on both
bosses — the Tyrant is the same shape mirrored in z — rather than spending it
on one.

**Measured, gated, and it is the best-walking body in the game.** Authored
gait error **A = 0.180 board px (0.00298 model units)** — the lowest on the
board, below `enemy-normal`'s 0.277. `check-model-top` **ok at the full +10.0
margin** (crown 91.8 board px). Plan extent **77% of its ring**, comfortably
inside, because a point contact adds no sole length to the swing.

**It shipped unwired and untracked, and this is the part worth keeping.**
`js/gl/models/` held **110 files against 109 `<script>` tags in `index.html`**,
and the single gap was the new boss; it was also the only untracked file under
`js/`, so a clean checkout would have deleted it. Found independently and
within minutes by rendering and by quality.

**No suite could have caught either half, and the reason generalises: the
suites take their script list FROM `index.html`.** A model absent from
`index.html` is not merely unrendered under test — it is **never executed**. It
cannot throw, cannot fail, and cannot appear in any count. Every suite stays
green whether the file is correct, broken, or deleted. **"The suites pass" is
therefore not evidence that a new model loads.** Treat the `<script>` tag as
part of the model and add it in the same commit; the set difference between
`js/gl/models/*.js` and the tags in `index.html` is the only thing that checks
it, and it should be empty.

The tag is added to `sandbox.html` too, as every other model is.

**2026-08-13 — The debug cash panel is deleted. The sandbox is the testing
surface, and its Max Field command moved out of the dying file.**

At the owner's instruction: *"That debug cheat panel can go, we have the sandbox
which gives everything we need to test towers and enemies."* It sat on the first
screen a player sees.

**Deleted, not hidden.** `js/debug-cash.js` is gone from the tree and no page
loads it. Removed with it: the floating cash box, the Give/Set/+$50/+$500/+$5000
buttons, the Reset-to-`STARTING_CASH` button, and the `window.addEventListener
("load", ...)` that built them. `index.html` lost its `<script>` line.

**What survived and where it went.** The panel also carried the shared Max Field
command — force every placed tower to exact A2/B5, fire its abilities and leave
AUTO on — and that is the sandbox's, not the game's. It moved verbatim to
`js/sandbox/sandbox-max-field.js` and is exposed as `window.SandboxMaxField`
(was `window.DebugMaxField`). `sandbox.html` loads it; `index.html` does not.

**That load site is now the whole guard, and it is stronger than the naming
convention it replaces.** `tests/harness.js` skips `js/debug-*.js` by filename,
which only works for a file `index.html` names. Loading from `sandbox.html`
instead keeps a testing aid out of the shipping page *and* out of the harness by
construction, with nothing to remember. The `debug-` prefix skip at
`tests/harness.js:35` still stands for anything that must load from
`index.html`.

**The check that proves it is gone rather than merely unreferenced, and it
failed before this change.** `tests/sandbox.smoke.js` counts the `load`
listeners registered when the sandbox page boots. It asserted **3** — game,
debug panel, sandbox — and the deletion took it to **2**, which is a red test,
not a silent pass. Updated to 2 with the reason written beside it, so a
re-introduced panel that registers a listener turns it red again. The new file
registers no listener at all and only exposes a function.

Suites after: `run.js` 107/0, `content.test.js` 207/5 (its standing baseline),
`blub` 53/0, `beam` 45/0, `long-range-dps` 72/0, both smoke tests passing —
including *"the sandbox MAX FIELD button makes every tower exact A2/B5"* and
*"its three active abilities fire immediately and stay AUTO"*, which is the
evidence that the move did not break the command.

Two stale prose references followed the file out: `js/sandbox/sandbox.js` and
`js/scene/long-range-dps-scene.js` both cited `debug-cash.js` as the precedent
for keeping a testing aid's DOM out of the render loop. The rule is house
standard on its own and no longer needs to point at a deleted file.

**2026-08-13 — `tools/blender/check_penetration.py`: the interpenetration gate
clause 8 has always required and only one model ever had. It finds a real defect
in the Tender, shipped the same day.**

`visual-pass/model-review.js` says in its own header that it has no
interpenetration test; `enemy-angry` shipped from `e015ef5` with the crank collar
through the arm past every green gate; `tower_warbringer.penetration()` was the
only body in the project that ever ran one. This generalises the check the Dray
was built against into a tool that covers every module implementing
`export_build()`, discovered from the directory rather than listed.

**FINDING — `enemy-shieldbearer` (the Tender) walks its own feet through each
other.** `foot_0` and `foot_2` (front and rear, same side) overlap **0.0947 u at
frame 3**, and `foot_1`/`foot_3` identically at frame 7. Reproduced from the
module's own constants to four decimals: the leg rows sit at x = ±0.09, so the
fore/aft pitch is **0.180 — exactly the foot's own length**, and the two feet
ABUT at rest with zero to spare. They are in opposite trot groups, so any swing
closes them; at full stride their centres are 0.0966 apart while their
half-extents sum to 0.1913. That is **1.4 to 2.5 screen px** depending on
bearing, at sizeScale 1.35. Not fixed here — it is a shipped body and the fix is
a re-export, so it is reported rather than taken.

## What the tool does, and the four things it is built on

- **Per PART, never per group.** A group-level box check reports overlap on
  essentially every pair and gives confidence instead of coverage. That was
  tried here before.
- **Declared contacts live in the body module**, as `PENETRATION_CONTACTS`
  triples with a REASON — clause 8's "state why in the code". A module that
  declares nothing is reported as **undeclared, not clean**.
- **Limb-internal pairs are exempt structurally, not by naming.** Parts sharing
  an animated limb root are one rigid solid. A limb root is identified as an
  animated node that itself rides on another animated node, so no convention is
  needed. The BODY root is deliberately excluded from that exemption — it is
  where a drum meets a rail, and exempting it would have hidden a Dray defect.
- **The report is sorted worst-first and says so in its own banner**, because
  reading the tail of a severity-sorted list is how the Dray's foot collision
  survived a first look.

**The split that makes an undeclared body readable: MOVING pairs versus STATIC
pairs.** Two parts on the same animated root are rigid with respect to each
other, so their overlap is identical on every frame and is nearly always
construction — a band round a torso, a lens in its ring. Two parts on DIFFERENT
roots swing through each other, and that is the class the Hedger's collar
belonged to and the class the Tender's feet belong to. Without that split a body
with no contact list prints a hundred lines of its own welds.

**It is proved able to fail.** `--selftest` confirms the body clean, then
translates one part bodily into another and requires the same code to report
that pair; it fails loudly if it does not. A gate nobody has seen red is not
evidence.

**Roster run, all eight bodies with an `export_build()`** — moving / static
undeclared pairs: cooper 51/72, courier 82/105, **dray 0/0 (declared, CLEAN)**,
drudge 18/63, hedger 46/80, skimmer 52/73, tender 40/142, tun 58/65. **Only the
Dray declares its contacts**, so every other list is a starting point rather
than a defect list, and most of what is in them is joints. The ones that are not
joint-shaped and want their owner's eye: the Tender's feet above, the Tun's
`drum_body`/`repair_cuff` at 0.1330, and the Drudge's `leg_l_shin`/`sheath_hip`
at 0.1239.

**And a caveat that has to travel with the numbers:** an AABB pass over-reports
under rotation, which is the right direction to fail but means a hit on a long
thin member tilted away from the axes may be its bounding box rather than its
solid. The Tender's `leg_0_shin`/`leg_2_shin` at 0.0884 is probably exactly
that; its feet at 0.0947 are not, because a foot's box inflates only 6% at 18
degrees and the overlap is half the foot.

**2026-08-13 — The Dray: the first six-legged body, and the first whose hold is
not a cargo cage.** `enemy-colossus`, 3,672 triangles, 8 frames, built on
`enemy_chassis.py` at CHASSIS_VERSION 1 with no change to any geometry it emits.

Six legs are an ALTERNATING TRIPOD, which is TWO antiphase groups — exactly
what `walk_phases` and `support_left_frames` already describe — so
`animate_walk_grouped` carried a hexapod with no new cycle arithmetic, as its
own docstring predicted. The tripods `(leg_0, leg_3, leg_4)` and
`(leg_1, leg_2, leg_5)` are the gait's contract: renumber the legs without
changing the groups and the body shuffles both sides together, still walks,
still plants, and looks wrong in a way no gate catches. Feet are `foot_0`..
`foot_5` because the sole solver resolves names through `bpy.data.objects`, a
GLOBAL lookup, and six feet named alike would silently solve five of them
against one object.

NO CARGO CAGE, ruled rather than omitted: a body carries the sealed cage unless
the body IS the container, and the card makes the Dray "a container that was
given the smallest frame that would move it". The drum is a new part in
`enemy_dray.py`; `chassis.cargo_cage` was not widened.

THE CHASSIS COUPLING IS NOT ONE NUMBER, and the header that said it was has now
been wrong three times — six, then six-still (having missed the Tender), and
the derive command it offered instead matched the file containing it, so it
over-reported by exactly one, the same size as the errors it existed to catch.
Corrected: EIGHT bodies import the chassis, a change to `materials()` or
`animate_walk_grouped()` reaches all eight, and a change to any sub-assembly
reaches SEVEN — because the Dray calls no chassis geometry at all.

## Three things measured on this body that generalise

**A ROLL ADDS TO THE PLAN EXTENT, IT DOES NOT SHRINK IT.**
`animate_walk_grouped` rolls about the body root, which stands at z = 0 on the
GROUND rather than through the body's own centre, so a roll swings a tall load
sideways and the y extent grows by roughly `height × sin(roll)` instead of
falling by a cosine. On this body the chassis default of 2.6° would have spent
the whole plan budget; `ROLL_DEG` is 0.9. The next author of a tall-load body
will reach for 2.6 and it will cost them silently.

**THE SHARED GAIT'S SWING LIFT IS FIXED AT 0.057 u AND IT SIZES THE CHASSIS.**
`swing_z = 0.012 + 0.045·|cos t|` is not a parameter. On a 0.48 u chassis leg
it is 12% of the limb; on this body's 0.12 u leg it is 48%, and the solver
translates the whole leg ROOT. Two separate constraints fall out — the rail has
to swallow the lifted knee and clear the lifted foot, and the fore/aft leg
pitch has to exceed the foot's own length plus the closing travel of an
antiphase pair. Both were got wrong first time.

**REST-POSE ARITHMETIC IS NOT A CLEARANCE.** All three of `build()`'s asserts
passed on a build whose feet ran 0.070 u — 2.9 screen px — through each other
on every frame and whose knee left its rail on two frames in eight. They compare
two rest-pose numbers; the real clearance is between a leg that lifts and a rail
that bobs down to meet it, and the two extremes are not simultaneous in either
direction. `tools/blender/enemy_dray_check.py` is the per-frame per-part AABB
pass that found both, written because `visual-pass/model-review.js` states in
its own header that it has no interpenetration test and `enemy-angry` shipped a
collar through an arm past every green gate. 741 pairs × 8 frames, clean.

## Measured, with the ruler named

- **Plan envelope 52.8 board px worst SINGLE FRAME** against a 54.2 px frost
  ring — inside both rings with 1.4 px of slack, 97.4% of the 0.8115 u budget
  that `(22·sizeScale + 8) / (31.8032·sizeScale)` gives at sizeScale 2.10. The
  tightest budget on the board, and the brief spent 97% of it on purpose.
- **Health bar margin exactly 10.0 px**, raw top EQUAL to posed top (0.548 at
  frame 0). Clause 3b holds by construction, not by tolerance: the group owning
  the topmost geometry sits at z = 0 with identity rotation at frame 1.
- **Cycle wrap 1.51 board px = 0.68× mean**, below the observed 0.76–1.09 band —
  and continuous. The per-pair sequence is `1.5 3.1 2.4 1.5 | 1.5 3.1 2.4` with
  a wrap of 1.5, period-4 and equal to a value that already appears twice
  inside. On a short-legged body the sole-solve LIFT dominates frame-to-frame
  displacement rather than the leg rotation, and its steps are unequal because
  `swing_z` is a cosine sampled at four points while the rotation is a triangle
  wave. The mean is pulled up by the large steps; nothing is discontinuous. The
  hive sits at 0.76×/0.52× on the same instrument and ships.
- **Aspect W/H 1.021**, mean over 4 frames × 8 yaws, screen px in the 1280×720
  logical view — a RASTER statistic, quoted in its own space with its definition
  attached, because it has no model-unit form. The brief's 1.037 was measured on
  a sharp-box proxy before the back rest existed. Wider than tall holds; the
  only two bodies it is briefed against sit at 0.840 and 0.809.
- **Peak cost 7,344 triangles** — 3,672 × 2 on the road, the Tyrant's roar
  crowd rather than the wave table.

## The brief conflict, stated rather than resolved quietly

The operator's back rest was ruled in at 0.26 u because a human leftover only
survives every bearing if it breaks the TOP of the silhouette. Measured on the
shipped geometry by dropping the rest's own 108 triangles and re-rasterising:
it adds **+7 to +27 px across the four front bearings, 11.0 px mean, and 0 px
at all three rear bearings** — and it still adds 0 px there when raised a
further 0.079 u, which is the point at which the aspect claim fails.

The cause is structural rather than a size that can be tuned. The projection's
depth term pushes forward geometry DOWN at rear bearings, and the drum's top
line sits at x = 0 and pays no such penalty — so a crown feature mounted AHEAD
of a wide low drum cannot break the top from behind it at any height the aspect
can afford. Curing it means putting the feature on top of the load, which the
card forbids twice ("no head above the load", "bolted ahead of the drum").
Shipped with the aspect intact, because that is a board-wide categorical
separator and the leftover's worst-bearing figure is a per-feature target.

**2026-08-13 — `visual-pass/probe/rank-page.js`: six defects in the rank solver,
every one of which produced a CONFIDENT wrong answer.** The candidate A rank
(five enemies, ascending height, gap = the narrower neighbour) now passes all
seven asserts at Loader 651 px, top y 286, feet y 937, gaps +1/+0/+0/+2.

**Five of the six were the same mistake in different clothes: a limit condition
read as data.** The pan loop steered on the silhouette's TOP edge, and a body
clipped at the top reports `box[1] = 0` whatever the camera does — so the
finite-difference slope came out zero, the loop broke on iteration ZERO against
its own "slope too small" guard, and the requested ground line was accepted,
logged and never applied. The same clipped body reported 658 px of a taller
body, which sat inside the requested 650-670 band, so the distance bisection
"converged" on a subject larger than the frame: **a clipped height is a lower
bound, not a height.** The clip test returned true for a NULL box, conflating
NOT DRAWN with CLIPPED, so an invisible body scored as too tall, the solver
moved to shrink it, and the distance walked to the floor with `tallest:0` on
every step. Pan returned on a lost body while keeping whatever target the last
overshoot had thrown it to, poisoning every later reading. And the solver itself
was an alternating pan-then-bisect written **ten lines below the coupled 2x2
whose comment explains that alternating does not work** — the camera target is a
point on the GROUND, so sliding it vertically also changes the subject's depth
and therefore its scale. Reading past that comment rebuilt the exact bug it was
written about.

The sixth is a real projection fact worth keeping: **one linear world-to-screen
scale is exact only where it was measured.** It was measured at the rank centre,
and a rank's whole purpose is to put bodies far off centre, where perspective
both widens and shifts them — measured rank/solo width ratio 1.000 at the centre
against 1.096 at the frame edge. Planning gaps from centre-measured widths left
them short by 69, 44 and 21 px, worst at the edges and perfect in the middle;
that signature is the tell. Both axes now take a per-body Newton correction
against measured positions instead of a global constant.

Also: `RankRig.audit(placed)` threw `Cannot read properties of undefined` deep
inside on `placed.length` whenever the solve returned an error object carrying no
placement, which hid the real reason for four consecutive runs. A failed stage
must surface its own reason rather than throw downstream; there is now a guard
that prints it. The rule this all reduces to is in `AGENTS.md` under "Testing
anything VISUAL".

**Separately — the shoot-from-committed-HEAD rigs now delete their own
extraction.** `hero-rig.js`, `candidate-rig.js` and `rank-rig.js` each
`git archive` the entire repo into `%TEMP%`, and none cleaned up. The directory
is named for the sha, which moves every run, so re-running never reuses one — it
adds one. Thirteen extractions took the system disk to 223 GB of 223 GB with
**zero bytes free** and killed `tar` mid-extract. That is not a local failure: a
full disk breaks every agent on the machine, and their failures look like bugs in
their own tools. It is also the exact condition that writes a TRUNCATED FILE WITH
A VALID HEADER — a PNG whose IHDR reads a perfect 1920x1080 and whose image data
stops halfway, which every dimension check passes. The only proof of completeness
is the IEND chunk, and its name sits at offset 4 of the last TWELVE bytes; read
the last eight and the check lands on the CRC and condemns healthy files. Each
rig now removes its extraction in the `finally` that already kills Chrome.

**2026-08-13 — The Tender (`enemy-shieldbearer`): the first four-legged body in
the game, and the first with no arms at all.** 6,452 triangles, 8 frames, on
`enemy_chassis.py` at `CHASSIS_VERSION 1` with no change to the shared module —
which is the point, since both firsts are carried by `animate_walk_grouped`.

**Four legs as two diagonal pairs — a trot, which is two antiphase groups**,
exactly what `walk_phases` and `support_left_frames` already describe. The pairs
are `(leg_0, leg_3)` and `(leg_1, leg_2)`, and that ordering is the gait's
contract: renumbering the legs without changing the groups gives a body that
paces or bounds instead of trotting — which still walks, still plants, and looks
wrong in a way no gate catches. Feet are `foot_0`..`foot_3` because the sole
solver resolves names through `bpy.data.objects`, a **global** lookup; four feet
called `foot_l` would collect `.001` suffixes and the solver would measure the
wrong foot on three of four.

**No arms, and no shield projectors.** `arms=()` is passed to the gait; the old
`animate_walk` indexed `parts["arm_l"]` unconditionally and would have raised
`KeyError` here. The projectors are omitted on a fiction argument, not a cost
one: this body *is* the shield hardware — it carries the rack the clamped-on
nodes were issued from — so wearing a set as well would say the opposite of what
the unit is.

**Nine nodes, not the card's twenty.** 20 nodes over a ~21 board px body is a
2.1 px pitch on a 2.1 px node: they merge into one bar, destroying the openness
the count was meant to create. Three ranks of three, node diameter 0.064 u and
pitch 0.13 u — both exactly at their ruled bounds, neither with slack.

**Its separator is height and crown, NOT openness — a correction to the card.**
"The only see-through silhouette" was withdrawn as a *read* after measurement:
the rasteriser dilates on downsample and the renderer closes gaps harder still,
with the Gleaner's 1.70 px inter-leg gap rendering at 0.00–0.50 px, mean 0.09.
Openness survives as a zoom reward. What separates this body is being the
tallest thing on the road with a wide flat frame where every other body has a
head.

**CROWN IS A RASTERISED STATISTIC AND HAS NO MODEL-UNIT FORM — IT IS QUOTED IN
ITS OWN SPACE ON PURPOSE.** The instrument (`scratchpad/mira-six2.js`,
`mira-primitive-audit.js`) defines `crown` as the **mean width of the top three
lit rows**: horizontal, screen-space, and sampled from whichever model axis
faces the camera at that bearing.

      crown, worst bearing, #game space (1280x720)
      target      6.00 px
      BUILT       6.67 px      +11.2%

**Both sides come from that one instrument with that one definition, so the
comparison holds — and there is deliberately no unit column.** An earlier draft
of this entry carried one (0.3639 u / 0.4045 u); it was withdrawn. Converting a
bearing-dependent raster statistic into model units is a **category error, not a
mis-scaling** — there is no ruler-independent version to convert to — and the
attempt had also applied the *vertical* scale (16.49) to a *horizontal*
quantity.

The general rule — **carry the unit quantity and convert only at the point of
use** — holds for a *geometric extent* (an apex height, a section radius, a plan
envelope) and **stops at a rasterised statistic**. For those the honest form is
the opposite: **keep it in its own space and name the space, the canvas and the
definition.** The rule was live because a px figure in the brief had been found
wrong in three compounding ways in a single day — unnamed axis, then unnamed
camera distance, then unnamed *canvas* (silhouettes rasterise on `#gl` at
1111×625 while `HOUSE-STANDARD`'s px-per-unit table is `#game` at 1280×720, a
13% gap). The Courier's 1.24 u apex was untouched by all three, because that one
is a genuine geometric extent.

The 6.0 target itself came from
`mira-primitive-audit.js` re-measuring against real primitives rather than
sharp-box proxies — four of five bodies matched to the digit, but this one's
worst-bearing crown drops 7.0 → 6.0 because `td_scene.box` bevels by default.
**That bias is a property of the metric, not the proxy**: under 0.2 px on an
extent, 1–3% on an area, and a full 1.0 px on a small derived pixel count like
crown width, which on a 6–7 px quantity is 14–17%.

    brief (proxy)          W 13.5   H 40.1   W/H 0.337   lit 378   crown worst 7.0
    audit (real primitive) W 13.6   H 40.0   W/H 0.340   lit 358   crown worst 6.0
    BUILT                  W 13.4   H 40.4   W/H 0.331   lit 392   crown worst 6.67

Gates: `check-model-top` raw 1.593 == posed 1.593, margin 10.0 px — clause 3b by
construction. Cycle wrap 3.35 px = 0.95× mean, inside the enemy band. Envelope
27.5 × 18.7 board px, inside both rings with 10.2 px of slack. **The trot adds
9.4 px of width mid-swing against the Courier's 1.3**, because four legs splay
fore/aft — still 2.2 px inside the hit circle, but it is much the largest
swing-phase growth on the roster and is worth knowing before any wider stance is
proposed.

**2026-08-13 — `animate_walk_grouped`: the gait generalises to any leg count,
byte-exact on every shipped biped. A CHASSIS EVENT — all six chassis bodies
re-exported. It is recorded here because `git log` cannot find it: the work was
swept into `67d0fd2`, "Write down the two things the camo fix taught", by a
concurrent broad stage, and that commit's message describes none of it.**

The paths are `tools/blender/enemy_chassis.py` and the six generated models
`enemy-armored`, `-fast`, `-slow`, `-angry`, `-camo_normal`, `-shielded`.
Content is intact — verified after the fact: `git diff HEAD` is empty against
the gated working tree, and the gate below still passes on the committed
content. But the attribution is gone, and **a chassis event nobody can
attribute is the exact failure the chassis header warns about.** Second sweep of
the day onto this author; the first took the Courier's CHANGELOG entry into
`0870861`, a Rifleman DPS commit. History is not being rewritten to repair it —
this is a shared repo and an additive record is cheaper and safer than a
force-move.

**What was two-leg-shaped was not the arithmetic.** `walk_phases` is a plain
triangle wave and `support_left_frames` is a duty-0.5 window; neither knows how
many legs exist. A quadruped **trot** and a hexapod **alternating tripod** are
both two antiphase groups — exactly what those two functions already describe —
so the Dray's six legs and the Tender's and Stacker's four need no new cycle
arithmetic at all. What *was* two-leg-shaped was `animate_walk`'s body:
hard-coded `parts["leg_l"]`, literal `"foot_l"` strings, an unconditional
`parts["arm_l"]` that raises `KeyError` on an armless body, and a binary
if/else over one support set. `animate_walk` is now a two-group call to the new
function and nothing else.

**Two groups are exact; more than two are not, and the limit is documented
rather than left to be discovered.** `walk_phases` is *symmetric*, so shifts `s`
and `frames/2 − s` sample the same value and swing angles collide in pairs above
two groups — at six groups over twelve frames the phases come out
`[0.00, 0.67, 0.67, 0.00, −0.67, −0.67]`, so a "wave" gait reads as three
phases, not six. Support windows stay distinct and the body never floats
(verified: minimum support 1 / 2 / 3 groups per frame at 2 / 4 / 6 groups, never
zero), but the legs visibly swing in pairs. It costs nothing now because every
batch-2 body is a two-group gait; a true wave gait would need a real phase
argument on `walk_phases`, which is a shared-function change and not a
caller-side fix.

**A foot name is derived from its leg key** (`leg_0` → `foot_0`), and that is
load bearing rather than cosmetic: `_foot_measure` resolves names through
`bpy.data.objects[...]`, a **global** lookup. Six legs all naming their foot
`foot_l` collect Blender's automatic `.001` suffixes, and the solver then
measures the wrong foot on five of six — a body standing on one leg and floating
on the rest, with nothing raised anywhere.

**The gate, against a baseline captured before the first chassis edit**
(`scratchpad/suki-enemy-baseline.json`): multiset moved on **0 of 6**,
framesDigest moved on **0 of 6**. `framesDigest` is the one that matters here,
and multiset alone would have been negligent — **a gait change moves no
triangles**, so a multiset check passes unchanged while the walk is visibly
wrong.

**2026-08-13 — `bands` reaches the runtime: the frame-layout contract, and the
registry line that was silently dropping it (`3f5c77e`).** The rule itself is in
`AGENTS.md` under "`bands` — which frames are the walk"; this is what happened.

**The defect the reader exposed was in the REGISTRY, not the reader.**
`GLModels.register` builds its model object from an explicit field list, and
`bands` was not on it. So the field shipped on eight models while `m.bands` was
`undefined` on every one of them. **A reader written only in `gl-world.js` would
have taken the absent-fallback thirteen times, changed nothing, and passed a null
control perfectly** — a green from a feature that never ran. Any new field on the
model contract has to be added in two places or it is decoration.

**Why a pair and not a length.** Two incompatible frame arithmetics already
coexist in `gl-world.js` — enemies index frame 0 as a walk frame, blubs and
summoners reserve it as a rest pose and count from `frames.length - 1`. A bare
`cycle` integer cannot say which applies, and guessing wrong does not throw, it
draws a plausible body on the wrong frame of the wrong band. `[[first, count]]`
leaves the reader nothing to derive. A renderer-side constant was considered and
killed on a census: `enemy-angry` and `enemy-flying` carry twelve frames where
everything else carries eight, so one constant would have made the Hedger's crank
and the Wisp's second wingbeat unreachable.

**Accepted on two gates, because one was not enough.** Every band in the tree is
currently `[[0, frames.length]]`, so the regression null — as-shipped versus
stripped versus explicit whole-list, bit-identical across 12 bodies × 3 bearings
at worst 0 px — would have passed a reader that ignored the field entirely. It
proves nothing broke and nothing more. The **synthetic positive** is what
exercises the feature: a band that is not the whole list, injected at runtime,
identifying the state pose from its measured silhouette rather than from the
index that set it, and going red on demand when the same band is declared as the
whole list.

**`bands[n][0]` still has no caller.** Nothing addresses a state band, so the path
ships unexercised by real geometry until the first genuinely banded body lands.

**2026-08-13 — The wave banner shrinks to fit instead of clipping, and the flat
triangle ceiling is retired.** Two rendering fixes and one measurement guard;
no model changed.

**The banner could lose half a name off EACH SIDE, silently.** Both banner lines
were drawn with a bare centred `fillText` and no width. Because the text is
centred, an over-long title does not run off the right edge — it clips
symmetrically and reads as a broken build rather than as a long name. Harmless
while titles were constants; reachable now that boss titles are COMPOSED from
`displayName` plus an `announceSuffix` like `" COMMITS ITS RESERVES"`, so the
string is data.

`setBannerFont` in `js/effects.js` shrinks until it fits. It deliberately does
**not** use `fitText`, which ellipsises: that is right for a panel and wrong
here, because an ellipsised proper noun is the one string a player cannot
mentally complete. There is deliberately **no minimum size** — a floor would
reintroduce clipping below it, and "how small can 700-weight text be and still
read" is a legibility judgement no width measurement can settle. The `> 1` in
the loop is a bound, not a designed value.

It measures at runtime rather than from a per-character table because
`system-ui` resolves to a different family per platform — San Francisco on
macOS, Segoe UI on Windows — so any table measured on one machine is wrong on
another. Measuring here measures the player's *actual* resolved font on the
player's *actual* machine, and the cross-platform problem disappears instead of
being managed.

**The 4032 "Gleaner parity" triangle ceiling in `visual-pass/model-review.js` is
retired.** It measures the wrong thing and misfired on the first model of batch
2. A model's cost is triangles TIMES how many are on the road at once, and by
that measure the ranking inverts: the Tender is the dearest *model* in the batch
at 6,328 and the second cheapest *body* on the road at 12,656, while the Stacker
is the cheapest model at 1,908 and by far the dearest body at 122,112, because
one wave-25 spawn cascades to 64 of it. The old flag would have sent a smith to
shave a model that costs nothing and waved through the only type in the game
that multiplies.

**`visual-pass/tree-parse-guard.js` refuses to measure rather than recording a
false zero.** `tests/harness.js` loads every `js/` file into ONE context, so a
single half-saved file from any division takes all six suites to 0/212 — that
exact result was measured, with 107/0 minutes later. It is transient by
construction, so it is worst in an unattended batch run; it is **invisible to a
null-model control**, because the file never rendered, it failed to parse; and
it is not confined to `js/gl/`. The tell: a real regression fails a readable
subset, a total wipe means the harness never booted.

**2026-08-13 — The Courier (`enemy-shielded`) is modelled: the first of batch 2,
and the first body whose unique part is a shape no primitive in the toolkit can
produce.** 4,552 triangles, 8 frames, built on `enemy_chassis.py` at
`CHASSIS_VERSION 1` with no change to the shared module.

The body is the narrowed Skimmer frame carrying a FULL-SIZE sealed hold. That
combination is the card's "proportionally the largest hold on any small unit"
taken literally: the cage stays at scale 1.0 and the frame comes in around it,
so the hold ends up the widest part of the whole body — its side struts at
±0.177 against the shoulder yoke's ±0.125 — by being the only thing that did not
shrink. Scaling the cage UP would have produced a wide body instead of a body
with a big hold, which is the opposite read.

**The field yoke is a 2:1 ellipse and the ratio is the separator, not styling.**
mira measured the Courier against the Drudge — the pair this body's own card
names — and the only thing holding them apart is that the Courier's height range
never overlaps the Drudge's at any frame or bearing. A circular hoop puts the
apex at z 0.98, under the crown, and the two collapse into each other:

    ellipse, apex 1.24   H 26.2 [25.1-27.8]   W/H 0.463   lit 223
    circle,  r 0.26      H 24.0 [20.9-26.4]   W/H 0.507   lit 192

**And that is why it is twenty tube segments rather than a scaled torus.**
Scaling a torus's major plane scales its TUBE with it: built at R 0.26, minor
0.030 and scaled 2×, the bar comes out **0.120 thick at the apex** against the
0.05 it should be, and the apex overshoots to z 1.30. Both errors land exactly
where the separator lives. A circular torus keeps the section and loses the
shape; you cannot have both from one primitive. 400 triangles against the
torus's 192, and worth it — cost is triangles × bodies on the road, and at six
Couriers that is +1,248 against a 26,808 peak.

**The general rule, which cost nothing to learn here and a re-export to learn
later: a visual brief owes the smith the CONSTRAINT, not the measuring proxy's
construction.** mira's rasteriser models the hoop as twenty boxes because boxes
are what it speaks; built literally that is 1,944 triangles for a shape a chain
of tubes draws in 400. The proxy was scaffolding and was never meant to ship.

**The hold is sealed, and it is NOT a separator — that claim was made and then
withdrawn the same afternoon, which is worth recording because the withdrawal is
the useful half.** Dark-versus-lit hold looked like a second axis against the
Drudge until juno swept the exact pair: a `core_red` part against a body
repainted uniformly to `tin` measures **palette CR 1.72 but a rendered median of
1.27–1.34**, against a 2.0 band. Two values that measure as the same value are
not a read. The seal is built anyway — it is right for the fiction, it is the
cage's own sanctioned plating swap through `window_mat` / `core_mat`, it
reshapes nothing, and it pays at the zoomed camera — but it buys nothing, and if
some other constraint ever pushes back, the seal is what gives way and the
geometry is not.

**So the Courier/Drudge pair rests on the height range alone**, which is why the
2:1 ellipse is not negotiable: there is nothing behind it.

Not built, both deliberately: the card's thumb-latch (measured at +1.2 px of
silhouette and +0.0 at the worst bearing — below the feature floor, cut as a
read and kept as a zoom reward), and "the most upright body in the family",
which is unreachable from here because the 20° stoop is `chassis.LEAN`, a module
constant baked into four of `torso_frame`'s five boxes. Standing it up needs a
defaulted `lean=` argument on the shared chassis, which is scheduled as its own
additive pass; it is worth about 0.4 screen px and is not what makes this
silhouette.

Gates: `check-model-top.js` reports raw top 1.274 == posed top 1.274, margin
10.0 px — clause 3b holds by construction, the body root sits at z = 0.
`check-model-tags.js` clean after adding the tag to `index.html`, `sandbox.html`
and `3d.html`. Cycle continuity 4.08 px wrap = 0.98× mean, inside the observed
enemy band. Envelope 23.0 × 13.6 board px, 10.3 px of slack to the frost ring.
`model-review.js` also prints `*** OVER CEILING ***` against a 4,032 "Gleaner
parity" limit that has been retired — cost is triangles × bodies on the road,
and by that measure this body is mid-pack.

Built-versus-briefed, measured on mira's own instrument, because an estimate and
a built model disagreeing is worth more than either alone:

    briefed (proxy)   W 12.2   H 26.2 [25.1-27.8]   W/H 0.463   lit 223
    BUILT             W 11.4   H 25.8 [24.3-27.0]   W/H 0.442   lit 217

Aspect came out slightly *better* than briefed. **But the Drudge separation
came out at 0.2 px where the brief predicted 1.0** — Courier height low 24.3
against the Drudge's high 24.1 — and with the sealed-hold axis withdrawn that
0.2 px is now the entire separation between the two. Flagged to mira, not
accepted, and not silently patched by raising the hoop.

Most of the 0.8 px is accounted for: the proxy's bar is a BOX 0.05 × 0.05 with
corners 0.0354 from centre, where the built bar is a round tube at 0.025
everywhere, so the proxy ring is fractionally larger in every direction. That
is a proxy-versus-solid difference rather than a build error, and it is the same
lesson as the torus trap one paragraph up: **the instrument's primitive is not
the shipped primitive.**

**2026-08-13 — A camouflaged body no longer blends over itself. Depth pre-pass
for camo enemies, and the `setFade` note now says what it is true for.**

`setFade` turns depth writes off, so EVERY front-facing surface of a translucent
body passes the depth test. Where two surfaces of the same body overlap on
screen — arm over chest, near leg over far leg — that pixel was blended twice.
Measured against the exact single-layer law `alpha*opaque + (1-alpha)*plate`,
which holds in 0-255 space because GL blends after the shader's sRGB encode:
**93-95% of interior pixels departed from it, mean 30/255, worst 107/255.**

**The departure is BRIGHTER, not darker** — 46 pixels brighter against 11
darker, mean +24 — because the stacked term is `(1-a)*a*(c1 - board)` and a lit
body is brighter than the dark road. **So the translucency read weakest exactly
where the body is thickest**, which is most of what a player looks at. Diego
asked for a body that reads as not solid; it was reading solid on the mass and
translucent only on the thin parts.

Fixed with a depth pre-pass: each camo body is drawn once with `colorMask(false)`
and depth writes ON, then again blended with `depthFunc(EQUAL)`, so only the
surface that won the pre-pass composites. Two new renderer seams,
`setDepthOnly` and `setDepthEqual`.

Two competing explanations were refuted by the same numbers, one of them the
author's own. **Antialiasing: refuted, because the RIM is the CLEAN population**
(0.38 share, mean 4/255) — a coverage artefact would do the opposite. **"Any
group self-overlaps": refuted** — a single thin arm deviates by 4.3 where a
torso-and-head group deviates by 35.5, so it tracks self-overlap and not group
count.

Acceptance, all measured at the fitted camera 2021.237 / viewport 1111x625:

- **Gate:** interior deviation 0.93-0.95 share → **0.018-0.03**, mean 30 →
  **0.28**, worst 107 → **1.5** (8-bit rounding).
- **Negative control:** a board with NO camo bodies is **bit-identical** before
  and after. Pass 2 never runs, so the change is provably inert where it should
  be. A first attempt at this control was WRONG — stubbing `colorMask` alone
  still drew the pre-pass in colour — and the corrected pair is board-level.
- **The wreck fade shares `setFade` and is drawn after camo.** GL state after a
  camo frame: colorMask all true, `depthFunc` LEQUAL, BLEND off, depth writes
  on. Nothing leaks.
- **No z-fighting or dropout** from the EQUAL compare: 100/100 body px at the
  fitted camera and 10420/10420 at distance 180, where depth precision is worst.
  No polygon offset needed.
- **Cost:** one extra call per GROUP, not per body — twelve camo bodies measured
  121 draw calls against 61, so +60 at ~0.9 us = **~54 us a frame, 0.3% of a
  16.7 ms budget.**

**The `setFade` note is corrected in the same commit.** It justified unsorted
compositing with "on a 23 px body over one second a player cannot see it" —
small, and transient. That is still exactly right for the wreck fade, which is
why the wreck does not use the pre-pass. **Both premises fail for a camo body**,
which is translucent for its whole life and which the player is staring at to
identify. The note now says which case it covers and which it does not — a
ratified justification whose conditions had changed underneath it.

**2026-08-13 — Camouflaged enemies finally have a visual cue on the 3D board:
translucent bodies drawn last, plus the 2D pack's dashed ring ported into the
overlay pass.** The owner's ruling was *"do the camos like the others, just make
them a bit translucent or sum"*. Until now `isCamo` appeared **nowhere** under
`js/gl/` — measured 0 changed pixels on both the mesh and the sphere path with
the flag flipped on the same body, against 328 px on the 2D fallback. Wave 14 is
the game's pure camo teaching wave, so the shipping renderer was teaching a
mechanic with no on-screen signal for it at all.

Reuses `GLRenderer.setFade`, which already existed for the wreck fade; no second
blending path was written. Fade is STATE, so it is set once per pass and put
back, exactly as `setGlow` is.

**Camo bodies are drawn in a second pass, after every opaque one.** `setFade`
turns depth writes off, so a translucent body lays down no depth; drawn in array
order, an early camo enemy lets opaque bodies *behind* it composite over the top
of it. Camo-vs-camo overlap is still array-ordered — measured at 29 px on two
deliberately overlapping bodies, and sorting that pass is the obvious next step
if it ever matters.

**`CAMO_ALPHA = 0.62`, and the usual instrument could not have chosen it.**
Across alpha 0.85 → 0.40 the changed-pixel count is 97–100 px and the silhouette
change is **exactly zero at every step**: alpha does not move the outline by one
pixel, so a count is flat across the entire range it is meant to choose within.
Chosen on values instead — at one body pixel, board (21,45,60) and opaque
(90,100,118), 0.62 renders (64,79,96). Below ~0.5 the body converges on the
ground it stands on.

**The ring is kept, and it is the half that teaches.** Alpha is a *subtractive*
cue: it makes the body harder to see, which is right as fiction and wrong as
instruction — it answers "which of these needs detection" by making that one
less distinct. The ring is *additive*: measured on the overlay, 59 px **gained**,
0 vacated, 0 recoloured — pure new outline where the alpha contributes none. It
reuses `drawGroundRing`/`ringPath`, so it sits on the ground in perspective, and
its colour, dash and `+4` radius are lifted verbatim from `js/enemy.js` so both
renderers teach the same mark.

`Effects.drawScreen` was considered as a shared seam and rejected: it does run
in both renderers, but it is screen-space and enemy-agnostic — no projector, no
enemy list. The two rings are two projections of one cue, not two implementations.

Verified with `visual-pass/probe/camo-fade-probe.js`. The control is **the same
body with alpha on versus off**, never camo-versus-ordinary — those differ by
type colour and would show a difference even if the fade did nothing. With the
fade forced inert the new build is **bit-identical** to the pre-change build, so
the two-pass split costs nothing on a board with no camo on it. Buffer-order
compositing under fade was tested directly with suki's two re-exports of
`enemy-normal`, which differ only in triangle order: **0 px faded**, so it is not
observable at this size and alpha.

**2026-08-13 — the day's changelog debt, measured properly: TWENTY-FOUR commits
are unnarrated anywhere, and six of them carry standing RULES that exist only in
a commit message.**

**The obvious count is wrong and overstates it by nearly double.** Forty-three of
today's commits carry no `CHANGELOG.md` edit *of their own* — but entries here
are routinely written in someone else's commit (six house-standard commits were
narrated in `fa8712f`, `217d40a` and `fb9ab97` in `9c45869`, `f90819e` in
`c3a7134`). **The honest measure is "mentioned by hash nowhere in this file",
and that is 24.** Recording the method because the wrong metric would have sent
someone to re-narrate a dozen commits that are already covered.

**THE SIX THAT MATTER, because a rule living only in a commit message is
invisible to every future reader of this project:**

- **`d2f981d`** — *"A whole A4 Siphon occupies 22 × 35 px"* in the house standard
  was the **BASE** tier, wrong since the day it was written. Proved in Blender
  units with no camera: the section's own 1.790 u matches base and A1 to 0.3% and
  A4 to 9%; measured z runs base 1.795 → a4 1.956 → a5 2.072, and section 5
  already contradicted section 0. The error was safe in direction — everyone had
  been designing to the tightest box — but the next person to measure A4 would
  have found 39 px and called the standard 12% out. **Checked: that figure never
  reached `AGENTS.md`.**
- **`48be562`** — **occluded is not the same as backdropped**, and the section
  used to invite the conflation. *Occluded* means geometry drawn in FRONT of a
  part: a gate, and no material rescues it. *Backdropped* means what sits BEHIND
  it: not a failure, but what decides how stable the part's contrast is frame to
  frame. Prefer a backdrop that shades **with** the part — `keyDir` is a
  world-space uniform that rotates with nothing, so two parts of one model share
  its yaw, their normals move together and their ratio is buffered.
- **`7df7d5d`** — `visual-pass/DIRECTION.md` restated the colour clause **without
  the pointer**, which is exactly how a palette table gets read as a prediction of
  what lands on screen. Now points at section 4 of the house standard in
  `AGENTS.md`'s own terms. This is the pointer-not-copy rule catching a third
  document, and it cites clause 7's reasoning as the precedent.
- **`9ee7f44`** — **ask whether a tier's value is MECHANICAL before treating weak
  legibility as a defect.** Written as the question rather than as a verdict about
  any tier, deliberately: a verdict goes stale the first time someone reprices a
  tier or moves a mechanic between rows, and the check survives that.
- **`eaf8865` and `5ad8241`** — **both model gates now say what they do NOT
  check.** The Hedger passed a four-gate instrument for hours while its crank
  passed through its own arm, not because a test broke but because **green was
  read as "sound" when it meant "the things this looks at are fine"**. No added
  test fixes that; only the tool stating its own scope. Both also record why the
  obvious fix is worse than nothing: a whole-group AABB interpenetration test
  reports overlap on every frame of a *correct* model, which is the same as
  reporting nothing. It has to be per solid, which is what clause 8 already says.

**The remaining eighteen are assets, captions and comment corrections** —
`6b77474`, `8388034`, `15fc4a3`, `bbde900`, `5672261`, `65c7638`, `a411c48`,
`0055492`, `cf3d813`, `141e463`, `1d1c29f`, `f3bb74b`, `191a35c`, `a136b3a`,
`86e5cda`, `147255d`, `ba38c61`, `4d2c411`. **Listed rather than counted**, so
the debt is a work order and not a number, and so nobody has to re-derive which
ones they are.

**2026-08-13 — `ac4ca48` deletes wave 11's midboss health override, so the type
row's 250 is the value again. Four schedule totals move with it, and the
Rifleman's A5 DPS was one retune behind in six places.**

**Diego reported two things and they were one cause.** The midboss read **420**
where he had set 250, and it was unkillable with the starting kit.
`js/game.js` authored `health: 420` on the wave-11 row on 2026-07-30, and a
wave's `health` **overrides** the type row — there is no HP scaling in this
game, `Enemy.healthOf` is a pure override — so **the row he edited was never
what spawned.** Measured, 420 was above what any buildable board could deliver:
the starter kit is cash-limited to ten or eleven Riflemen by wave 11, and its
damage into one slow body is a hard per-route ceiling (270 `rune-circuit`, 380
`mana-coil`) that **does not move with the enemy's health**, so wave 11 ended
the run on three of six routes. **Deleted rather than reduced**, so the type row
is the only site the number lives at. No mechanism changed.

**FOUR PINNED TOTALS MOVE, AND `AGENTS.md` CARRIED THEM IN TWENTY-FIVE PLACES.**
`tests/run.js` moves five pins in step, and the suite is green at 107/0.
Verified independently at runtime before writing — `waveEffectiveHealth` summed
over `EASY_WAVES` returns 25 799 exactly.

    scheduled HP     23 867 -> 23 697        effective HP   25 969 -> 25 799
    kill bounties   $23 503 -> $23 333       run purse     $36 204 -> $36 017

**Three more figures move that were not on anyone's list**, found by grepping the
digits rather than the passage: the **clear-bounty total $2 596 → $2 579** (the
purse arithmetic only reconciles with it, and an independent `waveBounty` sum
returns 2 579), the **bounty-to-effective-HP ratio 0.905 → 0.9044**, and its
against-declared-health twin **0.9847 → 0.9846**. That ratio pair is quoted
three times and is the anchor of the conservation-exception argument, which is
why a stale one would have mattered more than the totals did.

> **AND THE SAME FIGURE WAS SPELLED TWO WAYS, WHICH IS HOW A BULK REPAIR LEAVES
> SURVIVORS.** The clear-bounty total appears as `$2 596` in the purse table and
> as `$2596` — no thin space — in the prose and the current-values row. A sweep
> keyed to the spaced form fixed the table and left the other two **contradicting
> it in the same document.** Found only by reading the staged diff in full,
> because the survivors sit in *unchanged context* that no diff flags. Grep every
> moved constant in both spellings before believing a bulk replace is done.

**THE RIFLEMAN'S A5 DPS WAS WRONG IN SIX PLACES, INCLUDING AN ARGUMENT.**
Reported by nadia and **confirmed independently at source before acting**:
`js/soldier.js:336` has `damage: 8, shots: 5, cooldown: 34/60`, so
`5 × 8 / (34/60) = **70.59**`, not the `5 × 8 / 0.6 = 66.7` the document
carried. The source comment at `js/soldier.js:34` already says *"70.6 DPS (0.6 s
and 66.7 until…)"* — **the code had recorded its own supersession and the
document never followed.** The burst rate moves with it, 8.33/s → 8.82/s.

> **One of the six is an ARGUMENT, and it survives in the same direction:**
> *"Path A wins on the tower — 66.7 DPS against path B's 50"* is now 70.6
> against 50, so the conclusion is **stronger**, not merely still true. That is
> the good case; the dangerous one is a stale number that reverses an argument,
> which is what the path-A price ladder did on 2026-08-12.

**HELD, NOT WRITTEN — the entry for the campaign-tools rebuild.**
`tools/simulate-campaign.js` and `tools/measure-starter-kit.js` are **rebuilt but
uncommitted**; both last landed at `e3bd3f4` and both are dirty in the working
tree. An entry here would describe work no clone has, so it belongs in the
commit that lands the code, not ahead of it. Same rule that held the `AGENTS.md`
model clause for `enemy-flying.js` on 2026-08-12.

**And for the same reason the PROVENANCE VOID banner over the starter-kit table
STAYS.** What did change is the sentence under it: *"re-measuring is unauthorised
new work and sits with vera"* is now false — it was authorised and done, and
**`js/meta.js:283`'s "somewhere around wave 17" was right all along**. Measured
wave 11 on three of six routes before the wave-11 fix and **17–18 on the default
route after it**; the dead tool's 11 and the table's w19–20 were both artefacts,
and the 420 midboss was what had broken the premise. The banner still stays,
for two independent reasons now recorded beside it: the repaired tool is not in
`HEAD`, and **the table's own figures are still the dead tool's output** — they
want re-running, not un-flagging.

**2026-08-13 — `f90819e` retires the three-difficulty claims from the roster
comments, and `AGENTS.md` stops counting the model roster it cannot keep up
with. Plus the one-line incantation for auditing the schedule, and why a
hand-rolled version of it silently drops a quarter of the waves.**

**`f90819e` — `js/enemy.js`, comments only.** Two roster comments still described
a campaign with Easy, Normal and Hard. Those derivations were deleted on
2026-08-12 (`js/game.js:663-667` records it) and `WAVES = EASY_WAVES` is the only
schedule. The midboss block also restated the wave-11 health override, and the
v0.4.9 block listed one wave per type — **already wrong by omission**, because
the Shieldbearer appears in **four** waves and the others in one. Verified at
runtime: `shieldbearer` at 27, 29, 30 and 34; `midboss` at 11; `healer` at 32.

> **THE DURABLE HALF, and it generalises well past those two paragraphs: a
> schedule number restated in `js/enemy.js` is a FOSSIL-IN-WAITING WHATEVER ITS
> VALUE**, because the schedule moves independently of the type row the comment
> sits above. **So the repair was deletion, not correction** — both comments now
> point at `EASY_WAVES` and quote nothing. Correcting the number would only have
> reset the clock, and it would have pinned prose in a file that does not own the
> schedule, blocking a retune of the wave-11 override that is live elsewhere.
> Same shape as the pixel-fossil classes above: **the repair for a restated
> derived value is to delete it and point at the source, not to refresh it.**

**AND A MEASURING TRAP UNDER IT, WHICH IS WORTH MORE THAN EITHER COMMENT.**
`EASY_WAVES` is **mixed-shape**. Measured at runtime on 2026-08-13: **19 of the
35 waves are bare group objects and only 16 carry `groups: [...]`**, so a
hand-rolled walk over `wave.groups` sees **58 groups against the true 77** and
drops a quarter of the schedule, front-loaded. **The failure does not look like
one** — it reported "midboss: NOWHERE" for a type scheduled at wave 11 in plain
sight, which reads as a finding rather than as a broken query, and was nearly
used to contradict a correct handoff. Same family as *"Not found" is not "not
running"*: an instrument whose scope excludes the thing it exists to see.

**The normalizer is one line — `function waveGroups(wave) { return wave.groups ||
[wave]; }` at `js/game.js:509` — and the `|| [wave]` fallback IS the function.**
`AGENTS.md` already named `waveGroups` as the one place the two forms are
reconciled; it now also says what walking the schedule by hand costs, because
naming the right function did not stop a reimplementation that omits the fallback
and still runs.

**`AGENTS.md` STOPS COUNTING THE MODEL ROSTER.** The model-contract section said
*"sixteen of the twenty-one enemy types are still untextured spheres"* and
*"`js/gl/models/` holds five `enemy-*.js`, `tools/blender/` holds four
`enemy_*.py`"*. Today it is **ten and ten** — nine body modules plus
`enemy_chassis.py`. **The roster moved by five in one day, so no written figure
survives a commit**, and the numbers are replaced with the derivation:
`enemyModel()` in `js/gl/gl-world.js` asks `GLModels.has("enemy-" + id)` and
falls back to the sphere, so `ls js/gl/models/enemy-*.js` against `Enemy.TYPES`
is the answer and is always current. The load-bearing half — `enemy_flying.py`
does not exist while `enemy-flying.js` does — is unchanged and still true.

> **AND A TRAP RECORDED SO NOBODY RE-DERIVES IT BY MATCHING THE TWO DIRECTORY
> LISTINGS:** the four original bodies are named for their **typeId**
> (`enemy_brute`, `enemy_hive`, `enemy_normal`, `enemy_swarm`) and the five added
> 2026-08-13 for their **lore name** — `enemy_skimmer` → `enemy-fast`,
> `enemy_tun` → `enemy-slow`, `enemy_drudge` → `enemy-armored`, `enemy_hedger` →
> `enemy-angry`, `enemy_cooper` → `enemy-camo_normal`. A name-match across the
> two lists reports mismatches that are not real.

**ROUTED, NOT FIXED — a wrong triangle count in a docstring people price off.**
`tools/blender/enemy_chassis.py::shield_projectors()` says *"732 triangles at
16/8, 204 at 8/4"*. The function builds **5 boxes and 3 balls**; a beveled
`td.box` is 108 triangles and `td.ball(s, r)` is `s(2r-2)`, so the real figures
are **1,212 and 684**. **Only the box baseline is wrong** — the 528 delta between
the two numbers is exactly right, since that is the three balls. The cause is
pinnable: `732 − 672 = 60` and `204 − 144 = 60`, i.e. **5 × 12**, so the
docstring priced the boxes as *unbeveled* cubes; all five calls take
`round_edges` at its default of `True`. It matters because the other five
sub-assembly docstrings in that file are exact to the digit (`torso_frame` 540,
`legs` 692, `arms` 736, `head` 288/464, `cargo_cage` 1,600), so a reader has
every reason to trust this one. Pipeline source, so not this file's to edit.

**2026-08-13 — the source comments that carried the 22 px conflation are fixed
(`217d40a`), the Siphon A2 row is no longer readable as a hollow tier
(`fb9ab97`), and a dating tool for pixel fossils.** Entries written by the
archivist for the simulation division's commits, at their request: they held off
`CHANGELOG.md` deliberately because it was mid-run here and the post-commit sync
hook auto-resolves conflicts to "ours", which would have put their entry exactly
where this file's work is the losing side — and the loser goes only to
`refs/sync-backup`, where nobody looks.

**`217d40a` — `js/enemy.js`, comments only. This closes the defect routed on
2026-08-13 with clause 3b.** The hover-pad and lane-spread notes described the
hit test as covering *"the body"* and quoted a width and a crossing speed as
roster-wide constants. Both now name it for what it is: the gameplay/hit-test
circle, `Enemy.radiusPx()`, per-type via `sizeScale` and `fractalSizeScale`, in
board px, **explicitly not the drawn body**. They quote **no figure at all**,
because the drawn-body measurements are still in dispute — which is the right
call: a comment that names the wrong quantity is worse than one that names none.

**And the "~78 px/s" is ALMOST CERTAINLY datable, which gives this project a tool
it did not have — but the derivation is an inference and is recorded as one.**
It is most likely `50 u.l./s × 1.552`, where **1.552 is the pre-2026-07-27
`UNIT_LENGTH`** (`js/units.js:47-48` — 19.4 old px per unit over a 12.5
re-anchoring factor, tuned down by a third on 2026-07-27 to 1.04). That would
make it a u.l.-derived pixel value **frozen before the re-anchoring: true when
written and false from the moment the constant was tuned.**

**The competing candidate, named because it is not eliminated: `75 u.l./s × 1.04`
is EXACTLY 78**, with no rounding, where the 1.552 reading needs 77.6 to round.
It is argued down rather than ruled out — no top-level enemy type carries
`speedMultiplier: 1.5`; the only 1.5 in the roster is `summon.speedMultiplier` in
the Tyrant's brood block (`js/enemy.js:733`), an odd referent for a comment about
"an enemy" crossing the screen. Against that, both halves of the original
sentence describe the *ordinary* enemy — 22 px is `2 × RADIUS_PX` at scale 1, and
50 u.l./s is the base at multiplier 1 — and the "~" fits a rounded 77.6.

**HISTORY CANNOT SETTLE IT, and that is a fact about this repository worth
knowing on its own.** `git log -S "78 px/s"` bottoms out at the re-root, and the
root commit is `50ed7ef`, 2026-08-09, *"Baseline before visual quality pass"* —
**the game predates its own repository.** Any comment older than that arrives in
an import with no authorship behind it, so no archaeology is available for it.
Recorded as an inference rather than hardened into a fact.

> **THE DATING RULE: divide a suspicious px figure by 1.552 and by 1.04. A hit on
> a round u.l. value marks it as a FOSSIL rather than a typo** — and tells you
> which era authored it. This distinguishes the two cases that otherwise look
> identical and want opposite repairs: a typo is corrected, a fossil is dated.

**THE SWEEP HAS TWO CLASSES, NOT ONE, AND THE FIRST VERSION OF IT REPORTED THE
SECOND CLASS AS PASSING.** Filtering for "round u.l. under 1.552 **but not** under
1.04" excludes exactly the figures authored in the *current* era — and those are
not clean. **A px figure that divides evenly by 1.04 into a round u.l. value is a
fossil that has not rotted yet**; it rots at the next `UNIT_LENGTH` retune, which
`js/units.js` openly invites ("tune this by feel"). **A 1.552 hit means it has
already rotted; a 1.04 hit means it will. Both want the identical repair —
delete the number and point at the u.l. source.**

- **Class A, already rotted — one hit**, correctly scoped past tense: *"an
  arbitrary 2.5 m exclusion radius left a visible 31 px gap between towers and
  the road"*. `31 / 1.552 = 19.97`, i.e. ~20 u.l. of the old constant. The
  sentence is a historical note and stays; it now says which era its pixels are
  in, because otherwise a reader measures today's gap, finds a different number
  and files a defect against a true sentence.
- **Class B, will rot — one genuine hit, repaired**: *"the perpendicular distance
  moves by up to ±4.16 px against a 104 px radius"*. Both figures are `ul()` of
  round u.l. values — `104 / 1.04 = 100`, the reference radius, and
  `4.16 / 1.04 = 4`. Now stated as **±4 u.l. against the 100 u.l. reference
  radius**, which cannot rot.

**And the class-B filter over-reports, so divisibility is a prompt and not a
verdict.** *"Rows were 26 px"* divides to exactly 25 u.l. and is a **false
positive** — a canvas list-row height that was never u.l.-derived. **Ask what the
figure is a rendering OF before repairing it**; the same near-match trap that
makes a keyword sweep a demolition tool.

**One hit was my own annotation**, written an hour earlier: dating the 31 px, I
added "which is `20.8 px` today" — itself a class-B fossil, created by the pass
that introduced the test. It now points at `ul(20)` instead of restating a
number. **A tool for finding hardcoded conversions will catch the ones you write
while explaining it.**

**Three further hits in `CHANGELOG.md` were left alone: this file is history, and
a figure true on the day it was written is not drift.** And when grepping the
game for these constants, scope out `js/gl/models/*.js` — generated geometry,
where a bare number matches inside million-character coordinate arrays.

**`fb9ab97` — `js/towers/beam.config.js`, comments only.** The Siphon A2 row
reads `mechanics: []` and looks like a tier charging 900 against A1's 600 for
nothing. It is not: its entire payload is the `statDeltas`, and **`ad: +1` on a
base `ad` of 1 is an outright doubling of the tower's damage.** The new comment
states the rule and **points at section 1 rather than repeating the base**, so it
cannot drift — the same pointer-not-copy discipline this file exists to enforce,
applied inside a config. Anyone grepping `mechanics` to argue the tier ladder
misreads exactly that row.

**2026-08-13 — the gross-tier claim TRANSFERS to a second geometry and stops
being provisional. The Hedger's crank measured against the road for the first
time, where brass is the WORST of the three materials on a quarter of the cycle.**

**THE PALETTE TABLE'S ONE REMAINING JOB NOW HOLDS ON TWO UNRELATED SHAPES.**
`warbringer-a5` / `haft` — 976 triangles, a hammer head on a shaft against a body,
sharing nothing with the Hedger's crank but a renderer — reproduces it exactly:
the three candidates above palette CR 3.5 stayed clear of and above all eight
below **on all eight frames**. So *"a palette table can flag a gross difference"*
is a property of the renderer, not of one crank, and the caveat marked on it
hours earlier is removed.

**The failure transfers too, and is WORSE on the haft** — 11–12 inversions per
frame against the crank's 1–8, with `tin` at palette 1.00 beating `black` at 2.89
**on every frame**, a reversed gap of 1.89. The mechanism is visible in the
numbers rather than inferred: `black` renders 1.04–1.27, *below* a same-material
pair, because **a dark albedo on a large flat face goes dark and matches the
shadowed body whatever its paper ratio says.** Area and orientation beat albedo
and the paper figure can see neither. The sentence the standard now carries is
juno's: *a palette table can tell you a pair is obviously different; it cannot
tell you anything else, and it is worst exactly where it is most often used.*

**Two limits sit BESIDE that claim rather than under it**, and the pass that would
close them was declined on the grounds that it buys attribution rather than
confidence: the haft was measured off-board against a uniform background and the
crank on the road, so **the inversion-count difference cannot be attributed to
shape alone** — what transfers is the direction, not the size of the gap; and it
is **one bearing on both parts**, while an enemy's yaw is its heading and so shows
the player every bearing during a run. Controls named because the sweep rests on
them: null 0, revert 0, **all-groups-suppressed against a bare plate 0**, and a
planted violation caught at 482 px. The third is load-bearing — it proves group
suppression removes exactly the model and nothing else.

**AND THE ROAD, WHICH HAD NEVER BEEN MEASURED IN ANY CONDITION.** It was kept
owed rather than closed because it is the neighbour that actually decided the
material — the bar overhangs the road, and that overhang is what rejected
`tin_dark` on paper. Measured by splitting the crank's own pixels by what sits
behind each one:

    frame        0     1    ...    6    ...   10    11
    brass      1.09  1.22        2.25        1.55  1.20
    tin        1.36  1.25        1.51        1.19  1.24
    tin_dark   1.66  1.56        1.12        1.13  1.45
               LOSE  LOSE         win         win  LOSE

**Brass wins on 9 of 12 and is the worst of the three on the other 3, and frames
11, 0 and 1 are contiguous** — a sustained quarter of the cycle wrapping through
the start, not one sampled instant. At frame 0 brass is **1.09** where `tin_dark`,
the material the palette table rejected, is **1.66**.

**At the worst frame — where this standard says a read is settled — the three are
indistinguishable: brass 1.09, tin 1.07, `tin_dark` 1.05**, each at its own worst
frame-and-neighbour. All three are effectively invisible at their worst.

**So the earlier "12 of 12, margin never negative" is corrected: it was an
aggregate over two different neighbours and the aggregate hid the road.** Against
the Hedger's own body brass does win 12 of 12, 1.44–2.15, in both conditions —
that half stands. **What does not stand is "never negative", and the material
question is not settled at the worst frame.** The crank did **not** ship on a
lucky ordering: brass is genuinely better overall and clearly better against the
body. What is unsupported is *"a measured choice rather than a lucky one"*
standing **without qualification** — which is what was relayed to the owner, and
what is now qualified here.

**The sharpest form is a NAMED PREDICTION, in the build script, falsified.**
`tools/blender/enemy_hedger.py` says why the rejected material was rejected:
*"it rides the outer end, the most unoccluded point on the assembly and the part
most often over open road, where `tin_dark` is CR 1.26 and would vanish."*
**`tin_dark` is the material that renders most visible over that road** — 1.45,
1.66, 1.56 at frames 11, 0, 1 — while `brass`, marked **PASS** at 3.28, renders
worst there at 1.20, 1.09, 1.22. **The material the record says "would vanish" is
the one that survives; the one chosen to survive is the one that vanishes.**

**And the full ordering inverts with it — the table did not merely miss the road,
it predicted the EXACT REVERSE, in full order, on the one comparison it was used
to decide.**

    PALETTE   vs roadTop #274553  vs roadSide #0a1922
    brass          3.28                 5.75
    tin            1.51                 2.66
    tin_dark       1.26                 1.39

    RENDERED  frame 11  frame 0  frame 1
    brass       1.20     1.09     1.22     <- palette's first
    tin         1.24     1.36     1.25
    tin_dark    1.45     1.66     1.56     <- palette's last

`roadTop` 3.28 was **the deciding number** that carried brass over `tin_dark`,
and the table ranks brass first against **both** road surfaces by 2.6x–4.1x, so
the prediction does not depend on which one the bar overhangs. Road colours read
from `js/gl/gl-world.js:207-208`.

**The qualifier matters as much as the finding, and it is the same discipline
that caught everything else today: "against the road" unqualified is too broad.**
Brass is correctly ranked first on **9 of 12** frames; the full three-way ordering
is correct on **7 of 12** (frames 8 and 9 swap `tin` and `tin_dark` while brass
stays top); the ordering is completely reversed on **3 of 12**, contiguous. **So
the table is not noisy — it is confidently wrong in a specific window**, which is
the worse failure: a brief-writer consulting it would have come away reassured
rather than uncertain.

**And it is not a usable inverse instrument, for a reason better than the hit
rate: the palette figure carries no signal about WHICH REGIME you are in.**
Nothing about 3.28 tells a reader whether this is one of the nine frames it is
right about or one of the three it is exactly backwards on. A genuine negative
instrument would say when to flip it. There is nothing here to invert.

**Scope, and it matters more than the fractions: "three quarters" is NOT A
RATE.** This is one crank, one road, three candidates, one bearing, twelve
frames. A different part could invert on ten frames or none. **What generalises
is the structure — both directions fail and the figure does not say which regime
applies; the fractions are evidence FOR that structure, not a measurement of how
often palettes mislead.** Quoting 75% back as an engine property would be the
same error this whole section is a record of.

**Still owed and kept open: the road is not uniform either.** The crank may
overhang road, road edge and whatever borders them, and those are not separated,
so the figures above are themselves an aggregate over an unsplit population.

**THE POPULATION LESSON, FOURTH INSTANCE IN ONE SECTION IN ONE DAY, ALWAYS THE
SAME SHAPE — a statistic quoted over a population that was never split.** Two
pairs quoted as a spread; one frame quoted as an ordering; one median quoted over
two different neighbours; and now a road that is not one surface. **Every one was
caught by asking what the number is a statistic OF, and none by re-checking the
arithmetic, which was correct every time.** The operational form now in the
standard: when a part touches more than one thing, its contrast is not one
number — split by what is actually behind each pixel, and say which neighbours
the split covers.

**AND THE SHARPER DIAGNOSIS UNDERNEATH IT, which is not a splitting failure at
all: ENUMERATING IS NOT MEASURING, AND A SET NAMED IN PROSE READS AS COVERED.**
The crank's two neighbours were **listed, in writing, in the build script that
made the decision** — *"it lies against the hip AND overhangs the road"* — and
then every subsequent measurement, by everyone, quietly covered one member of
that set. The deciding neighbour was named by its own author and measured by
nobody, through an entire before-and-after review. That is worse than forgetting
to enumerate and more useful as a rule: **a set named in prose reads as covered,
so check coverage against the list rather than against the prose.**

**2026-08-13 — the other six house-standard commits, narrated. Paying a debt
petra made visible rather than counted.**

Seven commits landed against `tools/blender/HOUSE-STANDARD.md` in one afternoon
and **not one carried a CHANGELOG entry**, though the preamble above requires one
for every change. petra reconstructed the section-4 episode and named the rest so
the debt was visible; these are the six she did not narrate, and they are mine.

- **`c4a5ce3`** — *"the default camera" is a number per viewport.* `fitBounds`
  depends on aspect, so two rigs whose canvases differed by two pixels produced
  2021.3631 and 2021.237. Harmless numerically; unless the viewport is stated the
  next two-rig disagreement reads as a finding when it is a window size. Also:
  **a single frame is worth about 13% of the silhouette** (the Gleaner runs
  134–151 lit px across its eight walk frames), so a moving part wants a
  per-frame curve rather than a number.
- **`7b05841`** — *measure adjacent-pair separation at three bearings, and never
  average a width over yaws.* A mean over 12 bearings called the rebuilt Skimmer
  a uniform shrink — the one thing its card forbids — and nearly reverted a
  rebuild that had worked; per bearing the narrowing is −10% head-on and −35%
  broadside, and the separation tracks the anisotropy. Two defects hid behind the
  standard three-quarter view in one day.
- **`e5fb26e`** — *bracket a read against synthetic merge, never threshold it.*
  A part painted the exact colour of the body behind it still changes 0–34 px, so
  "the picture changed" passes a totally merged part. Measure the part painted to
  merge, as authored, and painted maximally different; report where the authored
  value sits between its own two bounds.
- **`080c6e8`** — *a separator must name its axis, and only height is
  bearing-invariant.* The Skimmer separated on y and failed head-on; the Tun
  separated on x and failed broadside, matching the Gleaner on **both** axes
  visible at that bearing. Neither was a modelling error — both were briefs that
  never named an axis. **For anything that multiplies, prefer a height
  separator.** Also records that a cross-commit visual comparison needs a
  stability control.
- **`0510ab6`** — *sample the extreme, not the centre.* When a population's
  members are not simultaneous the player samples them serially, so a median over
  frames, a mean over yaws and a max over vertices all hide what he sees. Five
  findings that day were instances, including the fifth and subtlest: **choosing
  which frame to photograph before measuring which frame carries the defect.**
- **`845f6a4`** — *a bearing is a camera yaw unless it says otherwise*, and any
  figure crossing between rigs carries its metric, bearing and viewport. "Yaw 0"
  was exact in the path-direction convention and pointed, read as a camera yaw,
  at the one bearing where the defect being fixed did not exist.

**And the process finding underneath all of it, which is the part worth keeping.**
Two of those commits swept petra's uncommitted edits to the same file in under
someone else's message — `4a18cc0` carries 135 lines of hers. Nothing was lost
and `refs/sync-backup` stayed empty, but `git blame` now misattributes her text.
**The standing rule all day was "explicit paths only, never `git add -A`", and
explicit paths do not protect you when two people are editing the same file.**
The rule needs its second half: **`git diff --cached` before every commit, and if
a hunk is not yours, stop.**

> *(Later the same day this rule was stated canonically in
> `.claude/org/PROTOCOL.md` → **"Anything you quote to direct someone else's work
> carries its provenance"**, and it gained two halves this entry does not have:
> **"stop" needs a next step** — the `git apply --cached` recipe for staging only
> your own hunk, because without one the next person under time pressure commits
> anyway — and **vera's finding that `git diff --cached --name-only` cannot
> detect this failure at all**, since it prints the same single filename whether
> or not someone else's hunks rode along inside it. **Do not act on the
> two-thirds version recorded above; the file-list check reads as diligence and
> is blind by construction.** The rule is not repeated here — that is the point
> of it living there.)*

**2026-08-13 — RETRACTION, same day, of my own ranking claim. A palette table
cannot reject, cannot threshold and CANNOT RANK. It can only flag a gross
difference.**

**The claim was mine and it was drawn from one frame of a twelve-frame
population.** In the entry below I wrote that the palette table still *ranks* —
order preserved, magnitude not — from a sweep whose rendered medians were
monotone non-decreasing. Measured across all twelve frames of the same sweep,
under the same conditions, **every frame carries at least one rank inversion
against palette order**:

    frame       0  1  2  3  4  5  6  7  8  9 10 11
    inversions  3  1  5  7  7  4  1  4  7  8  7  3

**Frame 6 has the fewest — one, and that one a 0.002 near-tie — and frame 6 is
the column I was given.** Frame 3 has seven, frame 9 has eight. juno reports the
slice as her error rather than mine; the inference from what I was handed was
sound, which is exactly what makes it worth recording.

**The failures are severe, not marginal.** `tin` at palette 1.00 against
`tin_dark` at 1.91 — nearly a full CR of paper advantage — **renders in the wrong
order on six of twelve frames.** Largest reversed gap measured: **1.17**
(`core_red` 1.72 beating `black` 2.89). A material with a large palette advantage
can render *worse* than a same-material pair across half a crank cycle.

**WHAT THE DATA DOES SUPPORT, and it is what the standard now says.** The palette
figure separates gross tiers without ordering inside them. Above **palette CR
3.5** (`grey75`, `teal`, `white`) candidates rendered 1.85–3.46, always clear of
and correctly ordered against everything below, on every frame. The eight from
**palette 1.00 to 2.89** rendered inside a **1.12–1.57** band and were scrambled
within it on every frame. So a brief-writer can tell *"obviously much lighter"*
from *"roughly similar"* and nothing finer — **and nearly every real material
decision on this project sits inside the scrambled band.** The useful range of
the table is the range almost nobody needs.

**THE SUPERSESSION CHAIN IS NOW IN THE STANDARD, because one question was ruled
four times in two days and a reader arriving cold cannot otherwise reconcile
them.** Every step narrowed what a palette table may be used for, and **every
step was overturned by a wider population rather than by a better argument**: the
ceiling claim died to two rendered pairs; "cannot settle within 0.7 CR" died to
eleven candidates; "it ranks" died to twelve frames. If a fifth ruling comes it
will come from a second part, not from an argument.

**A LIVE CLAIM ABOUT A SHIPPED MODEL IS WITHDRAWN WITH IT.** *(Both figures owed
here have since been measured — see the entry above. The twelve-frame pair came
back clean; the road did not, and brass is the worst of the three on a contiguous
quarter of the cycle. The withdrawal below was right and the reason it gave was
too narrow.)* `brass` 1.41 against
`tin_dark` 1.28 — the figure that made the Hedger's crank material look *measured
rather than lucky* — **is frame 6 alone**, and `tin`/`tin_dark` reverses on half
the cycle at a wider palette gap than brass enjoys. **Brass over `tin_dark` is
not established across the crank cycle.** The outcome may well still be right;
the reason given for it is not evidence. Owed: that pair across all twelve
frames, and brass against the **road** — the second neighbour, the one that
actually decided the material, never measured on pixels at all.

**THE PROCESS LESSON, AND IT COST TWO OF US: A SECOND SIGNATURE IS NOT A SECOND
SOURCE.** I inferred the ranking from one column; kaz then **ran the monotonicity
check himself, confirmed it, and wrote "verified rather than taken" into a
ruling.** The arithmetic was right both times. Neither of us asked what
population the column was. So this is not a manager accepting a report too
readily — it is a manager **independently reproducing an error and giving it a
second signature**, the "verify, do not take" habit running in reverse.
**Re-deriving a number from the same sample tests the arithmetic and nothing
else; verifying a claim means asking what it was measured over.**

**And it happened underneath this document's own rule.** *Sample the extreme, not
the centre, when a population's members are not simultaneous* was committed to
`HOUSE-STANDARD.md` at `0510ab6`, hours earlier. Twelve walk frames are exactly
that kind of population, and the claim was built on **one interior frame** —
neither extreme nor centre. **The section carrying the rule broke it**, and that
is recorded in place rather than tidied away, because a document that shows its
own rule being violated inside itself is worth more than one that reads clean.

**What is NOT affected:** the p90 refutation of the ceiling claim, which is
per-pixel within a single frame and so cannot be flattered by frame choice; the
monotone compression and its crossover at palette CR ≈ 1.2, which are properties
of the mapping rather than of the ordering; and the palette-space ruling on the
bands.

**2026-08-13 — contrast ratio is computed on RENDERED PIXELS, never on palette
values. The palette-CR method is retired, the bands it fed are palette-space
only, and `AGENTS.md` finally points at the standard that carries them.**

**RECONSTRUCTED AFTER THE FACT, and the gap is the first finding.** The house
standard changed in **seven commits** across 2026-08-13 — `c4a5ce3`, `7b05841`,
`e5fb26e`, `080c6e8`, `4878259`, `80475da`, `4a18cc0` — and **not one of them
carried a CHANGELOG entry**, though this file's own preamble requires one for
every change. This entry is written from the git history and the documents
rather than from the work as it happened; the six commits it does not narrate
are listed here so the debt is visible rather than merely counted. Part of the
section 4 text described below also landed inside `4a18cc0`, which was another
agent's commit picking up my uncommitted working-tree edits — nothing was lost
and nothing was overwritten, but the attribution in git does not match the
authorship, and that is worth knowing before anyone reads `git blame` on that
section.

**THE METHOD THAT WAS RETIRED.** Section 4 said a material's contrast ratio
could be computed from palette values, and that the palette figure was a
**ceiling** — so a pair that failed on paper could not be rescued by lighting,
which made the table usable to *reject* a palette before anything was built.
kaz ratified that on 2026-08-12. It is false. **The palette number is albedo: an
input to the render, not a prediction of it.**

**The sequence matters, because three people overturned each other in about an
hour and each step was right.** juno measured two pairs and the ceiling failed in
both directions; kaz retracted his own claim (`4878259`) keeping "the thresholds
still stand"; mira overruled that half (`80475da`) — the bands were reasoned
about albedo, and applied to rendered numbers they declare an
identical-material pair legible, which is the exact defect the crank
investigation started from; **juno then withdrew her own error figure** and
replaced it with an eleven-pair population; kaz ruled on that sweep (`4a18cc0`)
that the bands are **palette-space bands** and a rendered CR must never be
compared against them.

**THE SELF-CORRECTION IS THE MOST REUSABLE PART.** "Roughly 0.3–0.7 CR of error
with no reliable sign" had already been written into the standard when it was
questioned — not for being wrong, but for not naming its population. It was an
impression from two pairs. Asked what the number was measured over, its author
ran eleven and **retracted it herself**: the real error is **+0.17 to −3.66**,
understated roughly fivefold at the top of the range, and the sign is not random
at all. **A figure whose population cannot be stated is not yet a
measurement** — and the cost of asking was one run, against a wrong number that
was already in a standard other people build against.

**What the sweep actually shows.** A clean **monotone compression** with a
crossover at palette CR ≈ 1.2: below it the render *adds* contrast, above it the
render *removes* it, and the deficit grows with the palette figure. A palette
span of 1.00–6.30 arrives on screen as **1.17–2.63**. Two consequences the
two-pair version could not reach:

- **the ceiling claim fails for EVERY pair, not only the identical one** — at the
  90th percentile of the part's own pixels the rendered CR *exceeds* the palette
  figure in all eleven cases (tin 1.00 → 1.97, white 6.30 → 8.62), so some of a
  part's pixels always beat the albedo ratio;
- **the "over 2.0" band is close to unreachable in rendered units**, which is
  what makes the bands palette-space rather than merely miscalibrated.

**~~But the palette table still RANKS — the rendered median is monotone
non-decreasing in the palette figure, so order is preserved and magnitude is
not.~~ RETRACTED THE SAME DAY; see the entry above this one.** The sweep it was
inferred from was one frame of twelve, and it was the best of the twelve. Across
the full population every frame carries at least one rank inversion. The live
rule is that a palette table **can only flag a gross difference** — it cannot
reject, threshold or rank. The rest of this entry stands; the compression curve
and the crossover are unaffected, because those are properties of the mapping
rather than of the ordering.

**THE MECHANISM IS THREE TERMS, NOT ONE, and getting the set right matters
because two of them are levers someone might reach for.** Per-face illumination
under the directional key; **chromatic ambient and fill** (`uAmbient`
[0.125, 0.142, 0.180] and `uFillColor` [0.075, 0.110, 0.155] are both
blue-weighted, so identical albedo at different normals diverges on *hue*, not
only on level); and a height-driven lift, `lit *= 1.0 + clamp(vDepth * 0.0016,
0.0, 0.14)`. **The height term is real and small — do not reach for height as a
contrast lever.** Its 0.14 cap needs `world.z` = 87.5 and a Hedger stands 47, so
across the crank against the body it is worth about 1.03 CR, a second-order
contributor rather than the explanation. A first reading of this file called it
"the one that most directly explains a bar-against-hip pair"; that was wrong and
was measured down before it was written. **Naming trap: `vDepth` is `world.z`, a
HEIGHT, not camera depth** — read in the fragment shader alone it looks like a
distance fade.

**LIVE CONSEQUENCES, none of them cosmetic.**

- **The Hedger's crank does not clear section 3 as measured, and the standard now
  says so plainly**: contrast 1.30–1.88 against the 2.0 gate, and the area route
  marginal at ~9–13% against an ~11% floor. The honest sentence is *occlusion
  eliminated outright, contrast improved, threshold not met* — which is why a
  before/after at the least flattering frame goes to the owner to judge by eye.
- **~~Brass over `tin_dark` is now MEASURED rather than lucky~~ — WITHDRAWN, see
  the entry above: that figure is frame 6 alone** — 1.41 against 1.28
  rendered, the same order the palette gave. **Brass against the ROAD, the second
  neighbour and the one that actually decided the material, has never been
  measured on pixels. Owed.**
- **`skin_dark → gold_dark` "cannot exceed CR 1.025 under any lighting
  whatsoever" is retracted** — the sharpest casualty, because no claim of the
  shape *no lighting can reach this* survives in this renderer. The conclusion is
  kept as a **prediction**, and the standard now names the two live decisions
  that rest on the retired proof: the A1/A2 tier-legibility call, and the design
  question already routed to vera and Diego about whether a $600 tier may be a
  reward rather than a read. Neither is withdrawn; both should know the floor
  moved. A rendered re-measure is owed.

**TWO REPAIRS THAT WERE ARTEFACTS OF THREE PEOPLE EDITING ONE SECTION AT ONCE.**
The eleven-pair mapping had been written **twice, about 140 lines apart, inside
one hour**, by two people who could not see each other's drafts — merged to one
copy beside the bands it governs, with the candidate names kept at the other
site. And two sentences inside the retraction box still asserted what had been
overruled after them: *"the thresholds below still stand"*, and *brass beating
tin was "luck rather than knowledge"*. Both now carry their supersession rather
than being deleted, so the reversal is legible instead of silent.

**`AGENTS.md` NOW POINTS AT THE STANDARD, WHICH IT NEVER DID.** The file map
listed `WARBRINGER_CONCEPT.md` but not `HOUSE-STANDARD.md` — 982 lines, the
operative standard every model this week was built to, and invisible from the
source of truth. Both it and `BRIEF-siphon-idol-gesture.md` are now in the map,
and clause 7 (*keep the palette a value ladder*) points at section 4 for the
instrument. **Deliberately a pointer and not a copy**, and the entry above is the
argument for it: that measurement has now been revised three times in two days
while clause 7 has not moved once, so a copy would be the drifting one.

**One convention added, one routed away.** *Name the commit a measurement was
taken at* — `ddef990` → `1769dcf` is the case, where three people published
extent tables measured at `ddef990` while the narrowed Skimmer was already on
disk, and one was a step from correcting a builder about a model that no longer
existed. It is a company-wide reporting rule, so its home is
`.claude/org/PROTOCOL.md` and it is only pointed at from the standard, where
model measurements actually get quoted. The sibling convention — *quote the
viewport beside the camera distance* — was already landed in `c4a5ce3` and is
**not** repeated.

**2026-08-13 — the Tun is SHORTER. 19.62 → 16.14 screen rows against the
Gleaner's 20, on the two clauses of its own card that were never built. And the
floor turned out to be the model's own boot, not the ground.**

Measured in the running game, the Gleaner/Tun pair separated at **0.57 at
broadside — the worst pair on the board** — while scoring 0.80–0.89 at the two
standard views, which is why it passed review: nobody had shot broadside. Off
both model files the cause was exact:

| axis | Gleaner | Tun |
|---|---|---|
| y (across) | 0.510 | 0.510 — identical to the digit |
| z (height) | 1.190 | 1.190 — identical to the digit |
| x (fore/aft) | 0.498 | 0.699 — +40%, the entire separator |

**Height is the only bearing-invariant dimension.** A body yaws with the path,
so a width separator is a coin flip on where the player is looking; a shorter
body reads at broadside, three-quarter and head-on alike. Two clauses of the
Tun's card were unbuilt and both were height — *"the Gleaner's legs shortened"*
(the legs were byte-identical to the Gleaner's) and *"the torso is mostly
deleted"* (the body still reached the Gleaner's full 1.190). The card's other
half, *"and doubled to four"*, stays unbuilt on mira's ruling that leg **count**
is not countable at 10 px.

**Two levers, in `tools/blender/enemy_tun.py`.** The antenna owned the crown at
1.190 while the head topped out at 1.034, so it was spending 0.156 u by itself:
it is now **raked back over the cask rather than deleted** — same cylinder, same
radius, same length, because the chassis calls it load-bearing against the
silhouette reading as a person, and swept back it stays inside the cask's
existing x envelope so fore/aft does not grow. The other 0.055 is the shin,
0.380 → 0.325, with the whole body descending with the hips, cask included. The
drop comes out of `lift`, **not** out of `body_z`, so the body root stays at
z = 0 and model contract clause 3b holds by construction — `check-model-top.js`
reports enemy-slow top 0.979, posed 0.979, **margin +10.0 px, the full crown pad
intact**. x 0.699 and y 0.510 are unchanged to the digit: drum width and leg
tuck were measured correct and were not in question.

**THE FLOOR IS THE BOOT, NOT THE GROUND, AND IT HAD TO BE MEASURED PER FRAME.**
The bob puts the cask lowest at |phase| = 1 while the swing foot peaks near
phase 0 — close to antiphase — so a min-against-max read over the walk cycle
understates the gap and would have licensed a drop that clips. Two extremes that
never co-occur is the shape that produces a confident wrong clearance. Per
frame:

| hip drop | rows | cask→boot | cask→ground |
|---|---|---|---|
| 0.000 | 17.05 | 0.084 | 0.181 |
| **0.055** | **16.14** | **0.029** | **0.126** ← shipped |
| 0.084 | 15.66 | 0.000 | 0.097 — boot touches the cask |
| 0.124 | 15.00 | −0.040 | 0.057 — boot passes **through** it |

So **15 rows is not available** while the drum keeps its width and its belly
placement: the cask reaches the boot at 15.66 rows with 1.6 rows of ground still
under it. 16.14 keeps a third of the original boot clearance.

**Declined, both after measuring.** Lowering the head, or raising the cask
inside the body — the head is already sunk into the cask and the lens sits only
~0.02 u proud of it in its own column, so either move buries the identity slot.
The head/cask relationship is frozen and the whole assembly descends together.

**`enemy_chassis.py` was NOT touched, and that is why two parts are forked.**
`chassis.legs()` takes no length and `chassis.head()`'s antenna is a flag rather
than a pose; editing the shared module would rewrite five shipped bodies, and a
second build was in flight on it at the time. So `build_short_legs` and
`build_raked_antenna` live in `enemy_tun.py`, declared in its header the way the
drum already is, forked from `CHASSIS_VERSION 1` with knee, stance, repair cuff,
foot, and the antenna's radius and length carried across to the digit. **A later
chassis change to a leg or an antenna will not reach this body** and must be
re-forked by hand.

**This is a re-pose, not a removal, so it is not cheaper: 2,584 triangles out,
2,584 back.** An earlier framing called it free because it was a deletion; it is
not one, and height being bearing-invariant was always the whole argument.
**Recorded as a candidate and deliberately not acted on:** the torso box's
bounding box sits inside the cask's, suggesting ~540 dead triangles — but that
is a bounding-box argument, and two boxes nesting says nothing about two solids.
The cask is a cylinder and a rectangular torso can push its corners through a
curved wall. It needs a per-part occlusion test before anyone deletes anything,
and it needs a flag on `chassis.torso_frame`, which is not a one-body decision.

`assets/preview/easy_tun.png` re-rendered from the new geometry. Rendered alone
rather than through `--easy-five`, because that sheet also re-renders the Hedger
and another build was rebuilding it — a picture of a superseded file is the
failure this job kept hitting.

**2026-08-13 — model contract clause 3b, the rest-frame rule, written into
`AGENTS.md`. The `radiusPx()` extent distinction. And the three passages held
uncommitted since 2026-08-12, finally landed.**

**The owed clause is paid.** The entry below records the group-root invariant
and states, correctly, that the `AGENTS.md` clause for it was owed and could not
be written because the file held another division's uncommitted work. That
blocker was mine and it is cleared in this commit — see the third section. The
clause is now **3b**, placed immediately after clause 3 rather than inside
clause 6: clause 3 is what introduces the group root, and clause 6 governs the
model ORIGIN, which is a different node. A model can satisfy 6 perfectly — flush
foundation, feet at z = 0 — and still bury its own health bar the moment it is
rigged. The clause carries the constructive rule (topmost group root at z = 0,
identity rotation at frame 1), the inequality a model must satisfy, the gate
that checks it, and the caution that the root's own z is not the proof because
it translates for the walk bob.

**THE DEFECT IS NOT ENEMY-ONLY, AND A CLAUSE THAT SAID SO WOULD HAVE BEEN TRUE
AND STILL MISLEADING.** Towers reach the same code through `towerCrown` at scale
1. Swept across all 101 registered models, mirroring `drawActor` including the
two ranges it draws with `fixedMat` and no pose: **33 under-report by ≥ 0.5
board px**, and `recruit-b4` *over*-reports by 0.19. Under the rest-frame rule
exactly **five** models are over the line today — `enemy-brute` 27.2 px inside,
`enemy-hive` 25.1, `enemy-normal` 9.7, `warbringer-a3` 2.5, `warbringer-base`
0.8. Everything else clears at rest, `enemy-swarm` by 3.5 and `enemy-flying` by
4.9 (2.3 at its tallest frame, and the flier's bob cancels exactly rather than
approximately, because `enemyCrown` and `drawEnemies` call the same
`flightLift(e, radius)` inside one `draw()`).

**Why REST frame and not worst frame, which is the whole substance of the
decision.** `warbringer-a5` and `-a4` are 25.3 and 24.1 board px under at their
worst frame and **0 at rest** — that height is the hammer mid-swing. A
max-over-frames rule would anchor the A5's health bar 25 px into empty air in
the pose the tower holds most of the time. "The model's true top" is ambiguous
for anything that swings, and the clause says *rest frame* in those words for
that reason.

**Which makes `tools/check-model-top.js --all` stricter than the clause it
gates, and the clause now says so.** It sweeps every frame, so it reports nine
models rather than five; the four extra — `warbringer-a4`, `-a5`, `blub-superb`,
`sniper-b3` — are clear at rest and over the line only mid-swing. Run bare, on
the enemies, it agrees with the clause exactly, because no enemy rises above its
own rest pose. Reported to the tool's owner rather than changed here; a gate that
is too strict in a mode nobody runs by default is a footnote, not a defect, but
it would have produced four confident false failures the first time someone
audited the towers.

**A correction to the figures on record, and the cause is worth more than the
numbers.** The depth-inside figures carried since 2026-08-12 were `enemy-brute`
29.7 and `enemy-hive` 36.1. They are wrong. 29.7 is `24.81 × 1.6` and 36.1 is
`21.94 × 2.1` — brute scaled by hive's `sizeScale` and hive by the colossus's,
one row out in the `sizeScale` column. The models had not moved (`enemy-brute.js`
and `enemy-hive.js` last changed in `e3bd3f4`, and `git log -S'sizeScale: 1.5'`
on `js/enemy.js` returns only `e3bd3f4`), so this was never a measurement error.
`enemy-normal` 9.7 and `enemy-swarm` 3.5 reproduced exactly from the same
derivation, which is what proved the model of `crownOf` right and localised the
fault to those two rows. Four independent routes now agree on the corrected set:
a posed sweep of the runtime data, vertex geometry, the Blender rig's body-root
heights, and `crownOf` re-derived from source.

**The runtime is NOT repaired and the clause does not claim it is.** Teaching
`model.top` to read rest-frame posed geometry is gated on an occlusion
measurement: `crownOf` also feeds `bodyTopOf` and the Siphon occluder capsules,
so making a body taller makes its occluder taller, and over-occlusion
photographs as success. It lands as its own commit after the five new models.

---

**`radiusPx()` IS THE GAMEPLAY EXTENT, AND ON THE 3D BOARD IT IS NOT THE DRAWN
BODY.** The sprite-extent paragraph in Enemies now says so, and the current
values row is renamed from "Enemy sprite radius" to "Enemy gameplay radius".
Same conflation, same day, as the one that sized nineteen design cards against a
body twice the real width.

What is true, and it is a proportion rather than an absence of relation:
`radiusPx()` **does** scale the mesh — `drawActor` is handed `radiusPx() / 11` —
but the mesh's drawn extent is `its own extent in Blender units × unitsToPx ×
radiusPx() / 11`. **How much of its own circle a body fills is authored into the
model, not derived from the type**, and across the shipped roster it runs 0.72
(`enemy-normal` at rest, 0.86 at the stride extremes) to 1.57 (`enemy-brute`) to
2.14 (`enemy-hive`). Writing that the two are *unrelated* would have been the
opposite error and was rejected: a reader would conclude they can be reasoned
about separately, and they cannot.

**What was NOT changed, because it is right.** On the 2D renderer the body
really is drawn `2 × radiusPx()` across — `ctx.ellipse(x, bodyY, radius, radius
* 0.96)` — so "an enemy is 22 px across" was true when it was written and is
still true there. `js/bullet.js:258` ("the shot teleported clean over 22 px-wide
bodies") is about collision, which tests the gameplay circle, and is correct as
written. The sprite-versus-road passage in Enemies is also correct: `ROAD_WIDTH_UL`
21.875 × `UNIT_LENGTH` 1.04 = 22.75 px, and the overhang conclusion survives at
the real drawn widths. Two things are wrong about the phrasing rather than the
number — it is quoted as a **constant** when 22 is only the `normal` value and
every other type scales it, and it is quoted without saying which renderer.

**A second false alarm the clause now warns about.** A check built against the
bare `radiusPx()` circle rather than the ring radii reported four of five meshed
enemies as overhanging their own rings. With the pads named — hover at
`radiusPx() + 9`, frost and camo at `radiusPx() + 4` — only two are.

**ROUTED, NOT FIXED — three source comments carry the same conflation and are
not this file's to repair.** All three verified at source on 2026-08-13:

- `js/enemy.js:1097` ("An enemy is 22 px across and crosses the screen at ~78
  px/s, so hit-testing the body exactly…") — the hit test really is the 22 px
  circle, so the mechanism is right; what misleads is calling it *the body*
  without a renderer, and quoting a per-type value as a constant.
- `js/enemy.js:1015` — the same sentence in the lane-spread note. Conclusion
  intact, phrasing identical.
- `tools/blender/enemy_normal.py:24` ("`Enemy.RADIUS_PX` is 11, so this is
  roughly 22 px across in play") — **this is the load-bearing one.** It is the
  premise under WHY EVERYTHING IS BOXES, in the build script that every later
  body was measured against. Its conclusion does not just survive at the real
  size, it gets stronger: the Gleaner draws ~148 lit pixels in a 10 × 20 screen
  box, so there is even less to resolve than the comment claims.

`js/enemy.js` belongs to the simulation division and `enemy_normal.py` to
rendering; neither is documentation, and the archivist does not edit game code.

---

**THE 48 HELD LINES, WRITTEN 2026-08-12 AND LANDED TODAY — and they were never
another division's.** `tools/check-model-top.js`'s owner was told, correctly for
what could be known at the time, that `AGENTS.md` held "48 uncommitted lines from
another division", and gated a clause on it. Attribution says otherwise: the last
five writes to the file are a previous archivist instance at 2026-08-12
13:03:43–13:05:10Z, writing to a ruling made two minutes earlier. The rendering
division's own write that day (12:43:19Z) had already landed in `e88c6b3`. The
warning against `git commit -a` was right; the ownership was not, and the debt it
created is cleared here rather than handed on.

The held text itself is unchanged from 2026-08-12 and every figure in it was
re-verified at runtime before committing:

- **`tools/measure-starter-kit.js` is marked PROVENANCE VOID in all three places
  `AGENTS.md` cites it** — the file map, the starter-kit table, and the Summoner
  section that calls it "the premise the whole meta loop rests on". It is pegged
  to the gunner deleted 2026-07-30, so nothing live is checking that premise.
  The conclusions are KEPT and no replacement number is invented: the starter bar
  still loses on every route, and the first-run death wave is left explicitly
  unknown, with all three disagreeing sources named (`js/meta.js:283` says 17,
  the table says 19–20, the dead tool reports 11). Writing 11 would be worse than
  leaving it, because 11 is the dead tool's output. Re-measuring is unauthorised
  new work.
- **The bounty-to-health ratio's denominator is named as EFFECTIVE HP**, which
  is load-bearing: 0.905 is `23 503 / 25 969`, and against *declared* health the
  same figure is 0.9847. The `shielded` trap is stated in full — 20/12 = 1.6667
  declared against 20/36 = 0.5556 effective, because a Bulwark carries 24 shield
  on 12 health and the shield pays nothing, so the same type reads as the top of
  the range under one denominator and near the bottom under the other. It has
  already been reported as a defect once. `revenant` splits the same way (1.25
  against 0.625); every other type of the 21 is identical under both, which is
  why the mismatch stayed invisible.

**2026-08-13 — the Cooper (`enemy-camo_normal`), and it is deliberately
indistinguishable from the Gleaner.**

Diego ruled on camo: *"do the camos like the others, just make them a bit
translucent or sum."* So a camo body is an ORDINARY body and the identifying cue
is the renderer's, not the mesh's. This model was held for most of the job
because its read deferred to a cue that was drawn nowhere under `js/gl/` — 0 px
on both GL paths against 328 px on the 2D fallback. That cue is now being ported
into the GL path, so the model no longer depends on something that does not
exist.

**A pairwise separation sweep will put Cooper-vs-Gleaner at or near the bottom of
the board. That is this model working.** The note is in the file header too,
because the number looks exactly like a failure.

A cooper is a barrel-maker and this one has closed its hold. The Gleaner's cargo
weeps — lit panes, a glowing core behind bars; the Cooper's is capped, blinded
and sealed. The gasket lid's only silhouette job is its rim: 0.125 against the
drum's 0.108, so it stands 0.017 u proud and squares off a profile that was
round. It is also placed to ENCLOSE the glowing core, so the sealed cage's
construction needs no change — only the panes' colour, which is the plating
variation Law 02 sanctions in its own words.

Three things deliberately not modelled: the **eight bolt heads** (0.4 px each,
under the floor where a feature stops existing, times up to 107 bodies on
screen); the **blinded windows**, which are recoloured rather than covered,
because blinding a window is a material fact and modelling a cover would add
solids to say what the palette already says; and **any second silhouette
feature**. The grab handle is kept as fiction and is expected not to read.

**3,928 triangles — and the expectation going in was that it would be the
cheapest of the batch. It is the second DEAREST.**

    Tun     2,584      Skimmer  3,508      Drudge  3,520
    Cooper  3,928      Gleaner  4,032      Hedger  4,072

The reason is structural and it confirms the house standard rather than
contradicting it: **this is the only body in the batch defined by ADDITION.** The
Drudge removed a torso, two bands, a hip brace, two knees, two upper arms and
two shoulders; the Skimmer removed a crown and two full arms; the Tun replaced a
sixteen-part cage with a six-part drum. The Cooper is the Gleaner part for part
plus a lid. *Look for the removal first* is the standard's own advice, and the
one card that removes nothing is the one that costs most.

The registered name keeps its underscore — `enemy-camo_normal` — and the lookup
was verified by RUNNING `enemyModel()` against the built file, with a hyphenated
control returning null.

**2026-08-13 — the Hedger's crank: mirrored to the near hip, made brass, and a
clause-8 interpenetration that had been shipping since `e015ef5` removed.**

**The mirror.** juno measured what had been reported by eye, and the mechanism was
not the one that was reported: the crank does not MERGE with the body, it is
OCCLUDED by it. At yaw 0 the arm sat on the far hip and its visible area swung
4 px to 63 px across one crank cycle — 8% to 86%, a 16x range within a single
revolution. Path direction buckets to yaw 0 on 25 of 42 segments across all six
maps and to the opposite broadside on ONE segment of ONE map, so there was no
trade between viewing angles to balance: one hip is simply correct.

**A merge is a contrast failure and argues for a lighter part; occlusion is a
geometry failure and argues for moving it. Same symptom, opposite build.**

**The phase relationship survives the mirror unchanged, verified rather than
assumed.** Low point stays at frame 1, high at frame 7, handovers at 4 and 10.
The reason is in the data rather than argued: at frame 1 `foot_l_x == foot_r_x`,
the legs exactly passing — a side-independent condition, so mirroring cannot
disturb it. Flipping the offset "to be safe" would have moved the low point onto
a footfall and broken the thing the offset exists for.

**The material: one brass assembly — bar, plate and collar at one value.** The
part has TWO neighbours, not one: it lies against the hip AND overhangs the road,
and the overhang is the entire point of the low placement.

    candidate    vs tin (hip)   vs roadTop   vs roadSide   WORST
    tin (was)        1.00          1.51         2.66       1.00  FAIL
    tin_dark         1.91          1.26         1.39       1.26  FAIL
    stone            1.55          1.02         1.72       1.02  FAIL
    brass            2.17          3.28         5.75       2.17  PASS

**`tin_dark` is the worst option available and the one that looks nearest to
passing on a single-neighbour table.** 1.91 against the hip reads as "nearly
fine"; against the road it is 1.26. It would have cured the hip merge and created
a road merge exactly where the bar does its silhouette work. **Darkening a part
that overhangs a dark background is the intuitive move and it is backwards.** A
material must clear its WORST neighbour, not its nearest one.

**The clause-8 fix, which is not the mirror's fault.** The crank collar passes
through the arm as it turns, and has since `e015ef5`. Proved per part, per frame:

    shipped   (+y hip, collar 0.75t)   18 penetrating pairs, worst -0.0093 u
    mirrored  (-y hip, collar 0.75t)   22 penetrating pairs, worst -0.0087 u
    mirrored  (-y hip, collar 0.60t)    0 penetrating pairs, worst +0.0071 u

**A whole-GROUP AABB test reported "overlap" on all twelve frames for both hips,
which is useless** — two group boxes intersect happily with every solid far apart,
and it reads as catastrophic failure. Only the per-part test found the collar.
Test solids, never groups. Note also that the review instrument which passed this
model checks crown, cycle, envelope and geometry and has **no interpenetration
test at all**, so the defect was invisible to the gate that approved it.

**And the below-floor count now names its datum**, because two reasonable data
give different answers: 6 of 12 frames below the hip brace underside (0.445), 5
of 12 below the body group's own lowest point (0.379..0.414). They differ on
frame 4 alone. Both correct, different questions — a count against a threshold is
meaningless without the threshold.

**2026-08-13 — the Skimmer narrowed. The crown deletion was one axis of two.**

otto measured the first Skimmer as reading like the Gleaner — pairwise separation
0.48/0.50 against 0.80 for the next closest pair, stable at both yaws. mira found
the cause: **every width-defining group was byte-identical to the Gleaner's.**
Arms, legs and body agreed to three decimals; the only difference anywhere was
the body's top, 1.190 -> 1.034. Worse than no change — the build was slightly
WIDER than the Gleaner and 14% stubbier, so **the card asked for thinner and the
build delivered shorter**, moving the aspect the wrong way.

Narrowed per the card's own words ("chest emptied and narrowed", "arms cut to
stubs", "a thinner outline"). Height untouched at 1.034 — that separator works.

    rest pose        arm half   chest half   leg half   y span    x span
    Gleaner            0.255       0.210       0.167     0.510     0.498
    Skimmer before     0.255       0.210       0.167     0.510     0.514
    Skimmer after      0.125       0.125       0.167     0.334     0.445

**3,812 -> 3,508 triangles.** A removal, so it comes in cheaper and more
distinct, which is the house standard's own worked example.

**Two findings that changed what was built.**

**The shoulder yoke sets a body's width, not the chest.** The yoke is 0.42
across against the torso's 0.24 — the widest part of the whole body group, wider
than the cage. A brief asking for a narrower body that changed only the torso
would have measured no change at all. `torso_frame` now takes all four widths.

**Both horizontal axes matter, because enemies yaw with the path** (otto). The
on-screen width is not a fixed axis: a body walking north shows x and one walking
east shows y, so narrowing one axis alone produces a body that reads slighter on
some stretches of road and not others. x was 3.2% WRONG-SIGNED before this change
and nothing had asked for it. Both axes now come in, and the figure that matters
is the **worst-bearing plan width: 14.1 -> 11.0 screen px** against the Gleaner's
14.1.

**The legs are deliberately not narrowed** and are now the width-defining part at
+-0.167. The card does not ask them to move; whether the stance follows is a
separate decision. The arms are no longer a shared asset (stubs are a different
part, 1104 -> 636 vertices per arm); the legs still are.

Preview sheets re-rendered — `easy_skimmer.png` and `easy_five_compare.png` both
showed the old body and would have been a superseded file with a picture
attached.

**2026-08-13 — preview sheets for the four committed Easy bodies.**

`make_preview.py --easy-five` renders four craft sheets, the Hedger's crank at
both extremes, and a five-up comparison including the Gleaner. Rendered from the
committed geometry: Drudge `a00a774`, Skimmer and Tun `ddef990`, Hedger
`e015ef5`, tree verified clean at HEAD first.

**WHAT THESE SHEETS ARE EVIDENCE OF, WHICH IS NARROWER THAN IT LOOKS.** At
520x680 per angle this is roughly the player's own max zoom-in, ~11x the fitted
camera. That makes it a real view and legitimate evidence about SURFACE DETAIL.
It is not evidence about a READ — silhouette, value separation and whether a
separator announces itself are properties of the default view, and a magnified
render cannot show any of them. otto's capture from the running game is the
read; this is the craft. Both go up and neither substitutes for the other.

**`sizeScale` is applied to the comparison sheet and not to the singles.** The
Hedger's primary separator is not modelled at all — the runtime applies 1.25,
worth +72 lit px — so a five-up at one ortho would have shown it the same height
as the Gleaner and hidden the loudest thing about it.

Two framing faults were caught by rendering and looking, not by arithmetic:

- At the standard 0.92 ortho the Hedger's crank hit the tile gutter —
  `bottomMargin 0.0000` at one yaw, `contentTop 1.0000` on the crank-high frame.
  The arm was being clipped by the preview, which would have shown a shorter arm
  than the one that shipped: the same class of error as rendering a superseded
  file, with a picture attached. Hedger previews now use 1.22.
- The crank-extreme sheets were originally one yaw, and at that yaw the arm
  hangs directly in front of the torso and vanishes into it — dark bar on dark
  body, which is exactly the low-contrast case juno measured. They now render
  four yaws. **The arm reads at three of four; at the broadside yaw it merges
  with the body.** That is a real limitation of the part and is reported rather
  than framed around.

The five-up is composed from rendered tiles rather than by putting five rigs in
one scene, because `_foot_measure` resolves "foot_l" by exact name through
`bpy.data.objects` — a second rig in the same scene would silently ground itself
against the first one's foot.

**2026-08-13 — the Hedger (`enemy-angry`), body four of five. The Cooper is
deliberately NOT built.**

**Hedger — 4,072 triangles, 12 frames, and the only one of the five over the
Gleaner's 4,032.** kaz waived the ceiling on the accounting rather than by
exception: it is the only body that ADDS a limb, and it paid for it — the hold
comes down 176 triangles to fund a 260-triangle crank, which is the card's own
trade ("a hold smaller than the Gleaner's, because this frame traded cargo
space for the arm") implemented in geometry rather than asserted.

The primary separator costs nothing: `sizeScale` 1.25 already puts it at 215 lit
px in 25 rows against the Gleaner's 148 in 20. **So the geometry is NOT scaled
up** — baking a second 1.25 into the mesh would land it at 1.5625x and make it a
brute. The second separator is broken symmetry: one crank hanging off one side
of a faction that is otherwise symmetrical about its centre line.

**The arm is sized against a measured floor, not against the stated minimums.**
juno closed the house standard's open bracket — the sceptre reads at 11.6% of its
figure, the Gleaner's inspection windows do not at 0.7–3% — so the transferable
floor is ~11%, about 24 px on this body. The stated minimums project to ~20 px²
and sit AT that floor. The bar was therefore taken LONGER rather than thicker
(0.52 x 0.105, ~28 px², ~34 with the step plate): length breaks the outline,
thickness past ~2.5 px buys area inside the silhouette where it is worth least.

**And placement is decided by contrast, not area.** juno measured two 1 px
features at yaw 45: the lens survives a deletion test at local contrast 68, the
cargo core does not at contrast 10. Identical area, opposite outcome. So the
crank hangs low enough to break the outline against empty ROAD — the
highest-contrast background on the model — rather than against the torso.

Two claims in `enemy_hedger.py`'s header were wrong when first written and were
caught by measuring the exported file: "below the hip at every crank angle" is
geometrically impossible for a full revolution (when the bar points up the pivot
is the lowest part), and the replacement "7 of 12 frames, 0.05 u" was also
guessed. Measured: **5 of 12 frames, low 0.018 u, high 1.182 against the crown's
1.190** — so the crank never touches the road and never steals `model.top`.

**Cooper (`enemy-camo_normal`) is held, not forgotten, and `export_mesh.py` says
why at the empty slot.** Its design defers its read to the camo cue, and `isCamo`
is drawn nowhere under `js/gl/` — measured at 0 px on both GL paths against 328
px on the 2D fallback. Building it would ship a model whose separator does not
exist. Awaiting Diego's ruling; the brief is written and nothing in it is wasted.

**2026-08-13 — the Skimmer (`enemy-fast`) and the Tun (`enemy-slow`), bodies two
and three of five, both on the shared chassis.**

Committed together, and that is a deviation from one-model-per-commit worth
naming: their `<script>` tags are consecutive lines in the same three pages, so
splitting them would have meant one commit that leaves a page half-updated. The
generated files are independent and separately reviewable.

**Skimmer — 3,812 triangles.** The separator is a removal: the crown is gone. The
Gleaner's raked antenna is the top fifth of the figure (z 0.960 to 1.190) and
nothing occludes it, so deleting it changes the outline at the one place that
always reads. It is also view-independent, which an addition at this size is
not. Measurable consequence: `model.top` drops from 1.190 to 1.034 — the head box
now owns the extreme, which is the check that the removal is real and not
cosmetic. The lens was deliberately NOT used: it sits interior to the
silhouette, so moving it changes no outline and is a recolour by definition.
The hold moves up and back — placement only, the cage is untouched — and the
stride goes to 34 degrees against the Gleaner's 28, which costs zero triangles.

**Tun — 2,584 triangles, the cheapest Easy body and the widest.** It is also the
only one that does not carry the cargo cage, and that is a DECLARED deviation
under kaz's ruling: where a card wants a hold that is genuinely a different
object rather than the cage relocated, it is built as a new part and reported.
`cargo_cage` is not called by `enemy_tun.py` at all — nothing in the sealed part
is widened, restyled or re-proportioned. The drum's width is budgeted against
the runtime frost ring at 30 board px: it may take the full 22, which is
22 / 31.8032 = 0.692 u across, so the outer radius sits just inside 0.346 u. The
leg tuck is kept because it is better structure, not spent to buy width.

Both rig the body root at z = 0. `node tools/check-model-top.js` reports raw top
exactly equal to posed top for both, margin +10.0 board px across all frames —
the construction guarantee, not a comfortable number.

**2026-08-13 — the Drudge (`enemy-armored`), the first of five Easy bodies, and
the shared chassis they are all built on.**

`tools/blender/enemy_chassis.py` is new: the stamped frame every Easy enemy is
built from. Measured on the Gleaner, that shared frame is 3,568 of its 4,032
triangles — 88.5% — so the five bodies describe it once rather than copying it
five times. Roster Law 02 is "stamped, not born"; a faction stamped from one die
is authored from one module. The coupling is deliberate and it is dangerous:
an edit there rewrites five shipped files. `CHASSIS_VERSION` is written into
every generated header so a mismatched set shows up in a diff, and any chassis
change re-exports all five in one commit.

The chassis was proved before anything was built on it: configured as the
Gleaner it reproduces the committed `enemy-normal.js` exactly — identical
triangle multiset, palette, groups and frames. `enemy_normal.py` is untouched
and still owns `enemy-normal.js`.

The Drudge is 3,520 triangles, 12.7% *cheaper* than the Gleaner, because the
separator is a filling rather than a plating: one poured sheath from collar to
knee swallows the two real concavities (the neck notch and the hip taper), and
the torso, both bands, the hip brace, both knees, both upper arms and both
shoulders stop being modelled. The card's stated tell — "pinched at the waist" —
does not exist: 12 px of interior concavity across 96 samples, 0.125 px per
sample. Gleaner = lollipop, Drudge = bollard.

**NEW INVARIANT, AND THE `AGENTS.md` CLAUSE FOR IT IS OWED.** An animated
group's positions are stored in that group's LOCAL space, and `model.top` is the
max z over RAW positions — so a body root standing at z = 0.62 makes the model
report itself 0.62 units short and `crownOf` draws the health bar inside the
mesh. Measured on the shipped roster: `enemy-normal` 9.7 board px inside,
`enemy-brute` 27.2, `enemy-hive` 25.1. `enemy-swarm` and `enemy-flying` pass
only by luck — the 10 px crown pad happens to cover their error.

> **The rule: the animated group root that owns the topmost geometry sits at
> z = 0 with identity rotation at frame 1.** Its local space is then world
> space and the raw max z is the true max z, so the defect cannot occur. Limb
> roots stay at their joints — a limb hangs down and never owns the top. The
> root position is not the guarantee, though: the root translates for the walk
> bob, so quote the margin from `node tools/check-model-top.js`, which sweeps
> every frame, and never the root's z.

This belongs in `AGENTS.md` clause 6, which currently governs only the model
origin and not the animated group root — a different rule, and its absence is
why all four authored enemies shipped wrong. **It is not written there in this
commit because `AGENTS.md` currently holds another division's uncommitted work,
and adding our clause would sweep theirs in.** The clause is owed and routed to
petra; it lands as its own commit once theirs does. Recorded here rather than
omitted, because a visible debt is honest and a silent one is the drift the
convention exists to prevent.

Two new gates, both of which have been watched to fail before being trusted:

- `tools/check-model-top.js` — posed top against the crown, across every frame,
  for every model. Three of five enemies fail it today.
- `tools/check-model-tags.js` — is every model actually loaded by the pages that
  draw it? A missing `<script>` tag throws nothing: `enemyModel()` returns null,
  the fallback sphere draws, and all six suites pass full green with the new
  enemy as a coloured ball. No suite can see it. The rule is derived per family
  rather than declared, because `3d.html` deliberately carries no towers. It
  currently reports 10 pre-existing `blub-detail` models missing from
  `sandbox.html`, which is a real finding and is left for their owner.

`td_scene.ball` takes `segments`/`rings`, defaulting to the previous 16/8 so no
existing model changes. New bodies pass 8/4: 48 triangles instead of 224 for a
lens under 2 screen px at the default camera, and not 6/3 because the player's
camera reaches 11.2x closer, where a 6-segment sphere reads as a hexagon.

`export_mesh.py` gains the `export_build()` contract — a module builds, hides,
animates and returns its own frame count, so the exporter needs to know nothing
about its internals. The per-module `if` switch is now **closed**: its `else`
branch guesses that `result[2]` is the shield carrier, which is a coincidence
that happens to hold for two modules, and every module added would make that
coincidence load-bearing for one more file.

**2026-08-12 — the Aether Wisp's RUNTIME: it flies, its wings beat off a clock,
its lantern lights, and it falls out of the sky when it dies. Ported by hand
from Morcoos's copy into `gl-world.js` / `gl-renderer.js`; `enemy-wreck.js`
taken whole.**

**PORTED BY HAND, NOT COPIED.** His `gl-world.js` and `gl-renderer.js` predate
`7506bf4` (the Siphon self-occlusion work) and the idle-filament deletion above,
so copying either file over ours would have silently reverted a day of shipped
work. Every hunk was applied individually and the result diffed back against his
copy: **0 of his flier/wreck lines missing, and our `animFrame`, `summonerSeats`,
`SiphonFXRitual` and `bodyTopOf`/`towerTop`/`enemyTop` all still present.**

**THE WINGBEAT IS DRIVEN BY A CLOCK, AND THAT IS A DELIBERATE EXCEPTION TO THIS
FILE'S OWN RULE.** Everything else in `gl-world.js` advances by distance covered,
because a planted foot has to stay on one patch of road. A Wisp plants nothing:
its wings must beat while it is slowed, while a Warbringer stun holds it still,
and while it hovers in the sandbox with no path under it. `HOVER_HZ = 2.6` over a
12-frame cycle carrying two beats is 5.2 wingbeats a second. His reasoning and
his comment are kept verbatim; this is the one animation a clock may drive.

**The lift is READ, never copied.** `flightLiftRadii()` reads
`Enemy.FLIGHT_LIFT_RADII` with a fallback, so the constant can move without this
file changing — which is the point, and it was exercised: the constant landed
mid-port and no edit here was needed.

**Evidence, all of it driving the real game and reading `#gl` with `readPixels`
at the default camera** (1280x720, distance 2022, pitch 0.5945). Controls first:
identical draws **0 px**, a known-good body (a `normal` enemy) **131 px** in a
10x21 box, return-to-empty **0 px**.

- **Lift.** A/B on `Enemy.FLIGHT_LIFT_RADII` alone: the body rises **16 screen
  px**, 107 px change. Wisp silhouette 54 px in a 14x11 box.
- **The wingbeat advances through the whole cycle, wrap included.** All 12
  frames visited exactly once (7,8,9,10,11,0,...,6,7), consecutive deltas
  **37-61 px, mean 49**, the wrap 11→0 among them.
- **And those deltas are the WINGS, which is a separate claim and was tested
  separately.** The raw sweep is not proof: the same clock also drives the bob
  and the lantern, and sampling the *same* wing frame one cycle apart came out
  **72 px — larger than the mean adjacent-frame delta**. With the lantern pinned
  through `setGlow` and the bob cancelled through `FLIGHT_LIFT_RADII`, that
  control falls to **exactly 0** and the adjacent deltas stand.
- **The wings beat while the flier does not move.** Held by the game's own
  `stunTimer`; `progress` was **exactly 700 at all 13 samples**. This is the case
  distance-driving would silently fail.
- **`setGlow` is put back.** A walker drawn after a lit Wisp: **0 of its 131
  pixels changed**, max channel delta 0, with the flier's own 48 px provably
  gone so the test is not vacuous.

**The wreck (`js/gl/enemy-wreck.js`) is Morcoos's file, taken whole.** It reads
three globals, all `typeof`-guarded and all present here — `paused` and
`gameSpeed` to scale onto the simulation clock, and `ul()` for its gravity, so
its `GRAVITY_UL` obeys this project's u.l. rule instead of being a pixel
constant. Everything else arrives through `bind()`.

**Sampled end to end rather than at one pose**, because a wreck frozen at its
first frame photographs as a wreck: spawn at z **33.29** — matching the live
`flightLift` of 33.41, i.e. the raised height, not the old 1.15 radii (10.75)
and not the road — then fall, **bounce at 0.40 s**, **rest at 0.717 s**, **fade
begins 2.233 s** (1.52 s of rest, against `REST_S` 1.5), gone at **3.25 s**,
leaving 0 wrecks, 0 sparks and 0 watch records. Frame-to-frame deltas stay
non-zero throughout the fall (58-77 px) and the fade (31-43 px); they reach 0
only during deep rest, where the wreck is genuinely still and not yet fading.

**`setFade` is the renderer's only blend, and it exists for this one case.**
Depth WRITES go off while a wreck fades so it cannot carve a hole in the depth
buffer; depth TESTING stays on so the world still occludes it.

**One thing deliberately NOT lifted, and it looks like an oversight.**
`enemyCrown` (the health bar) takes `flightLift`; `enemyTop` does not.
`siphon-beam-draw.js` builds its occluder capsule from a base at ground level
plus this height, so lifting `enemyTop` would not move the occluder — it would
stretch it from the road to the flier's head and mask every cord crossing the
empty air beneath a Wisp. Over-occlusion is the failure that photographs as
success. Occluding a flier properly needs a lifted BASE, which is a change to
that file's signature. Until then a cord shows through a Wisp, exactly as it did
before fliers were raised. Both functions carry comments saying so.

**A flier's drawn body cannot be clicked, and it could not before this change
either.** Driving the real `screenToWorld` → `enemyAt` chain and asking, for
every pixel the body covers, whether clicking there selects it:

| case | body px | clickable | % |
|---|---|---|---|
| flier @ 3.45 | 58 | 0 | 0.0 |
| flier @ 1.15 | 58 | 0 | 0.0 |
| `normal`, ground | 130 | 16 | 12.3 |

The pickable band is the same ~12 screen rows in all three cases, because
`containsPoint(x, y, flat)` with `flat === false` tests `e.pos` — the ground
contact — which does not move with the lift. A ground enemy gets away with it
only because its body is tall enough to overlap its own ground patch. **So the
raise did not break picking; it widened the gap between body and pick zone from
4 px to 16 px.** Recorded here because it is a live usability question no suite
covers, and because the honest answer to "did we break it" is no.

**2026-08-12 — `js/gl/models/enemy-flying.js` added: the Aether Wisp gets a
mesh. First model in the library that was NOT built by a `tools/blender/*.py`
script, and the first authored by someone outside this repo.**

**THE MODEL AND ITS ANIMATION ARE MORCOOS'S WORK, NOT OURS.** He built the
Wisp — geometry, rig and all twelve frames — in his own copy of the game and
handed the copy over by hand because he does not push yet. Everything below is
a description of what we received and what we had to adapt to receive it. None
of it is a claim of authorship, and nobody should read this entry later and
conclude the mesh was made here.

Authored outside this repo as `robotic-firefly.glb` and converted by his
`tools/glb_to_model.py`, which is not in our tree. 5815 triangles, 6 colours,
8 rigid groups, 12 frames, 443,732 bytes.

**It satisfies the `GLModels.register` contract without a single concession
asked of it, which was not assumed — it was run.** Our real `gl-parts.js` and
`gl-models.js` were loaded in a VM and `GLModels.mesh()` driven with a stub
renderer so `expand()` actually executed: `positions` 52335 = 5815x9,
`normals` 17445, `colourIndex` 5815 all in range 0..5, palette 6 entries all
4-component, no NaN anywhere in the expanded arrays. Group `first`/`count` are
vertex indices summing to 17445 = 3x5815 and tiling the range exactly, with no
gap, no overlap, and every bound a multiple of 3. `GLParts.split` returns 0 —
`FIXED` is an exact key lookup over eight tower names and carries no
`enemy-flying` — so none of it is pulled into the world pass.

**The `null` first entry in each frame is our own convention, not his.**
`drawActor` reads `pg ? multiply(instanceMat, pg) : instanceMat`, so a null
pose draws that group with the bare instance matrix. Every `rifleman-*` and
all eleven `siphon-*` models already ship `[null, ...]`. His group 0 is null in
all twelve frames and its geometry was measured moving 0.00 px across the
cycle.

**`unitsToPx` is 31.8032, identical to every model we author, and that is
deliberate on his side**: his importer hard-codes `20.0 * 1.529 * 1.04`, the
same expression as `tools/blender/export_mesh.py`, with a comment saying an
import must not arrive at its own scale. Posed through `GLMath` with
`drawActor`'s own composition, over all 12 frames, the mesh spans
**22.6 x 22.5 x 18.4 board px** at the Wisp's `sizeScale: 0.85`, and its
minimum z is **+0.0005 u** — it rests on the road exactly like every model
this project authors, and carries no hover of its own.

**The rig is a 1x body bob carrying a 2x wingbeat.** Wing-tip height per frame
is `14.73 8.36 8.36 14.73 18.42 18.42` repeated — frames 0–5 and 6–11 are
identical for all four wing groups, two beats per cycle — while `abdomen` and
`legs` oscillate once over the same twelve. The frame array cannot be halved.

Stored CRLF like every other file in the working tree. With `core.autocrlf=true`
and no `.gitattributes` the LF and CRLF forms clean to the identical blob, so
the committed object is the same either way; CRLF only stops the next checkout
rewriting the file on disk.

**2026-08-12 — the Siphon's idle "seeking" filaments are deleted. A tower with
nothing to drain now draws nothing.**

The owner, twice: "the beam is unreadable as it just passes through the siphon
body… maybe delete the beam", then unprompted, "so it cause buggs" and "it's
not clean". His screenshot showed a serrated tendril down the front of the robe
and a second one detached in mid-air beside it.

**The first thing checked was whether this still reproduced after `7506bf4`,
which had made the Siphon occlude its own cords. It did.** Over a 24-phase
sweep of a full filament revolution at the default camera (1280x720, distance
2022, pitch 0.5945), with self-occlusion ON, the idle cord painted a mean of
**79.6 px per phase over the Siphon's own body — 39.9% of its own ink, worst
144 px** — and at **7 of the 24 phases** it left a blob with no ink connecting
it to the tower (worst 90 px, up to 12.2 px clear). Both symptoms in the
screenshot, live at HEAD.

**Why `7506bf4` read as clean and was not.** It measured the cord's centre-line
polyline against the occlusion predicate and got 0 leak beyond the root. The
cord is a ribbon: a centre-line sample that is legitimately visible still paints
its full half-width, plus halo, rim and knots. The polyline cleared the body;
the ink did not. A predicate-space proof is not a pixel-space proof, and only
the second one is what the owner sees.

**Why it was deleted rather than re-anchored.** The cord's origin projects
**inside** the Siphon's own rendered silhouette — 6.6 px from the nearest pixel
outside it. A cord that begins inside the body must cross the body to leave, at
any length, so neither moving the anchor nor shortening the reach removes the
crossing; moving the anchor clear of the silhouette produces exactly the
detached tendril already complained about. The whole effect spans 26 x 17 px
against a 19 x 32 px body: it is the same size as the obstacle it would have to
route around. It was also louder than the thing it was not doing — **179.5 px of
idle ink per phase against 29.5 px for a real attack beam**, so the state that
means nothing outdrew the state that means something six to one.

**What went.** `drawSeeking`, `idleRole`, the `seeking` entries in `ROLES` and
`BEAD_SHAPE`, and the `seeking` branch in the draw loop. `stateFor` returns
`null` on no lock instead of `"seeking"`. There is no flag: the idle path is
gone, not switched off.

**The occluder build is now lazy, which only this deletion made possible.**
`buildOccluders` ran unconditionally at the top of every overlay pass because
every Siphon drew idle filaments and so every Siphon needed it. With the idle
cord gone, a board of idle Siphons needs no occluders at all, and it now builds
them at most once per frame and only when a cord is actually drawn.

**Measured, 12 towers + 120 bodies, occlusion ON, mean over 300 frames with the
render clock advancing** (a frozen clock lets memoised effects take a cheap path
and reads low):

| board | before | after |
|---|---|---|
| 12 idle Siphons | 0.733 ms/frame | **0.010 ms/frame** |
| 12 attacking Siphons | 0.472 ms/frame | **0.435 ms/frame** |

Occluder capsules built on an idle board: **132 → 0**. On an attacking board:
128, unchanged. The attacking figure was measured by swapping the old file back
in and re-running, so the saving is demonstrably not bought from the live case.

**The attack beams are unchanged, and this was proved rather than assumed.** The
comparison needs a scene that rebuilds bit-identically, and the obvious one does
not: breaking a lock and re-acquiring leaves the ritual's spin and the beam
record's accumulators where they were, and the same board measured twice that
way agreed on **0 of 12** phases. Resetting both FX modules and replaying the
whole scene from a fixed clock reproduces 12/12. Against that baseline, after
the change: **59 of 60 phase comparisons bit-identical, the exception differing
by one pixel** — while independent runs of the harness agree with each other on
only 116 of 120. The residual is the harness's own noise floor, which is larger
than the effect being looked for. Idle ink after the change is **0 px at every
phase**, and the tower still locks, still reports `thread`, still fires.

**Terrain occlusion, asked because a separate change was queued on it.** On
rune-circuit the road is flat at 7 u.l. and terrain reaches 9.4 u.l. The idle
filaments were authored to end at `groundAt + 6 ± 3` on a full 360° sweep, so
they descended to **3.02 u.l. and passed 1.43 u.l. UNDER terrain**. An attack
beam ends on an enemy standing on the road at bite height, so it never drops
below **19.0 u.l. — clearing the tallest terrain on the map by 12.0 u.l.**
Every Siphon cord that entered terrain was an idle one, and they are gone. The
occlusion mechanism still runs for every cord state, so this is not a proof that
terrain occlusion can never matter — but the defect that motivated it no longer
has a case on this tower. Measured world-space intersection, not camera-space
occlusion; a beam could in principle still pass behind a raised block while
clearing it vertically.

Still standing, deliberately: `siphon-beam-spec.js` keeps its `seeking` state
and `js/gl/models/siphon-beam-seeking.js` is still in a script tag. Both are
generated from `tools/blender/siphon_beam.py` and are not editable by hand;
removing them is a regeneration, and it belongs to whoever owns that pipeline.

**2026-08-12 — the Tyrant's fall-through comment named the wrong leap reach, in
the clause that defines the rule.**

Comment only; no behaviour changed. `attackTowers`'s explanation said the leap
"only fires at a tower within **150 u.l.**" while the spec has carried
`reachUl: 220` since its retune — one revision behind, in the exact sentence a
reader consults to understand the fall-through. The prose no longer repeats the
number at all: it points at `reachUl`, so the two cannot drift again.

Also recorded there, because it produced a false defect report before it was
caught: **the selection is round-robin, not a priority order.** It takes the
first option from `attackIndex` that has candidates, so when the index points at
the aimed shot, aimed fires and the leap is never consulted whatever sits in its
reach. "Aimed fired while the leap had targets" is ordinary — it means it was
not the leap's turn. Only "the leap's turn came up, it had candidates at that
instant, and something else fired" would be a defect, and a measurement at 91
towers found the alternation exact.

**2026-08-12 — `HOUSE-STANDARD.md` carried its `sniper-a4` worked example
twice; merged by its author.**

The two copies said the same thing and closed differently — one on
view-independence, one on cost and legibility. Mira merged them into a single
statement keeping both closings, and promoted view-independence to last and
strongest: a removal is the one choice that does not require first answering
which view the budget protects, which is the open question section 2 turns on.
That connection only became visible with the two halves side by side.

**Cause, and it is worth knowing because it is silent:** a rewrite of section 2
was applied with an edit boundary that fell short of the old copy, so the new
text was inserted and the old text survived below it. Nothing warns you. The
mechanical check that catches this in `AGENTS.md` — split the file, keep lines
starting `|`, flag exact repeats — only covers table rows; a duplicated *prose*
section has no such guard, and this one survived a full read by two people.

**2026-08-12 — `AGENTS.md` followed the difficulty deletion out of the code.**

Documentation only, after `a94ca3b` removed `DIFFICULTIES`, `setDifficulty`,
`selectedDifficultyId`, `buildDifficultyWaves` and `difficultyGroup`.
`EASY_WAVES` survives and `WAVES` is now an alias for it; the `EASY_` prefix is
historical and the file now says so rather than leaving the next reader to infer
a sibling that no longer exists.

Repaired: the version header (three difficulties → one schedule); the waves
section, where a three-row difficulty table became a one-row schedule table; the
income paragraph, reframed from "difficulty levers" to what it always actually
described, which is authoring a wave; the roster-coverage rule; the codex and
index provenance, which now derive appearances from the schedule rather than
from `DIFFICULTIES`; the mixed-wave field list; four rows of the current-values
table; and the screens row.

**The enemy roster table's "first seen" column cited waves that no longer
exist** — `N12 / H12`, `N16 / H15`, `N24 / H24`, `N32 / H32`, `N18 / H18` for
Aether Wisp, Shieldbearer, Healer, Vanguard and Camo Heavy. Every one named a
Normal or Hard wave and none named the schedule that shipped. Replaced with the
measured first appearance: 24, 27, 32, 34, 28. Found by reading the staged diff
in full rather than as a summary — the rows are unchanged context, so no diff
would ever have flagged them, and a keyword sweep for "difficulty" does not
match `N32 / H32`.

**Measured rather than carried over**, by summing `waveCount` and
`waveEffectiveHealth` over `WAVES` at 08:44Z: **35 waves, 797 bodies, 23 867
scheduled HP, 25 969 effective.** Both totals are still pinned by `tests/run.js`.
The five late-arriving types were re-derived from the surviving schedule —
Aether Wisp 24/31/35, Shieldbearer 27/29/30/34, Camo Heavy 28, Healer 32,
Vanguard 34 — and wave 28 confirmed pure camo (`camo_normal` ×12 plus
`camo_heavy` ×6), which is the condition the Warbringer collateral rule needs.

**The placeholder caveat written into this file eight hours ago is gone with its
subject.** It existed to stop people quoting Normal and Hard; there is nothing
left to quote. Its `Lands in` list in `OPEN-ITEMS.md` had named these exact
sites as outstanding against this event, which is the first time that rule paid
for itself.

**Three "difficulty" mentions were deliberately left alone.** `Maps.analyse`
still derives a per-map difficulty label from how much road a spot can cover —
a different concept, still live, and the near-match a keyword sweep would have
destroyed.

**Known still wrong, and left knowingly rather than guessed at:**
`tools/simulate-campaign.js` is cited as "the reproducible arithmetic behind"
the per-wave HP table. The table is sound — `waveEffectiveHealth` computes it —
but the attribution is void, because the tool is reported to place no towers at
all. Correcting it needs the tool run rather than read, and the sweep for other
claims sourced to that instrument is not done. Tomorrow's job, with the test
baseline block.

**2026-08-12 — the sandbox's orphaned schedule picker, left behind by the
difficulty deletion.**

`sandbox.html` still carried `<select id="waveDifficulty">`, outside the four
paths the deletion below was authorised to touch, so the sidebar rendered a
labelled empty dropdown that nothing populated. Removed, along with the two
lines of prose that described choosing between Easy, Normal and Hard. The
checkbox beside it now reads "Run the wave schedule" rather than "Run selected
wave schedule", there being only one.

Note for whoever repairs `tests/sandbox.smoke.js`: the element-list assertion
there still names `waveDifficulty`, and separately that file **aborts** rather
than failing — an unguarded `elements.waveDifficulty.fire("change")` sits
outside any `check()`, and `fire()` throws when no listener exists, so the
process dies and every assertion after it never runs.

**2026-08-12 — Normal and Hard are deleted, and with them the whole difficulty
concept. There is one campaign schedule: `EASY_WAVES`.**

Code half only; the test files that assert the old behaviour are removed
separately, and `AGENTS.md` is updated after by its owner.

**Why, on the owner's ruling: they were never finished.** Normal and Hard were
added by a collaborator in seconds and then forgotten, and every claim the code
made about them was stale — the comment block conceded in writing that they had
"NOT been retuned" for the 2026-07-30 rescale and were "a smaller step up from
Easy than they were designed to be". **Easy is the only source of truth.**

**The concept is removed, not reduced to one option.** A one-option chooser is
ceremony. Gone: both addition tables, `scaledScheduleNumber`, `difficultyGroup`,
`copyAuthoredGroup`, `buildDifficultyWaves`, `DIFFICULTY_ORDER`, `DIFFICULTIES`,
`selectedDifficultyId`, `difficultyOf`, `setDifficulty`, `difficultyRect`,
`difficultyAt`, `drawDifficultySelector`, the E/N/H keys, the chooser's click
branch, the `difficultyId` parameter on `startRun`, and the four places that
printed the tier's name — the HUD status line, the defeat subtitle, the victory
subtitle and the pause-menu summary. `js/codex.js` walked every difficulty to
build a per-tier wave list and then used only Easy's; it now walks `EASY_WAVES`
directly, and the unread `wavesByDifficulty` field it exposed is gone.

`copyAuthoredGroup` is not on the deletion list anyone wrote, but it existed
only to copy the addition groups into a derived wave and had exactly one caller,
inside `buildDifficultyWaves`.

**What deliberately survives, because it looks like the same thing and is not.**
`TIER_COLOURS`, `Maps.tierFor` and the map-card badge are the MAP's own
difficulty rating, derived from its geometry score — a separate table that
happens to be keyed `easy`/`normal`/`hard` and to print those words on the same
screen the selector was removed from. Two routes can share a band, so the badge
and the score beside it are what tell them apart. Also kept:
`scheduleEnemyCount` and `scheduleEffectiveHealth`, which lost their only
non-test caller here but are still used by the suites.

**Verified by driving the real screens, not by assertions about them.** A
dangling reference to a deleted draw helper throws at draw time on one screen
and nowhere else, and three of the four difficulty readers — the defeat, victory
and pause overlays — cannot be reached by playing a run at all, so a clean
end-to-end Easy run would have passed with a broken game-over screen. All four
readers are now drawn explicitly, in forced states: 16/16 before and after, with
every difficulty symbol reported present before and absent after.

**Six named suite assertions now fail, and that is correct, not a regression.**
In `tests/run.js`: "Easy stays original; Normal and Hard are progressively
tougher schedules" and "the run chooser selects a difficulty and restart keeps
it". In `tests/sandbox.smoke.js`: "the wave picker offers Easy, Normal and
Hard", and behind it "Sandbox can select the Hard schedule", "the selected
schedule runs from wave 1" and "turning schedules off restores the empty
manual-spawn board". **Note that `sandbox.smoke.js` ABORTS rather than failing
those last three**: an unguarded `fire("change")` on the removed picker throws
outside any assertion, so the file exits on an uncaught error and the three
tests after it never execute. They are not passing — they are unreached.

**2026-08-12 — wave 25's Fractal Slime gets its own beat: `lead` 3 → 6, so the
cascade the tier fix restored resolves on a clear road.**

Balance change, nadia's, following the mechanism fix in the entry below. One
number on one group.

Until the tier reached the spawner, wave 25's fractal group put a **4 HP T1** on
the road and its spacing did not matter. With the tier arriving it is a **64 HP
T3** that divides four times into **84 descendants**, and the authored `lead` of
3 dropped it on top of the ten Armored still walking. The root now leads by 6,
which lets the wave's other 35 bodies clear first.

**This buys ROOM, not difficulty, and that distinction was measured rather than
assumed.** A fractal cascade CONSERVES health — each tier splits into four
bodies of a quarter its health, so `4 × 4^(t-1) = 4^t` and never more than the
root's 64 points are in flight. The generations are serial, not simultaneous: a
generation exists only once the one above it dies. Measured peak concurrency on
wave 25 is 23–29 bodies and **does not rise** with the longer lead; in most runs
the wave's peak is now *lower*, because the slime arrives last on a board that
is already clear. An earlier claim that 84 bodies constituted a throughput
problem was withdrawn when concurrency was actually measured.

Nothing in the declared schedule moves: `lead` is spacing only, so scheduled
**23 867**, effective **25 969**, **$23 503** of kill bounties and wave 25's own
**984** effective HP are all unchanged — recomputed on both the unretuned and
retuned trees to prove it. The six suites are identical either side, by name,
measured with both arms extracted from commit `0f82edd` rather than read off a
shared working tree.

**2026-08-12 — `AGENTS.md` said nothing about where the repository starts, and
a tracked design document was nearly reconstructed because of it.**

Documentation only. The git root is `TD_0.5.1/`; the game is one level down in
`TD_0.5.0/`, and `visual-pass/` — the design corpus the models and effects were
built against — sits beside the game at that root. Five source files
(`js/gl/gl-world.js`, `js/gl/siphon-enemy-fx.js`, `js/gl/siphon-ground.js`,
`tools/blender/siphon_beam.py`, `tools/blender/siphon_idol.py`) cite
`visual-pass/SIPHON-SOCLE.md` **repo-root-relative**, so a `grep` or `ls` from
inside the game folder finds nothing and the document reads as deleted.

It is not deleted. `SIPHON-SOCLE.md` is tracked, 8 400 bytes, committed in
`b30cdd1` on 2026-08-10 and unchanged since. On 2026-08-12 two people searched
for it and it came within one step of being "reconstructed" from
`siphon_idol.py`'s header — which would have produced a second copy of a live
document, the exact failure that reduced `CLAUDE.md` to a pointer.

`AGENTS.md` now opens its Architecture section with the layout and the check:
**run `git ls-files` from the repository root, not from the game folder, before
concluding that any cited document is missing.** The directory is named rather
than counted, so the line does not rot when a document is added to it.

Verified while writing this and deliberately NOT documented: the stale
worktrees that used to hold complete copies of the game are gone. `git worktree
list` shows only the live tree, both `.claude/worktrees` directories are empty,
and `find -name AGENTS.md` from the root returns exactly one file. A hazard
that no longer exists does not belong in a rules document either.

**2026-08-12 — Normal and Hard are unfinished placeholder modes, and
`AGENTS.md` was presenting them as authored content.**

Ruled by the owner on 2026-08-12: **Easy is the only source of truth — 35
waves, Vanguard at wave 34.** Normal and Hard were added by a collaborator in a
few seconds and the owner had forgotten they existed. He has since authorised
deleting them; whether they actually go is a conversation between him and their
author, and is tracked in `OPEN-ITEMS.md`.

The document said the opposite in four places and the caveat is now in all
four: the difficulty table headed "authored pressure"; the paragraph calling
the transform "authored, not simulated" (deterministic is true — *authored* was
the contradiction); "All five formerly sandbox-only types appear in both Normal
and Hard"; and both mixed-wave field lists, which enumerated exactly
`difficultyGroup`'s whitelist and so read as though `tier` were not a group
field.

Measured across all three difficulties before writing, and again after
`7c9ba58` landed, because that commit touched the function the claim rests on:
wave 25 declares one Fractal Slime at tier 3 → **64 HP** on Easy, and two
untiered bodies at **5 HP** each on Normal and Hard. `tierZeroHealth 1 ×
healthMultiplier 4³ = 64`; the derived side is `4 × 1.15` and `4 × 1.35`, both
rounding to 5, which is why Normal and Hard are identical rather than laddered.

**One correction caught in the writing, recorded because it will catch the next
person.** The first draft added "these are placeholder modes, so this describes
scaffolding, not shipping content" to the five-types paragraph. That is false:
all five are already scheduled on Easy — Aether Wisp 24/31/35, Shieldbearer
27/29/30/34, Camo Heavy 28, Healer 32, Vanguard 34 — and only the *extra*
appearances belong to the derived modes. The cause is that **type ids do not
match display names**: Vanguard is `boss_fast`, Aether Wisp is `flying`,
Bulwark is `shielded`. A search for `type === "vanguard"` returns an empty list
and proves nothing, and it nearly produced a document contradicting the owner's
own ruling. That note is now in `AGENTS.md` beside the paragraph it saved.

`OPEN-ITEMS.md` keeps only the open half — whether the modes are deleted — and
gained two rules. Every entry carries a **Lands in** list naming the sites its
outcome obligates, cited by phrase rather than line number because line numbers
move. And **a ruled entry moves in the same edit that records the ruling**: the
instant a decision lands, that content stops being undecided and becomes a
second copy of a live claim until it is moved. That is not hypothetical — it
produced a live contradiction with the difficulty table within twenty minutes.

**2026-08-12 — two design documents moved out of agent memory and into the
repository.**

`HOUSE-STANDARD.md` (what "good" means for a model at the size this game draws
it) and `BRIEF-siphon-idol-gesture.md` (the A3–A5 channelling rework) now live
in `tools/blender/`, beside `WARBRINGER_CONCEPT.md`. They were in an agent's
memory directory, which is outside this repository entirely — so a standard
governing every future brief had no version control and was invisible to every
check this project runs.

The rule applied, and it is the one to reuse: **memory holds what an author
learned; the repository holds what other people build against.** The decisive
test is not durability but discoverability — can the people who need it find it
without knowing whose memory to look in? A durability failure eventually
announces itself, because the file is gone. A discoverability failure never
does; the reader simply builds against something else. `tools/blender/` was
chosen over `visual-pass/` because that is where the builder works, and because
a standing contract is a different kind of object from a per-session review
record.

Copied programmatically and diffed rather than retyped — these are dense with
measured figures and a transcription slip fabricates a measurement. Every
source line appears in the destination except the memory frontmatter, stripped
to match `WARBRINGER_CONCEPT.md`'s plain-markdown convention. Pointers left in
both directions.

**2026-08-12 — a stale test count in the Longshot section, removed rather than
corrected.**

`AGENTS.md` described `tests/long-range-dps.test.js` as "58 tests". Measured by
running it: **71**, confirmed two independent ways — the runner's own summary
line and a count of its result lines. **The number was deleted, not updated.**
The suite table under "How to run and test" already carried the figures, and a
count kept in two places diverges again; that is precisely what had happened,
and it is why `CLAUDE.md` is a pointer. The line now points at the table.

The same pass removed three more copies of that table's fail counts, twenty
lines below it — "the **three** core failures, the Longshot failure, and
**both** Sandbox failures". They survived an earlier sweep because they are
spelled as words, and a grep for digits cannot see them.

**A static count of this suite is wrong**, which is worth stating because it is
the obvious way to check the figure: `grep -c '^test('` reads 61 and
`grep -c '\btest('` reads 63, against 71 actual, because the suite generates
cases inside `forEach` loops over the spec's own path tables. Only a real run is
authoritative, and `AGENTS.md` now says so in place.

The measurement moved while it was being taken — 70 pass / 1 fail at 07:16:52Z,
71 pass / 0 fail at 07:27:31Z, with the suite file written at 07:18:12Z in
between. The suite *size* was 71 in both readings. A quantity that changes
whenever anyone touches the code belongs in one recorded place that the rest of
the file points at; a quantity that changes only when someone writes a test can
be stated. That distinction is the whole reason this entry exists.

**2026-08-12 — wave 25's Fractal Slime reached the board at T1, because
`spawnScheduledEnemy` calls `spawnEnemy` with four arguments where it takes
five, dropping the tier.**

The spawner's fifth parameter is `tier`, and the sandbox spawner already filled
it; only the wave scheduler did not. So the single authored fractal group in the
whole campaign — wave 25's `{ type: "fractal_slime", tier: 3 }` — arrived with
`tier === undefined`, and `Enemy.fractalTierOf` resolved that to the type's
`defaultTier` of **1**.

**Measured through a booted harness playing the real schedule through the real
loop, before and after.** The board was handing the player a **4 HP** body worth
**$2** that divided into **4** terminal T0s. Wave 25 is written to deliver — and
now does — **64 HP**, **$32**, and **84 descendants across three generations
(4 T2 + 16 T1 + 64 T0)**. One scheduled body, sixteen times the health and
twenty-one times the bodies.

**The declaration was never wrong; only the board was, and that asymmetry is why
this survived.** `waveEffectiveHealth` and `waveKillBounty` read `tier` straight
off the group, so every schedule figure in `AGENTS.md` and every total pinned by
the suites already described a T3. Scheduled **23 867**, effective **25 969** and
**$23 503** of kill bounties are unchanged by this fix, and were recomputed on
both the unpatched and patched trees to prove it rather than assumed. No rule in
`AGENTS.md` changes: its economy table was already stating the corrected world.

**Normal and Hard are NOT repaired by this, and still put a T1 on the road.**
`difficultyGroup` rebuilds every authored group from scratch — count, interval,
health, then type and lead — and never copies `tier`, so the derived schedules
lose it long before the scheduler is reached. They carry `health: 5` instead,
which a fractal then ignores, because a tier always outranks a health override
in `Enemy.healthOf`; they declare a 5 HP body and spawn a 4 HP one, twice. Left
standing deliberately: Normal and Hard are unfinished placeholder modes derived
from Easy, which is the only source of truth — the dropped tier is dead weight
in a placeholder, not a ladder awaiting a balance pass.

A full-schedule census on all three difficulties — every body the scheduler
creates, by type, tier and health — differs in exactly one row against the
unpatched tree (that one slime), and all 2 754 other scheduled bodies are
untouched. Every group that authors no tier now passes `undefined`, which is
inert: `Enemy.fractalTierOf` returns `null` for non-fractal types.

**2026-08-12 — the Rifleman section argued for a trade-off the game does not
offer, and two more sites were pegged to the deleted gunner.**

Documentation only. Every figure below was verified at runtime through a booted
harness by the quality lead and re-verified here before it was written; where
this pass disagrees with what was handed over, that is recorded rather than
silently resolved.

**The sign was flipped, and it was not a stale number — it was a stale
ARGUMENT.** The Rifleman's path comparison read "Path A wins on the tower … for
$150 more", and the section's whole point was that A wins on the tower while B
wins on everything else, so the choice is real. Live, from `Soldier.UPGRADES`:
full A is **$6 700** all in (300 + 200/325/700/1900/3275) against full B's
**$7 500** (300 + 200/350/750/2100/3800). **A is $800 CHEAPER, not $150 dearer.**
So path A is ahead on the tower *and* undercuts B by 12%, and what B actually
sells is the utility column at an $800 premium. The passage now says that, and
says plainly that whether it is the intended shape is a balance question nobody
settles in this document.

**The root cause was a dead ladder in the prose** — "(A1 150, A2 250, A3 400,
A4 700, A5 1200)" — while the path B table forty lines below was current and the
Current values table had A right all along. The document was contradicting
itself, and the repair went against the table, not the other way round. Two
smaller figures fell out of the same ladder: the A1+A2 crosspath is **$525**
(200 + 325), not $400; and an A5 cooldown contradiction 57 lines apart — one
site said "0.28 s against 0.7 s at A5", another "0.28 s against 0.6 s" —
resolves to **0.6**, which is `A5.cooldown` live, so the 0.6 site was right and
the 0.7 site is corrected.

**The camo comparison was pegged to a tower deleted on 2026-07-30.** It read
"$15 + 75 + 125 + 200 = **$415** … not far off the Longshot's $375", and the
$15 was the gunner's price. Live: the Rifleman's detection is **$1 600** all in
(tower 300 + B1 200 + B2 350 + B3 750) against the Arcane Sniper's **$1 200**
(tower 900 + A1 300) — a ratio of **1.3333**. The document said 11% dearer; it
is **33%** dearer. **This is the case where the rationale AND the conclusion
both go**: "not far off" is not a smaller version of the truth, it is the
opposite of it. What survives is the measured table beneath it, which shows
detection moving the wall from wave 19 to wave 28 regardless of what it costs.

**A flag that is spelled differently on each tower, now written down before it
bites someone.** The Rifleman's B3 carries `seesCamo: true`; the Arcane Sniper's
A1 carries `grants: ["camoDetection"]` and has no `seesCamo` key at all. A
reader checking with one `seesCamo` grep concludes the Sniper has no detection
and "corrects" a sentence that is right. Each tower is now cited by its own
symbol.

**Adjacency again, and this time it was predicted rather than discovered.** A
neighbouring passage — "the Soldier's B3 ($750 itself, but $1300 to reach — B1
200 + B2 350 + B3 750 — on top of a $300 tower)" — had already been repaired in
an earlier pass, so a repaired and an unrepaired statement about the SAME
subject were sitting in one document. The two now agree, and the second
`$415` site in the bullet below the table went with them.

**The economy section's opening sentence overstated its own claim.** It said
the point was "to break the feedback loop where increasing HP increased both
difficulty and income" — full stop. `js/game.js` says the narrower and correct
thing, and the wave-building paragraph further down this same document already
said it too: the loop was broken for DAMAGE, not for authored health, because
`Enemy.bountyOf` still scales a type's bounty with the health a wave overrides.
That is deliberate — a stronger scheduled variant is meant to pay more. The
opening now separates the two, because the opening is what gets read.

**One thing handed over that this pass did NOT change.** The neighbouring
historical clause "the path B rebuild landed first and left full B at 44 DPS
against full A's 21.4 — for $150 *less*" is past tense and scoped to the state
before the 2026-07-30 retune. It describes a moment, not the present, and
re-pricing it against today's ladder would turn a record into a fiction.

**2026-08-12 — three test comments named after an economy deleted on
2026-07-31.**

Commit `340ee66`, milo's, entered here by the archivist because one writer owns
this file; facts his and the quality lead's. **No assertion changed and no
expected value moved** — the six suites are identical BY NAME at 36 failures
before and after. This is documentation that happens to live inside test files.

- `tests/beam.test.js`, the test named "the beam earns the same rate as every
  other damage source" — false twice over. No other damage source earns anything
  under kill bounties, and the beam does not earn at that rate either. It is now
  named for what it checks: `baseGoldPerDamage` is the UNIT the A3 charge
  multiplier is priced in, not income. Confirmed against a booted game rather
  than by reading — the wallet delta equals the bonus in every trial and equals
  `earned` in none, an unbought A3 banks nothing at all, and changing the 1 to a
  7 scaled the payout from 10 to 70. That last check is what makes the number
  live rather than a fossil.
- `tests/beam.test.js`, the neighbouring label "1459 damage at x2 is 2918 gold".
  2918 is a real intermediate but it is not what the wallet receives; the player
  banks 1459, the part the charges added. **The assertion still pins 2918**,
  because that intermediate is what the test computes — only the label moved, to
  say which of the two numbers reaches the bank.
- `tests/harness.js`, the `pinWaveBreak` comment justifying the pin with "$1 per
  point of damage". **Dead rationale, live conclusion: the pin STAYS.** The
  comment now explains it the way the code works — the suite measures a board
  over a fixed window of simulated time, and a 90 s break puts one wave and a
  long silence inside that window.

**The reusable lesson: all three passed continuously through every change they
were describing.** `tests/beam.test.js` requires the pure modules directly and
never boots a game, so it can only ever see arithmetic and never the banking
decision. A green test carries a false claim indefinitely because nothing ever
forces anyone to read it. **The failing set is not the truth set** — a suite at
baseline says the assertions still hold and says nothing whatsoever about
whether the words around them are true.

**2026-08-12 — the Longshot's target scan: one linear pass instead of two
arrays, three closures and a sort.** `js/towers/longshot-adapter.js`.
Behaviour-preserving; no number retuned.

`LongshotTower.update` built a `live` array of `targetView` wrappers (one
object per living enemy), handed it to `RangeFilter.getValidTargets` (which
filters into a *second* array through a closure), sorted that array with a
third closure, and then read exactly one element out of it — `valid[0]`.
Nothing downstream ever looked at the rest: which enemies a piercing shot
passes through is decided from where the bodies are standing, in
`PierceBullet.update`, not from an order picked here. So the sort was
computing an argmax the long way round.

It is now one pass over `enemies` keeping the best by the same shared
`Targeting.comparator`. **Exactly equivalent to element 0 of the old stable
sort**: the incumbent is replaced only on `order(...) < 0`, i.e. a strictly
better candidate, so an exact tie keeps the one appearing earlier in
`enemies` — which is what a stable sort left at the front. The tower still
obeys whichever of the six targeting modes the player picked, through the same
comparator as before. `targetView` had no other caller and is gone with it.

Measured on the real loop through `tests/harness.js` — 18 towers, rune-circuit,
µs per `update()` step, min of 6 interleaved process pairs per arm (the two
builds alternate so machine drift hits both equally):

| bodies | before | after | change |
|-------:|-------:|------:|-------:|
|     20 |  212.0 | 209.3 |  −1.3% |
|     40 |  371.0 | 365.9 |  −1.4% |
|     85 |  749.7 | 662.7 | −11.6% |
|    120 |  922.7 | 821.7 | −11.0% |

The win arrives exactly where it was wanted — the dense wave-35 board — and is
noise at small counts, which is expected: the discarded sort was only ever as
long as the list of enemies *in range*.

**A change that was measured and REVERTED, recorded because the reasoning was
wrong in an instructive way.** The same pass replaced the two object literals
in `BeamTower.canHold` (269 calls/step on an 85-body board, so ~540 short-lived
objects per step) with reused module-scope scratch objects. It measured **64%
slower** — 589 → 969 µs/step at 85 bodies — and was taken out. V8's escape
analysis had already elided those literals, so they were never really
allocated; a module-scope scratch object defeats that inlining and adds a write
barrier on every store, paying a real cost to remove an imaginary one. **An
allocation-site count is not an allocation count.** The literals in the new
Longshot scan are left as literals for the same reason: they no longer escape
into an array, so the engine removes them for free.

Also measured and **not** found: the O(n²) that was suspected as the roster
grew. `update()` scales linearly with bodies on the board across 20→120
(200.6 → 811.6 µs/step before this change, ~5.6 µs per additional body on a
~135 µs fixed base). Enemy-vs-bullet, enemy-vs-tower and targeting scans are
all O(n·towers) with a small constant, not quadratic.

**"Behaviour-preserving" was checked by someone who did not write it**, which is
the only kind of check that claim can survive. 42 boards across 7 scenarios and
6 targeting modes, 5040 steps, old picker against new compared **by object
identity** rather than by id — **zero disagreements**, including **1305 exact
comparator ties**, which is the case the stable-sort argument above turns on. A
tie is where an argmax and a sort are free to differ, so a run that never
produced one would not have tested the claim. Separately, live `this.aim` after
a real `tower.update()` matched to within 1e-12 on 540 of 540 steps.

**The caveat belongs with the result, not underneath it.** That proves
SELECTION — the two implementations choose the same enemy. It does NOT prove the
refactor is allocation-free, and it does not cover the `PierceBullet` path
downstream, which decides what a shot passes through from where the bodies are
standing rather than from anything the scan returns. Both are open, neither is
suspected.

**2026-08-12 — seven wrong figures and one inverted argument, in the two files
the simulation is written in.** Comment-only, both commits.

`js/game.js` (305b945). The wave-35 header described a boss retuned twice since
it was written: **2500 HP** (5000 since 2026-07-30), **a 200 point shield**
(1000 since 2026-08-01), **"twice its rate of fire"** (`attackIntervalMultiplier`
is 0.75 — a third again, and this one was never true at any point), and
**twenty-one bodies** (the roar's nine `summon.groups` counts sum to forty:
8+10+6+4+2+2+3+3+2). `AGENTS.md` had already been corrected on the same roster
and the source comment mirroring it was left behind, which is the pattern the
archivist's sweep then generalised.

Also in that file, `BUILD_SLOTS` claimed a fresh profile owns **the gunner** —
deleted in v0.4.9 and explicitly dropped from any save still naming it by
`js/meta.js`; the starters are `smasher` and `soldier`. And it called the array
**"a `var` reassigned by rebuildBuildBar()"** while that function mutates in
place, which the comment fourteen lines below has always described correctly.
Two comments on one array contradicting each other, one of them right.

`js/enemy.js` (ce96270). The `health: 5000` note argued that a fixed 200 point
shield against a doubled body made the roar *"a smaller fraction of the fight
than it used to be, deliberately"*. **The 2026-08-01 retune reversed that
intent and the comment went on arguing the old way**: 200/2500 = 8% at the
start, the comment described 200/5000 = 4%, and it is 1000/5000 = **20%**
today — two and a half times the original share. A stale number misinforms; a
stale *argument* misleads someone into preserving an intent that was abandoned
on purpose, so the replacement states the reversal explicitly rather than
quietly restating the corrected number. Banner and grind-wall figures 2500 →
5000, the grind-wall conclusion surviving with only its number moved.

**Kept deliberately: "the roar still fires at half, which is now 2500."** That
2500 is half of 5000 and is live. Two different 2500s ten words apart, one dead
and one correct — which is the argument against sweeping a file for a literal.

Both commits proved comment-only by filtering the diff for lines not beginning
with `//` and getting an empty result — a stronger argument than a passing
suite, since it shows no executable line moved. Six suites identical by NAME
before and after: 36 failures, 3 / 30 / 0 / 0 / 1 / 2.

**2026-08-12 — the CI gate stopped counting failures and started naming them,
and the hard constraints got a guard of their own.**

Two tools, both written by the quality lead and entered here by the archivist —
one writer in this file, which had already collided once tonight. Facts hers,
wording mine.

**`tools/ci-check.js` now diffs failing test NAMES, not pass/fail totals.**
Comparing counts cannot see a swap: one test breaking while another is silently
fixed leaves the totals identical and the gate printed "No regressions" in
green. That was demonstrated rather than asserted — against a doctored baseline
the totals column read 105/3 versus 105/3, matching exactly, while three NEW
failing names were listed underneath it. The 36 known failing names are now
written into the tool itself with their causes, `--names` regenerates them
paste-ready, and the scrape hard-fails if the number of FAIL lines it can see
stops matching the number the suite reports about itself — so the gate cannot go
quietly blind the way a silent scrape can. Measured at `c099377`.

**`tools/check-constraints.js` is new, and guards the constraints no test can
reach.** `AGENTS.md`'s hard constraints — ES5 syntax, no `fetch`, no
`XMLHttpRequest`, no `type="module"`, and every `js` file on disk actually
loaded by a `src=` in one of the four pages — are all breakable with six green
suites, because the suites run under Node and Node accepts ES6 happily. Zero
violations across 167 files at the time of writing. It ships a `--selftest`
that builds a throwaway tree containing one deliberate violation of every rule
and asserts that each one fires AND that none of them fires on the same tokens
sitting inside comments and string literals. That self-test earned itself on
its first run: the module rule matched `import(` and `import{` and sailed
straight past `import x from "y"`. **A check that can only ever say "clean" is
not a check** — which is the same defect as the one above, in a different
costume.

**2026-08-12 — the Siphon's sceptre confirmed ON SCREEN, and one comment in
`siphon-beam-draw.js` that had outlived its fact.**

Measurement plus a comment repair. No geometry, no constant, no generator and no
model file was touched; `HEAD_MIN_PX`, `MIN_TRAVEL_PX` and `REACH_MARGIN` are
untouched by design, because the head gate is the owner's decision and this pass
exists to give him evidence rather than to pre-empt him.

**The comment.** `originPoint`'s fallback block said `originFrames` being absent
"is the live path until the generator lands it". The generator landed it and the
sentence outlived the fact. Probed at runtime rather than read off the
generator: `SiphonBeamSpec.originFrames` is present, `originFrameCount` is 25,
six LOWERCASE rows `base`/`a1`..`a5` of 25 frames each. The block now records
that the static path is the broken-tree path only, and keeps the reason
`originAnimated()` is exported — frame 0 of the table is bit-identical to the
static `RING` point `[0.315, 0.395, 1.19]`, so a silent fallback and a working
per-frame origin are indistinguishable at rest.

**The measurement, for the record, since nothing had ever been looked at.**
Driven in Chrome against the live game at the default camera (viewport
1284x722, target 640/360, distance 2022, pitch 0.5944591432292686, yaw -pi/2),
a real `BeamTower` upgraded to A4 through `performAction`, frames driven through
the game's own `SiphonFXBeam.animFrame` seam. All figures are `getImageData`
readback of the composited frame, diffed.

The projection constant everything rests on is sound. Re-measured live by
projecting a world point one Blender unit along each axis: Z 16.5913 px against
the generator's `SCREEN_PX` claim of 16.49, X 19.7399 against 19.73, Y 10.5748
against 10.91.

At true game scale the whole A4 figure occupies 447 pixels in a 22x35 box. The
sceptre — `hand_l`, 840 of 1080 triangles — is 52 pixels unoccluded and 48
visible, so only 7.7% of it is hidden by the figure's own body; the 2D cord
overlay then paints over about ten more. Its top row travels 338 -> 334, four
pixel rows; the centroid travels 4.515 px, inflated because the visible pixel
count grows 22 -> 38 as it clears the body. The shipped artifact predicts
0.23 bu x 16.5913 = 3.82 px. Across the played cycle the largest single-frame
step is 1.32 px, the wrap from frame 24 back to frame 1 is 0.6 px and seamless,
and frames 9 through 16 are dead still — a third of the cycle is a hold.

Four controls, all of which had to pass before any of the above meant anything:
a frame diffed against itself is 0 px; the static body's top row does not move
across all 25 frames; `world_fixed`'s centroid does not move; and with every
model group suppressed the screen is unchanged. That last one initially came
back at 468 px and killed a first result. Suppressing a model's groups does not
suppress the tower's beam FX, which draw whether or not its geometry does, so an
early reading of "the sceptre is 92.5% occluded" was 468 pixels of cord. With
`SiphonFXBeam.draw` stubbed the control goes to zero and the truth is the
opposite. The lesson is the general one: an isolation without a null control is
not an isolation.

**2026-08-12 — twelve corrections in `AGENTS.md`, seven of them the same dead
cash rule; this file put back into date order; and nine mirroring source
comments found and routed.**

Documentation only. No game code, test, asset or generator was touched, and
nothing below implies a balance change. Each correction names the symbol or the
runtime reading it was checked against; where the brief that ordered the pass
was itself wrong, that is recorded here rather than written into the document.

**The `Siphon beam origin` row documented the 2D fallback as though it were the
origin.** `BeamTower.prototype.spoutPoint` returns a screen-space `{x, y}` at
`this.y - 8 - this.footprintPx * 0.86`, which is what the row described and
described accurately. It is not what the player sees. The shipping origin is
`SiphonFXBeam.originPoint`, read out of `SiphonBeamSpec.originFrames` for the
frame `SiphonFXBeam.animFrame` hands over and turned into world coordinates by
`originWorld` from the tower's aim and `unitsToPx`. The row now carries both
paths and says which one ships. The spec was probed at runtime rather than read
off its generator: `originFrameCount` is 25, `originFrames` has six LOWERCASE
rows — `base`, `a1`..`a5` — of 25 frames each, and `origins` is
`HANDS [0.055, 0.305, 1.045]` / `RING [0.315, 0.395, 1.19]`.

**Only `a3`, `a4` and `a5` actually move.** `base`, `a1` and `a2` are
twenty-five identical copies of HANDS — maximum deviation 0.0000 across the
whole row — while each of `a3`, `a4` and `a5` departs from its own frame 0 by up
to 0.23. "Varies per animation frame" is true of the sceptre's ring and of
nothing else, so that is what the row says. Path B has no rows at all, by the
contract `siphon-beam-draw.js` states at `noteKeyMiss`, and pours from the
static hands.

**`spoutPoint` is neither dead nor live, and the row now says both halves.**
Three people got one half each. It was called dead code; it was corrected to a
live fallback; a runtime probe settled it at **zero calls to
`BeamTower.prototype.draw` and zero to `spoutPoint` across five real draws in
the shipping configuration**. Both descriptions were half right. It must be
kept, because it is the Siphon's ONLY 2D origin — `js/skins/draw-pack.js`
registers `longshot:` and `soldier:` bodies and nothing at all for `siphon`,
`smasher` or `blub` — and it must not be read as live, because
`World3D.drawWorld` replaces the entire layer that would call any tower's
`draw()`. The row carries both clauses; describing it as "the fallback when a
skin is missing" understates it and describing it as live overstates it.

**The gate is `World3D`, not the `:complete` line, and the reasoning that got
me there was wrong.** `BeamTower.prototype.draw` opens with
`VisualModels.draw("tower", BeamTower.ID + ":complete", ...)`, and I argued it
gates nothing because nothing registers a `siphon:complete` model. That is
false. `js/visual-models.js`'s `renderer()` returns
`group[id] || group["*"] || null`, and the file's own header describes `*` as a
category-wide fallback "so a complete skin pack can replace every enemy or map
at once" — a pack registering `tower` → `*` lights up all four `:complete`
sites, the Siphon's included. **Nothing registering it today is not the same as
it gating nothing**, and that reasoning is deliberately kept out of the
document: a reader who inherits it eventually deletes an extension point. The
outer gate really is `World3D.isEnabled() && World3D.drawWorld(...)` in
`game.js`'s render loop, which is what the row cites.

**`sizeScale`'s "(0.55 swarm … 1.8 midboss)" was the only ellipsis-as-range in
that table, and 1.8 is not the maximum.** Enumerated from `Enemy.TYPES` in a
booted harness: swarm 0.55, flying 0.85, fractal_slime 1, armored 1.05,
shielded 1.15, revenant 1.2, angry 1.25, shieldbearer 1.35, camo_heavy 1.4,
healer 1.45, brute 1.5, hive 1.6, midboss 1.8, boss_fast 1.9, colossus 2.1,
boss 2.4 — three types are larger than the midboss. **Five types declare no
`sizeScale` at all**: normal, fast, slow, camo_normal and camo_fast.
`radiusPx()` reads `(this.type.sizeScale || 1)`, so those are 1, and it
multiplies by `fractalSizeScale` on top — which it always did and the row never
mentioned. The row now gives the true endpoints, the default and the fractal
factor as named comma-separated values, the form every other multi-value row in
that table already uses.

**A dated paragraph in the PRESENT tense is a live rule, and one of them
contradicted the opening of its own file.** "All four built towers are in the
shipping game as of 2026-07-28" is present tense carrying a count of four, while
the opening of `AGENTS.md` says five towers in five slots and that the bar is
full. The fact underneath is historical and survives intact: on 2026-07-28 the
roster was four — Gunner, Smasher, Longshot, Siphon — and the last two had been
reachable only through `sandbox.html` until that day. Rewritten in the past
tense with the four named, and pointing at the opening for the current count
rather than repeating it.

**A PAST-tense paragraph can still carry a present-tense denominator, and one
did.** "2026-07-30. Four of the five towers were renamed and redrawn" is
correctly scoped by its date, but "the five towers" reads as today's five and is
not: that day's five were Smasher, Longshot, Siphon, Soldier and Gunner, and the
Summoner did not arrive for another eleven days. Now named instead of counted,
with the table beneath it labelled as the 2026-07-30 snapshot it is. **The rule
this establishes: where a dated paragraph needs a roster count, name the roster
or bound the count to the date.** A count that must be rechecked on every roster
change will eventually be wrong, and nobody rereads a paragraph headed with an
old date. A sweep of the rest of the file found no third instance — "all five
formerly sandbox-only types" names all five, and "all four arrived in the v0.3.5
fusion" counts that section's own four subjects rather than a roster.

**Cash has not been damage × 3 since 2026-07-31, and it was only ever that for
one day.** The whole-run conservation paragraph carried "cash has been damage ×
3 since 2026-07-30" while the current-values table recorded "gone since
2026-07-31. Damage pays nothing." These were never two competing claims. The
2026-07-30 economy revamp introduced `CASH_PER_DAMAGE = 3` and the 2026-07-31
bounty merge removed it, so the clause was true on the day it was written and
stale the day after; the dates in this file settle it without anyone having to
rule on intent. There is no damage-to-cash path in the code at all — the comment
above `STARTING_CASH` in `js/game.js` records the removal and ends "anything
still reading a per-damage rate is stale". No balance change is implied.

**And the clause was measured out of existence, not reasoned out of it.** Kill
cash equals `bounty()` exactly and is the same figure for a clean kill as for a
50× overkill across six enemy types; non-lethal damage pays $0; a full clear
realises **$25 950 across 841 bodies**, where damage × 3 would have paid
**$77 907**. Three times the economy. That is why this is not a cosmetic edit:
anyone tuning against the fossil clause is tuning a game that does not exist.
Those three figures are nadia's measured readings and are recorded here rather
than in the values table, because 841 does not reconcile against the 797
scheduled bodies `waveCount` sums for Easy — the difference is presumably
spawned bodies, and an unreconciled number does not belong in the table whose
whole job is to be the one that is right.

**It was never one clause. Six more sites in `AGENTS.md`, all repaired here.**
Vera found five and the sixth turned up while repairing them.

- *Exception 1 of "Conservation has three exceptions now"* said cash still
  equals the HP removed against `armored`, `brute` and `midboss` because
  "damage *landed* is what pays". The mechanism is dead. The arithmetic,
  checked rather than assumed, is **accidentally still true**: those three are
  each authored with `bounty` equal to `health`, so the ratio is exactly 1, and
  `Enemy.bountyOf` preserves it through a wave's `health` override. Nothing
  enforces it. The bullet now names the real mechanism, keeps the true
  conclusion, and states the ratio it is an exception to — 0.905 across the
  schedule, and 0.4545 (`colossus`) to 1.5 (`fast`, `camo_fast`, `camo_heavy`)
  per type, both re-derived from `Enemy.TYPES` at runtime.
- *Exception 3* said cash-equals-HP-removed "still holds for everything in
  `WAVES`". It does not. But the exception's HEADER — "Nothing the schedule
  names is unpaid" — is true and load-bearing, and `noBounty` really is a
  per-spawn property. Scalpel: the header and the `noBounty` fact stand, the
  cash-equals-HP clause is replaced by a pointer to exception 1.
- *"$4 092 off a $42 443 purse, a 10% pay cut"* was damage-era end to end:
  $4 092 is 1 364 × 3 at the retired rate, and $42 443 was the 2026-07-30 purse
  against a current authored $36 204. Under bounties those shields cost the
  player no income at all. The 1 364 HP is the one figure that survived and it
  is kept. **This was the dangerous one**: the bullet directly above it had
  already been repaired, so true and false text were sitting adjacent with
  nothing to tell them apart.
- **A SIXTH, not on vera's list, found because it is the bullet directly above
  that one.** "`Enemy.bounty()` is `maxHealth`, not `maxRemainingHealth()` …
  the death popup over a Bulwark reads its 12" — the structural claim is right
  and the number is wrong. `bounty()` is `Enemy.bountyOf(typeId, maxHealth)`,
  which returns `type.bounty × health / type.health`, so a Bulwark pays **20**;
  verified at runtime, and `js/game.js`'s death sweep passes that same figure
  to `Effects.enemyKilled`. The 12 is the LEAK cost from `baseHp -= gone.health`
  three lines below it. Two different numbers about the same enemy, conflated
  while cash was still per-point-of-damage.
- *"damage income arrives in a dribble"* — conclusion true, mechanism dead.
  Restated as kill bounties arriving one body at a time.
- *"they do not simply pay for their own answer through damage income"*, on the
  difficulty levers — the sentence is right for a reason it no longer states.
  Health overrides DO still scale income, through `Enemy.bountyOf`, and so does
  body count; interval and lead compression pay nothing. The reason is now
  written out instead of the retired one.

Each repair follows the phrasing this file already got right once, in the
data-flow paragraph reading "the main loop discards that return — only the
later death sweep pays cash, out of `bounty()`": name the mechanism, name what
does not happen, cite the function. **Three further sites are outside
`AGENTS.md` and are not touched here** — `tests/beam.test.js`'s gold-income
group and `tests/harness.js`'s `pinWaveBreak` comment belong to quality, and
`js/towers/long-range-dps.config.js` is a price and belongs to simulation.
Noted for whoever takes them: the harness comment NEXT to the fossil, reading
"the cash delta stopped being a damage meter", is CORRECT and must not be swept
up with its neighbour.

**Four rows of the current-values table were in it twice, verbatim and
adjacent.** `Warbringer full A`, `Warbringer full B`, `Tower HP from upgrades`
and `Health tier semantics` each appeared as two byte-identical rows. Both
copies were right, so nothing was chosen between: all four were re-derived from
a booted harness before either copy was touched — `Smasher.UPGRADES` sums to
4500 (A) and 6300 (B) on a $700 base, its `hp` tiers to 425 and 550 on
`BASE_HP` 150 for 575 and 700, and `Soldier.UPGRADES` to 300 and 425 on 80 for
380 and 505 — and the second copy was deleted. This is the one defect in the
pass that nobody reported: a fact written twice in one table is a fact that
will be retuned in one place and not the other, and this table is the part of
`AGENTS.md` the file's own preamble says exists to stop exactly that.

**This file was no longer newest-first.** "the beam generator reads the Siphon's
origins instead of retyping them" (2026-08-12) had come to rest between two
2026-08-11 entries — below "salvage the wave that died on the session limit" and
above "the ten blub units get a detail layer (pass 3)". It was written into what
was the top of the file ninety seconds after eight reconstructed entries went in
above that point, and it stayed where it was put while the file moved under it.
Moved unedited into the 2026-08-12 block, in the position its landing order
gives it: below the two entries that landed after it, above the documentation
pass that landed before it. The diff is a pure move plus one citation — forty-nine
lines out, forty-nine lines in, six blank lines out and six back.

**Line-number citations of `AGENTS.md` are gone from this file.** The comments
entry below cited the spout figure as `AGENTS.md:4356`; it now cites the
`Siphon beam origin` row by name. That row moved ten lines down during this
pass, and it moved again while this entry was being written — drift inside a
single session, which is the entire argument for the rule. A phrase survives an
edit above it; a line number does not.

**THE MIRROR SWEEP: nine source comments that still generate the errors this
document was repaired of. Found, not fixed — a documentation pass does not
touch game code.** Run as ONE search rather than as separate bugs: for every
number the 2026-08-12 pass corrected in `AGENTS.md`, grep `js/`, `tests/` and
`tools/` for the OLD value. It is the `spoutPoint` spout defect repeated — the
document got fixed and the comment that generated the error kept generating it.
Each is given as file plus the PHRASE that locates it, because line numbers in
these files move as fast as they do in `AGENTS.md`.

*The Tyrant, mirroring the boss roster row and the Tyrant section:*
- `js/enemy.js`, the section banner "2500 HP, the slowest thing in the game" —
  ships 5000. Number only; the rest of the banner is right.
- `js/enemy.js`, in the `health: 5000` note: "the 200 point shield it conjures
  there is unchanged -- so the phase is a smaller fraction of the fight than it
  used to be, deliberately. The wall is what got bigger." **Wrong in reason AND
  conclusion; it goes entirely.** The shield became 1000 on 2026-08-01, and the
  phase block forty lines below says so in its own dated note — "A fifth of its
  own health, conjured at the halfway line, is a wall", the exact opposite
  reading. Repaired and unrepaired text in one block again. **Do not delete the
  neighbouring clause "the roar still fires at half, which is now 2500" — that
  2500 is half of 5000 and is CORRECT.** Two different 2500s, ten words apart.
- `js/enemy.js`, "Its 2500 is meant to be a wall you grind, not a wall that
  also taxes you" — number stale, conclusion (no armor, no defense, and why)
  survives. Replace the figure, keep the sentence.
- `tests/content.test.js`, `t.eq(phase.shield, 200, "gaining a 200 point
  shield")` — asserts 200 against a shipping 1000. This is the test being
  stale rather than the boss; the owner asked for 1000 in writing. Quality's,
  not simulation's.

*The Rifleman's $15, mirroring the price defect corrected in the build-bar
section:*
- `js/soldier.js`, its own file header: "The game's primary starter unit: $15".
  `Soldier.COST` is 300. The same header adds "the gunner is untouched and
  still in the bar" — the gunner left the catalogue on 2026-07-30. The BURST
  distinction the header exists to draw is correct and must survive both fixes.
- `js/tower.js`, "losing one is a $15 lesson rather than a disaster" —
  `Tower.COST` is 100.
- `js/towers/long-range-dps.config.js`, the CAVEAT block: "the schedule is 35
  waves / 13 498 effective HP, and the economy revamp took income to $3 per
  damage, which puts a full run's purse near $42 400". **Three dead figures in
  one sentence** — 25 969 effective, no per-damage income since 2026-07-31, and
  an authored purse of $36 204. **Its conclusion survives and must be kept:**
  "These prices are payable now. A full path A ($20 250 all in) fits inside ONE
  run." Verified — the path A tiers are 300/500/850/3800/13900 on a $900 base,
  $20 250 all in, against $36 204. The margin is smaller than the sentence
  implies but the claim holds.

*Correct, and listed so nobody sweeps them up with their neighbours:*
- `js/meta.js`, "The old $15 Rifleman hid this mistake behind the $20 fallback"
  — says "old", correctly scoped, leave it.
- `js/towers/long-range-dps.config.js`, "the gunner's rate of $15 per DPS" —
  this describes the model AS BUILT and the same block already records that the
  peg moved to $100/DPS. Self-aware, not stale.
- `tests/harness.js`, the `meter:` note ending "the cash delta stopped being a
  damage meter the moment bounties replaced `CASH_PER_DAMAGE`" — current and
  correct. Its neighbour twelve lines up, justifying the wave-break pin with
  "income is $1 per damage", is the dead one — and **the pin itself stays**: a
  dead rationale whose conclusion is still true. Deleting a true conclusion
  because its reasoning rotted does more damage than the fossil did.

*Not mine to list further:* `js/game.js` is simulation's and already queued
there — the wave-35 header's four wrong Tyrant figures, the `BUILD_SLOTS` note
claiming a fresh profile owns the gunner, the build-bar order "($15, $200, $75,
$800, $15)" against a shipping $700/$900/$800/$300/$450, and the sell-refund
illustration "a $15 gunner gives back $8" whose rounding rule survives its
example.

**Two things noted and deliberately NOT fixed.** This file's header says
"Newest at the top" and there are older violations further down: a
"2026-08-10 (later)" entry sits below a "2026-08-09 (latest)" one. They predate
tonight, and reordering them is a large diff to land while two divisions are
working in the same tree — recorded here so the next reader does not mistake
them for new damage. Separately, `README.txt` is still player-facing and still
uses the pre-2026-07-30 tower names; the rename entry flagged that as out of
scope on the day and nobody has picked it up since.

**2026-08-12 — the three source comments that stated the same false facts
`AGENTS.md` had just been repaired of.**

Comments only. No behaviour changed, and the whole diff across both files is
lines beginning `//` — verified by filtering the commit's diff for a single
changed line of code and finding none. The documentation pass above fixed the
document; this fixes the place the document got it from, because a source
comment that lies is worse than no comment: it reads as measured, and it gets
copied into `AGENTS.md` as though it were.

**`js/towers/beam-adapter.js` — the Siphon spout said 0.62 and the code does
0.86.** The comment above `spoutPoint` claimed 0.62 was as tall as the water
column could go "before the tower stops reading as a round basin", and that
"taller was tried and looked wrong". The line under it has shipped
`footprintPx * 0.86` throughout — taller than the ceiling the comment declared,
so the rationale was not merely a stale number but inverted. This is the origin
of the wrong figure that reached `AGENTS.md`; that table now reads 0.86 (the
`Siphon beam origin` row) and so does the comment. **The unverifiable aesthetic claim
was dropped rather than re-attached to 0.86** — restating a rationale nobody can
check is how the first one survived. What replaces it is checkable: the number,
the 8 px lift, the 15 u.l. footprint it was judged against, and the fact that
the same 0.86 is written a second time where `draw()` builds the column, so the
two must move together or the beams leave from mid-air.

**`js/enemy.js` — "four UNSCHEDULED types" describes four scheduled types.**
The section header claimed "NONE of these four appears in WAVES". All four do,
on all three difficulties: in `EASY_WAVES`, Shieldbearer wave 27, Camo Heavy 28,
Healer 32, Vanguard 34 (`js/game.js:349`, `:365`, `:415`, `:443`); Normal and
Hard inherit those and add more. The same block also claimed the coverage test
"now demands instead that every SCHEDULED type be reachable" — it demands both
directions, and its name says so: `every enemy type is scheduled, and every
scheduled type exists` (`tests/run.js:471`), which passes. Nothing carries
`sandboxOnly` any more, so the "type with an empty wave list" the comment
described does not exist either. Rewritten to state the four wave numbers, the
real contract the test enforces, and the fact that of the three `support`
blocks two act on other bodies while the Vanguard's is `pick: "self"`
(`js/enemy.js:1456`) — the old line called all three abilities that "act on
OTHER enemies".

**`js/enemy.js` — the midboss arrives at wave 11, not wave 9.** Its only
appearance is wave 11 on every difficulty (`js/game.js:246`), one body on Easy
and two on Normal and Hard. Corrected, and the row now also records that the
schedule overrides the type's 250 HP *upwards* — 420 on Easy — so the figures in
the type block are read as its floor rather than as what walks in. The 250 is
still right where it sits (`tests/content.test.js:190` asserts it) and the "250
against a 100 HP base ends the run" reasoning still holds: `BASE_MAX_HP` is 100
and a leak subtracts the body's remaining health (`js/game.js:2552`).

**Suites unchanged, compared by failure NAME.** 105/3, 182/30, beam 45/0, blub
53/0, long-range-dps 70/1, sandbox 2 failed. The 36 failures are the same 36:
three Arcane Sniper B5 / AoE-impact tests in `run.js`, the Tyrant and
Soldier/Longshot panel groups in `content.test.js`, `ConfiguredTower gates the
ability behind the B5 flag`, and the two sandbox ability-click smokes. None of
them is near a schedule, a spout or a midboss.

**2026-08-12 — the Siphon's cords are occluded by the bodies in front of them,
the body's animation frame is derived in exactly one place, and the ritual
stops discarding the beam's origin.**

Three changes, in `js/gl/siphon-beam-draw.js`, `js/gl/gl-world.js` and
`js/gl/siphon-ritual.js`. Nothing in `update()` was touched and no property the
simulation reads was added.

**The cords used to be visible through everything.** The owner's words: "the
siphon's passive rays are seeable through everything, other towers included."
Structurally so — they are painted in `drawOverlays` on the 2D canvas stacked
over the WebGL one, and that canvas has no depth buffer, so everything on it is
drawn over the whole board by construction.

Fixed with screen-space occluders plus the depth `project` has always returned
and this file always discarded (`gl-camera.js:252` sets `out.depth = w`). One
flat-capped capsule per tower and per enemy, from its feet to the top of its
own model, and a polyline that splits into visible spans. Every layer respects
the same spans — halo, ripen bands, body, rim, core, knots and the intake bell —
because a cord whose core is clipped while its halo still glows through a tower
photographs as fixed. Three alternatives were compared and rejected, and the
reasons are written into the file so they are not relitigated: moving the cords
into the GL pass means streaming buffers and a blend mode on a STATIC_DRAW
renderer and still loses the halo and rim that keep the non-emissive states
legible; WebGL cannot read a depth buffer; and `readPixels` is measured at
3.6–7.1 ms a call in `js/gl/tower-preview.js`.

**Two things the reference implementation in `js/gl/siphon-ground.js` gets
wrong, which this deliberately does not inherit.** That module is dead code —
in no script tag, referenced by nothing — which made it a free reference, but
it is a reference for a decal lying on the ground, not for a cord.

- *It compares against the occluder's BASE depth.* Fair only when the sample is
  also at z = 0. Depth is `w`, so bigger is farther, and under this camera's
  downward pitch a higher point is NEARER: measured at the Siphon's own footing,
  z = 0 → 175.24, z = 30 → 158.30, z = 60 → 141.36. A tower's feet are the
  farthest point of its own body, so a cord crossing its chest compares against
  the feet, comes out smaller, is judged "in front" and draws straight through —
  through most of the tower. **A verification that sampled near the feet would
  have passed while the visible half of the defect stood untouched.** Here the
  compare is made at the sample's own height, which is exact rather than
  interpolated because `w` is affine in world position: `175.24 − 0.5647·z`
  reproduces all three measurements, where interpolating by screen y is out by
  5% at mid-body.
- *It guesses the crown* (`b0.y − 40`) and it gates on 70 px of world
  proximity. The crown is now measured from the model's own `top` through new
  `towerTop` / `enemyTop` helpers in `gl-world.js`, and there is no proximity
  gate: on a 180 px cord it would exempt very nearly every occluder crossed.

**The capsule has FLAT caps, and that was measured, not assumed.** Clamping the
axis parameter before measuring — the usual capsule form — puts a dome of one
full radius above the model's head. A cord passing a measured 26 px clear of a
Smasher's crown was being hidden by a dome standing in for nothing, and it looks
exactly like a success: the cord vanishes behind a tower, just not for the
reason claimed.

**The limitation, stated plainly and in the code beside the exemption it
describes: this cannot hide a cord behind the CASTER'S OWN body.** The origin
sits inside his own footprint, so every cord begins inside his own occluder and
he must be exempt or every cord loses its root — the intake bell, which is the
fattest part of the effect and carries the "it flows toward the tower" message.
A cord that swings behind his own shoulder will draw over him. Nothing cheap
fixes that; it needs per-pixel depth for one actor, which is the readback this
approach exists to avoid. Every other tower, blub and enemy occludes him
normally.

**The animation frame now has one owner: `SiphonFXBeam.animFrame`.** suki is
making the sceptre's ring — which is the beam's origin — move per frame, so
`siphon-beam-draw.js` must read the origin for the frame `gl-world.js` actually
draws the body at. Two copies of that clock drift the moment either is tuned,
and the symptom is a cord starting a few pixels off the ring, which reads as a
modelling fault and is not one. `gl-world.js` holds NO fallback copy of the
formula: without the module the body holds frame 0, because the fallback copy is
the one that would go stale.

`_chanEase` is mutated per call and there are now at least two callers per
rendered frame — the GL body pass and the overlay pass — so the step is memoised
on the tower keyed by `now`. Measured over 20 rendered frames from rest with a
lock held: ease 0.709894, which is `1 − 0.94²⁰` exactly; a double step would
give 0.915838. A paused game holds `now` and therefore holds the frame, which is
what the beam already does.

**`originPoint(tower, frame)` reads `SiphonBeamSpec.originFrames`,** indexed by
`bodyKey()` — a mirror of `gl-world.js:377 siphonGroup()`, not a re-derivation
from `tiers(tower).a >= 3`, because the origin table is per BODY and an a4 body
read against a3's row is wrong in a way nobody spots by eye. With the table
absent it is exactly the old static HANDS/RING behaviour, so the tree runs while
the generator is mid-flight. That fallback is also perfect camouflage for a key
miss, so: an a-tier or base miss warns once naming the key and the keys the
table does have, a b-tier miss is silent by contract (the b bodies come from
`siphon_abyss.py`, which never writes the origins file, and a B-path Siphon
pours from the hands), a table/model frame-count disagreement is clamped AND
reported rather than absorbed, and `originAnimated()` is exported so a test can
assert which of the two it just measured.

**Verified by driving the real game and reading pixels back**, per the rule in
`AGENTS.md`. An A5 Siphon (`column`: gold `#C9A227`, core `white_warm`
`#F0E2C0`) with one lock, a Smasher moved between "in front of the cord" and
"behind the cord", at 1280×720:

- *Occluder in front.* At the cord pixel (682, 245), 11×11: with occlusion off
  98/121 pixels match an authored cord colour, the closest being (240, 227, 193)
  at distance 1 from `white_warm`; with occlusion on, 0/121, closest 161, centre
  (80, 92, 122) — the Smasher's body. All 121 differ. The same pair with the
  blocking tower present versus absent gives the same answer, so it is not the
  flag doing it.
- *Every layer, not just the core.* Over a 704-pixel region inside the occluded
  stretch, the frame drawn with occlusion on is BIT-IDENTICAL to a frame in
  which the beam module drew nothing at all (0/704 differ, max delta 0), while
  the same region with occlusion off differs from it in all 704 pixels at a max
  channel delta of 234. No halo, rim, knot or bell leaks through.
- *The negative case, because over-occluding photographs as success.* With the
  Smasher moved behind the cord and its screen box still covering it (three cord
  samples inside the box), occlusion on and off are identical over 512 pixels
  (0 differ) and 479/512 match an authored cord colour. Nothing is hidden that
  should not be.
- *The frame index, as a sequence.* Over 150 consecutive rendered frames the
  frame `gl-world` drew the body at and the frame `siphon-beam-draw` read the
  origin at agreed on every single one (0 mismatches), both off the same `now`,
  running 1→24 and wrapping — the right order, not merely plausible stills.

**And a third change, in `js/gl/siphon-ritual.js`, without which the other two
were a no-op.** That module was discarding the origin the beam module hands it.
`plan()` installs it at :660–662 — its comment says "the beam module's own
origin is authoritative when it hands one over" — and three lines later
`advance()` called the ritual's OWN static `originWorld` at :466, overwriting
`rec.ox/oy/oz` from a third private copy of the HANDS/RING derivation
(:374–380) that has no frame parameter. So plan()'s assignment survived exactly
three lines, and the comment was false.

It cost nothing while both copies were static and computed the same point. It
stopped costing nothing the moment the ring started moving. **Measured on an A5
over one full cycle, before the fix: the origin handed to `plan()` travelled
7.315 px and the cord root actually drawn travelled 0.799 px** — and that
residual was the circle's own breathe rather than the ring, so the correlation
between the two was noise. The generator, the spec table and
`SiphonFXBeam.originPoint` were all wired correctly and all discarded at this
one call, in a way that reads as working.

Fixed by making the local derivation the fallback it should always have been:
`plan()` stamps `rec.handed = now` when it installs, and `advance()` runs its
own `originWorld` only when nobody better has supplied one. No fourth copy of
the derivation was added — the existing one is now reached only when
`SiphonFXBeam` is absent, which its own call site is already `typeof`-guarded
for. **After the fix, same measurement: root travel 6.767 px against 7.315 px
handed in, correlation 0.9971 over 150 rendered frames, and the gap between the
two varies by only 0.96 px across the whole cycle — which is the breathe, and is
what should remain.** The no-`plan()` path was checked separately: with the beam
module's draw stubbed out, the circle is still placed at (266.1, 350, 37.8) for
a tower at (250, 350) rather than collapsing to the world origin.

Re-run after the ritual change, unchanged: occluder in front 0/144 differ
against a stubbed beam module and 144/144 against occlusion-off at max delta
222; occluder behind 0/512 between occlusion on and off.

**2026-08-12 — the beam generator reads the Siphon's origins instead of
retyping them, and can carry a per-frame one.**

`tools/blender/siphon_beam.py` held `HANDS = (0.055, 0.305, 1.045)` and
`RING = (0.315, 0.395, 1.190)` as literals, a few hundred lines from the
identical pair in `siphon_idol.py`. It now reads `tools/blender/siphon_origins.json`,
which `siphon_idol.py` MEASURES off the built geometry, and hard-errors with
instructions if that file is absent rather than defaulting. Two generators
holding the same constant by hand is the drift that ends with a beam starting a
few pixels off a ring that moved — and both files build cleanly while it
happens, which is what makes it worth removing. All eight
`js/gl/models/siphon-beam-*.js` are byte-identical after the change, which is
the proof that reading reproduces the retyped values exactly.

`js/gl/siphon-beam-spec.js` gains **`originFrameCount`** and **`originFrames`**,
a per-body table of where the beam leaves from on each frame. This exists
because the sceptre is becoming one rigid body carried by the hand, so A3+'s
ring — the beam origin — stops being a fixed point. The table is keyed by
`gl-world.js` `siphonGroup()`'s **lowercase** body names, which is what
`siphon-beam-draw.js` `bodyKey()` indexes it with. The neighbouring
`originByTier` is uppercase and was deliberately left alone: it answers a
different question (hands or ring, per tier), and matching the neighbour's
convention here would make every lookup miss, fall back to the static ring, and
ship the whole change as a no-op that looks right in every screenshot.

**Three invariants this establishes.**

1. *The two fields are OMITTED, not emptied, when there is nothing to say.*
   Until the per-frame export lands in `siphon_origins.json` the spec carries
   neither key, which is exactly the renderer's documented static path
   (`if (!table) return stat`). An empty or one-entry table is not the same
   thing, and it would read as a working per-frame origin that never moves.
2. *`frames[0]` must equal `point` exactly, and the build fails if it does not.*
   Frame 0 is the rest pose and `gl-world` draws it to an idle Siphon, so a
   disagreement makes the beam jump the instant the tower takes a lock and jump
   back when it drops it.
3. *Every tier's row must be the same length.* `originFrameCount` is one number
   for the whole spec and the renderer warns when a row disagrees with it.

**There are deliberately no `b1`..`b5` rows.** The b bodies come from
`siphon_abyss.py`, which never writes the origins file, and a path-B Siphon
pours from the static HANDS. Making the table total would be worse than leaving
it partial, measurably: `siphon_abyss.py` ships 4 frames per b body against
`siphon_idol.py`'s 25, so a 25-long b row trips the renderer's
`modelFrames !== row.length` warning and a 4-long one trips
`declared !== row.length`. Either way every B-path Siphon on the board earns a
console warning to describe a point that never moves. `siphon-beam-draw.js`
already treats a b-tier miss as a contract and stays silent for it.

**2026-08-12 — a documentation repair pass over `AGENTS.md`, and eight missing
change log entries reconstructed.**

No game code was touched. Every correction below is backed by a file and line in
`js/` or `tests/`, or by a commit hash, and anything that could not be proved was
left alone and reported instead — a confident guess in the source of truth is
worse than a known gap.

**Why it was needed.** `AGENTS.md` opens by warning that a stale document is how
a session ends up acting on facts that are no longer true, and it had drifted in
exactly the ways it warns about. The eight commits of 2026-08-11 landed without a
log entry between them, so the history this file exists to carry simply stopped
on the 11th. Those eight are reconstructed below and marked as such.

**The counts, which had drifted three ways at once.** `tests/blub.test.js` was
recorded as 47 in the baseline block and 46 in the architecture file map, and is
53 — measured, and 53 at the commit that typed "47", so it was a transcription
error the day it was written rather than a coverage change. The file map also
carried counts for `long-range-dps.test.js` and `beam.test.js` that disagreed
with the baseline block. **Those three counts are now deleted rather than
corrected**, and that is the point: a file map answers "what is this file",
which a test count is not, and the baseline block is the only place that also
records WHEN it was measured. A count with no measurement date cannot be
falsified, so it rots silently. This project already paid for the two-copies
lesson once when `CLAUDE.md` was reduced to a pointer; refreshing the second copy
would have rebuilt the same trap with newer numbers.

**Two named "known failures" that pass.** The bulleted examples under the
baseline claimed `a mixed wave deploys its groups in order` and `the enemy tab
covers the roster` were failing. Both print `ok`, and `tests/` is byte-identical
between the checkout baseline and `77a7865`, so they cannot have been fixed since
— the prose was wrong when it was written. Removed. The `ReferenceError: w is not
defined` bullet above them is correct and is untouched.

**The Tyrant bullet was stale by two retunes.** It said the test wants 1.75 s off
a 3.5 s base and the game ships 8 s and 6 s. The test asserts 6 off a base of 8
(`tests/content.test.js:595`, `:601`) and the game ships 12 and 9
(`js/enemy.js:664`, `:681`) — so the bullet described a test state and a shipping
value that had both moved on, and on its own figures it convicted the test of
matching. Only the numbers changed; **the conclusion that the test is stale
rather than the boss is correct and was deliberately left standing**, because the
1000/12/9/90 set is what the owner asked for twice in writing and inviting a
future session to "fix" the game back to 200/8/6/50 would be a worse defect than
the one being repaired. The 2026-07-29 owner quote that opens the Tyrant section
is kept verbatim as the original ask and now carries a marker saying the body and
the shield were raised afterwards, because readers were lifting its 200 out as a
live value. The enemy roster table separately still described the boss as
2500 **+200** with a 50 u.l. leap; it now reads 5000, **+1000**, 90.

**The build bar section described a system that had been replaced.** It said
`BUILD_SLOTS` is the literal `[Tower, Smasher, LongshotTower, BeamTower,
Soldier]` with "all five now filled". It is derived from the saved loadout
(`js/game.js:1120`, re-read by `rebuildBuildBar()` at `:1131`), the gunner is not
in the catalogue at all, and a fresh profile arms two of five, not five. The
meta-progression section 280 lines away already said this correctly — the same
two-copies failure, inside one document, with the wrong copy sitting where a
reader reaches it first. The stale copy now points at the correct one instead of
restating it. In the same section: the bar order is catalogue order rather than a
price list that had the Rifleman at $15 against a shipping $300, the claim that
`placeSmasher` addresses slot 1 was the opposite of what `tests/harness.js`
does, and "a sixth type is no longer a drop-in" was outlived by the Summoner,
which landed as a sixth type precisely because the armoury made a sixth SLOT
unnecessary.

**Smaller factual corrections.** The document told the reader to run "all five"
suites nine lines after listing six. The data-flow paragraph said the main loop
turns a bullet's returned damage into cash — it discards it, and only the death
sweep pays — and said nothing scores by global mutation, which is true of damage
and kill credit but not of cash. Target claiming was described as one
constructor pair when `PierceBullet` has a second. The u.l. section was headed
"why the constant is 1.552" directly above a code block showing 1.04. The camo
line priced the Soldier's B3 at "$400 on top of a $15 tower" against a shipping
$750 on a $300 tower, and now says both the tier price and the $1300 needed to
reach it, labelled, because B3 cannot be bought off the shelf the way the
Longshot's A1 can. An unequip example used the gunner, which can no longer be
equipped.

**Eight scripts that `index.html` loads were missing from the architecture file
map** — `js/systems/summon-contact.js` and seven `js/gl/` modules from the
2026-08-11 rendering work. The file's own rules require the map to be updated
when a file is added, and a map that omits a third of a day's work is how the
next session concludes a module does not exist.

**Every campaign schedule figure in the file was pre-rescale**, in eight places
including the version header. Easy is 797 bodies, 23 867 scheduled HP and
**25 969 effective**, not 738 / 11 747 / 13 498; Normal is 918 / 43 844 and Hard
1039 / 56 895. This was held back at first as a possible balance defect rather
than a documentation one, because the file quotes 13 500 as the owner's stated
target — but it is settled by `tests/run.js`, which pins 23 867 and 25 969 in an
assertion that PASSES, so the schedule is intended and the document was the only
thing left behind. The file had in fact already half-corrected itself without
noticing: its clear-bounty figure of ~$2596 is a tenth of 25 969 and cannot be
derived from 13 498 at all. The run purse is $36 204, also pinned, not the
~$42 443 the values table computed from a cash-per-damage rate the same table
records as retired. The 13 500 target is now recorded as the original ask that
the rescale moved past, in the same way as the Tyrant quote.

**The roster is twenty-one types, not nineteen**, and all twenty-one are
scheduled on every difficulty — the "fourteen on Easy" split has not been true
since the five supposedly Easy-absent types were scheduled into `EASY_WAVES`
itself. Corrected in the five places it appeared.

**Deliberately not changed, and reported instead.** Four stale comments in game
code, which a documentation pass does not touch and which were routed to their
owners — two of them say the same wrong thing the document said, so correcting
only the document would have left the source contradicting itself. The "roughly
25 seconds" suite runtime, which measured 52 s on the machine doing this pass
but is a claim about the owner's, and so was left as unverified rather than
replaced with a number from the wrong computer.

**2026-08-11 — the fused creature never drew: `monsterTier` is a number, not an
object.**

Owner, game-testing: *"there is no model or animation for any tier of the monster
blub yet."* All five creature models were built AND loaded by both pages; the
resolver was wrong. `blubModel()` tested `tower.monsterTier.tier`, but
`js/blub.js` carries `monsterTier` as a NUMBER — it compares it directly
(`blub.monsterTier >= 3`) and prints it as `"T" + monsterTier`. `.tier` on a
number is `undefined`, so every creature fell through to the `unitId` branch,
found none, and drew the placeholder cylinder.

The fix has TWO traps and each breaks a different half of the roster. Truthiness
fails T0: tier 0 is real and `0 &&` is false, so a truthy test leaves the
smallest creature a cylinder. `typeof` alone fails all ten ordinary units: an
ordinary blub does not carry `undefined` here, it carries `-1`, so a bare
`typeof` check matches every blub and resolves it to `blub-monster-t-1`, which
does not exist — the fix for the creature would have turned all ten UNITS into
cylinders. The guard is now a number AND non-negative. The `typeof` version was
written first and the second trap was caught by checking a live board before
shipping, not by reasoning about it.

*(Reconstructed 2026-08-12 from commit `77a7865`, which landed without a log
entry.)*

**2026-08-11 — fix the regression the previous commit shipped.**

`tower-preview.js` called `document.getElementById('gl')` at load time to attach
`webglcontextlost` listeners. A browser returns `null` for a missing element and
the code already handled that — but `tests/sandbox.smoke.js`'s DOM stub THROWS on
an id it has no stub for, and it has none for `#gl` because the smoke test drives
the 2D board. The throw took the whole suite down: it stopped emitting a summary
line at all, which is exactly how `ci-check` flagged it as a regression rather
than as a count change.

Guarded. Nothing there is required for the module to work — losing the listeners
only costs a cache flush on context loss — so failing to attach them must never
be fatal. Worth recording that the gate did its job: this is the first regression
the CI check has caught, and it caught it on the commit that introduced it.

*(Reconstructed 2026-08-12 from commit `a83f5f6`, which landed without a log
entry.)*

**2026-08-11 — 3D model previews in the build bar and armoury; frame drivers for
the Siphon and the Summoner.**

THE PREVIEWS, which the owner asked for. `js/gl/tower-preview.js` renders a
tower's real mesh into an FBO on World3D's OWN GL context — not a private one,
because `GLModels` caches uploaded buffers on the model object and a second
context would either steal the board's buffers or duplicate every mesh — reads
back once, and keeps a 2D bitmap keyed on (model, device px). Steady state is one
`drawImage` per slot and zero GL work: measured 2 renders against 458 blits, 352
deferred, 15.3 ms of render total. Wired at both call sites with the same rule:
try the mesh, fall back to the tower's own `drawIcon` when it returns false. With
WebGL unavailable World3D is never installed and the old glyph is simply what
runs, so a slot is never blank.

FRAME DRIVERS. Two more towers had animation built and nothing driving it — the
same silent failure as the blubs, and just as invisible, since frame 0 is the
rest pose. The Siphon CHANNELS, so its clock is not a cooldown: there is no
per-shot cadence to index and the brief forbids an attack pulse, so the phase
runs off a clock and only while a lock is held, easing back to rest rather than
cutting, because a hard cut to frame 0 is exactly the "strike" read the brief
rules out for this tower. The Summoner's idle band is chosen by its LIVING UNIT
COUNT, because the brief makes the amplitude of his chant a function of how big
the swarm has grown — one rung per doubling, so the ladder still means something
when a maxed tower fields hundreds. `liveBlubs()` was guessed for that count and
checked before shipping; the real method is `blubCount()`.

*(Reconstructed 2026-08-12 from commit `3bb48f3`, which landed without a log
entry.)*

**2026-08-11 — blubs actually animate now, and the harness can finally show it.**

Two blockers, both invisible by design.

`gl-world` had NO blub frame branch. A blub has neither `gearPhase` nor
`swingProgress`, so `frame` stayed 0 and all ten attack cycles were dead weight —
nine frames on disk and a still board. Nothing would ever have caught it: **a
frozen blub looks exactly like a correct rest pose**, which is the whole reason
frame 0 IS the rest pose. It is now one grep, and the build script says so —
`grep -c BLUB_CYCLE js/gl/gl-world.js`, where 0 means every blub is frozen. The
strip is indexed by reload PHASE, not by a clock, so a cycle can neither overrun
its interval nor lag a rate change, and the swarm buff moves that rate
mid-interval. A cooldown of exactly zero reads as REST: an idle blub holds
cooldown at 0 and `1 - 0*rate` is 1, not 0, so the naive formula would park every
idle unit on the last frame of its wind-up.

The second blocker was the review rig. The harness fix an hour earlier
(`d2bb8ec`, in `visual-pass/`) was incomplete and unchecked: `showcase()`'s layout
rebuilt each item without copying `frame`, so `it.frame` was always `undefined`,
`_drawPosed` was never reached, and `filmstrip()` laid out N copies of frame 0.
The agents had been told "filmstrip is fixed, use it" — one of them found the
hole and worked around it in-page rather than trusting that. Verified after:
nine visibly different poses.

*(Reconstructed 2026-08-12 from commits `d80b6cd` and `d2bb8ec`, which landed
without a log entry.)*

**2026-08-11 — blub attack frames reviewed frame by frame; four of the ten were
wrong.**

Nobody had ever seen these move — `showcase` drew the whole buffer with one
matrix, so the review rig was blind to animation until the harness fix above.
Every unit is now measured off the built strip (max vertex travel from rest, per
frame, in screen pixels) and looked at in a filmstrip at 2–6× and again at true
game scale. Six units passed and are untouched, their model files byte-identical.
Four did not:

- **hungry** — the stomach piston DETACHED. The gut front sits at −0.18 r, the
  jaw it slides out of ends at −0.50 r, and the stroke is 0.43 r, so the two shot
  frames opened three pixels of black sky between the animal and its own stomach.
  It read as a part falling off. A `gut_neck` buried inside the jaw at rest now
  spans the stroke, and the rise comes down 0.30 → 0.18 so the shaft stays in the
  jaw's own z band.
- **mecha** — five of eight poses within 1.6 px of rest (9.4, 10.3, 4.1, 1.5, 0.6,
  0.2, 0.6, 1.6): a recoil with 200 ms of photograph in front of it and no
  anticipation at all. Release untouched, tail of NOD/RUN deepened; the coil goes
  1.6 → 7.0 px.
- **mecha2** — same disease, 4.2 px of wind-up against a 19.8 px release. Now
  11.3, and the MK2 visibly hauls itself forward to reload.
- **mini2** — the file claimed frame 1 was "three times the amplitude of the buzz
  around it"; it was 1.7×, and the intake was exactly the buzz floor. The cause
  was anatomy: a 12 px slab cannot show the rotation a spire shows, so its two
  accents move the body bodily on push instead. 4.0 → 5.7 px shot, 2.2 → 4.1
  intake, floor down to 1.5.

**Frame 0 is untouched, and that is measured rather than argued.** Silhouettes by
frame differential at the reference viewport 1278 × 719 and the default game
camera, three yaws, come back BIT-FOR-BIT IDENTICAL for all ten units, including
hungry with its new neck — same boxes, same areas, same masks. So all 45 pair
IoUs are unchanged, the `>= 0.85` circular family stays empty (worst pair
blub1/cyber at 0.833), and the three profiles, the maw on the head and the ten
footprints cannot have moved.

Doc fix in the same pass: the build script's header credited a `--check` flag
that has never existed; the checks run on every build.

*(Reconstructed 2026-08-12 from commit `af9501a`, which landed without a log
entry.)*

**2026-08-11 — sceptre out of the body, blub attack frames, and the summon
ceremony wired.**

SCEPTRE, proven rather than eyeballed. The old shaft ran from the ring THROUGH
the palm, and the cause was geometric rather than a typo: RING
(0.315, 0.395, 1.190) is 0.185 outboard of the palm and only 0.150 above it, so
any straight line through both is at x = −0.36 by z = 0.62 — through his hip. It
now drops nearly plumb from the ring's lower rim, raking out and back, off the
centreline the whole way, which is `tower_warbringer.py`'s lesson that **a weapon
at rest belongs OFF the axis**. The hand meets it at the TOP and `_weld` bridges
the gap.

That file's `penetration()` check is ported in and is NOT vacuous: re-run against
the old geometry it rejects 3/3 tiers. After, penetration is 0.000 on every tier
and frame, clearance 0.063 (2 px). A real bug in the check itself was fixed on
the way — `_patch_boxes` dropped vertices on faces with more than four sides, and
a frustum's caps are pentagons, so it under-covered the weapon and could have
missed a hit.

Animation is 4 frames on a `sceptre` empty rotating about the join, so the head is
the pivot. **The RINGS stay on the static group, so the beam origin is
structurally incapable of moving.** Frame 0 is exactly identity, so a frameless
runtime still gets the rest pose. `siphon_origins.json` is byte-identical, so the
beam lot needs no edit, and triangle counts are unchanged. Also lands the blub
attack frames and wires `js/gl/blub-summon.js`, which had never executed once:
~1,300 drawn frames across five scenarios, zero exceptions.

*(Reconstructed 2026-08-12 from commit `82464bf`, which landed without a log
entry.)*

**2026-08-11 — the Siphon's beam was never drawn in 3D. Wire it.**

ROOT CAUSE, and it is structural rather than a bug in the beam code. `BeamTower`
draws its fountain AND its beams inside its own 2D `draw()`. `js/game.js:2953`
wraps the entire 2D world layer in `if (!world3D)` — including the actor loop at
`:3011` that calls `tower.draw(ctx)`. With the 3D board installed, which is every
ordinary load of `index.html`, that method never runs. So the tower whose beam
the brief calls "more than half its visual value" had no beam at all, and had not
had one since the 3D board shipped.

`js/gl/siphon-beam-draw.js` already existed — written by an agent that reached the
same diagnosis independently before it died on the session limit — and it
documents its own call sites. Wired exactly as specified: loaded in `index.html`
and `sandbox.html` after `siphon-beam-spec.js`, whose table it reads at call time
(the two pages must stay identical); called in `drawOverlays` at the END of the
tower-hardware pass, immediately before `drawShots`, because **the beam is
hardware, not a shot** — it is continuous while a lock is held, so it belongs
under the shots and under the cosmetic burst; and at TOP LEVEL, outside the
per-tower `withGround`. That last one matters: **a beam spans TWO ground
heights**, the deck the tower stands on and the road its target walks, so it pins
its own reference and feeds `project()` absolute heights, the same rule a shot in
flight follows. Called inside a tower's `withGround` it would flatten every beam
onto that tower's deck and the far end would float.

*(Reconstructed 2026-08-12 from commit `5e8a74f`, which landed without a log
entry.)*

**2026-08-11 — salvage the wave that died on the session limit. UNVERIFIED.**

All four agents failed mid-task on the session limit, but had already written
substantial work that validates, so it was kept rather than thrown away:
`js/gl/siphon-beam-draw.js` (1058 lines, parses), `js/gl/blub-summon.js` (1275
lines, parses), and `tools/blender/tower_summoner.py`, which still builds and now
puts the ten units at 5012 triangles against 4672, so attack geometry was added.

**What this is not: verified.** Nothing in it had been seen running. The two
modules were inert because no script tag loaded them, and that is the only reason
it was safe to commit half-finished work — the game was unaffected either way.
Both were wired and checked in the commits above. The diagnostics survive and
were worth reading before the work was retried: the beam agent captured the
BEFORE state (`captures/siphon-beam-BEFORE-locked.png`, `-close.png`) and the
sceptre agent captured the path A head.

Gates at the time: all 12 primitives wound outward, suites at baseline
(105/3, 182/30, 70/1, 45/0, 53/0, 2).

*(Reconstructed 2026-08-12 from commit `936f358`, which landed without a log
entry.)*

**2026-08-11 — the ten blub units get a detail layer (pass 3).**

New `tools/blender/blub_detail.py` builds ten add-on meshes, `blub-detail-<unit>`,
composited over untouched bodies the way `summoner_unit_marks.py` composites the
crosspath marks. Ten script tags added to `index.html`. Nothing else was edited:
no body, no simulation value, no footprint. 1144 triangles for the ten, worst 144
against a budget of 150.

The owner's report was that the bodies "have very little identity and coolness" —
pass 1 silhouette plus a flat palette, with pass 3 never run. One beat per unit:
blub1 a brow and cheek folds and a wobble; blub2 the crust lashed on with straps
and a buckle; blub3 a cut jaw and collar tabs under the pauldrons; the two Minis
ragged, mini1 upward and mini2 sideways; the Hungry Blub gums, a drool ledge and
a gorge that runs backwards; the Cyberblub gaskets where the grafts enter the gel,
inset panels and a suture; the Mechablub rivets, vents and a cockpit frame; the
MK2 tank straps, chevrons and pipes under tension; and the SuperBlub's porthole
rebuilt so the tiny frightened blub inside it is legible — its face was authored
with eyes 0.07 screen pixels across, so the gag the whole B path rests on did not
exist on screen.

**Two invariants this establishes, both now in the file header.**

1. *A detail layer READS its bodies, it does not copy them.* The script imports
   `tower_summoner`, rebuilds each body into a throwaway scene and ray-probes the
   triangles: `radial()`, `front()`, `top()` are casts against the real mesh, and
   seats are taken from the body's own named solids. The bodies were re-profiled
   twice while this was being written and the details followed. `main()` prints
   every anchor that had to fall back, so a rename shows up on the next build.
2. *A detail on a small unit must move the OUTLINE or swap a block of VALUE.*
   Revue 1 measured the b1 marks at 3–7 px and called them invisible. Every unit
   here changes at least 11 px and 6 % of its own pixels at its worst of four
   yaws, measured at the review's reference viewport (1278 × 719), and mean
   luminance over the body's footprint goes DOWN on all ten — the value ladder,
   measured rather than asserted.

**2026-08-11 — the ten blub units are rebuilt on three proportions, not one.**

`tools/blender/tower_summoner.py` only. No simulation value moved: the ground
radii still print 10/13/20/10/10/25/25/30/40/50 from `js/blub.js`
`UNITS[].footprintUl`, which was not edited.

`visual-pass/SUMMONER-REVUE1.md` failed the units and said why: **five of the
ten** (mini2, blub1, blub2, hungry, cyber) shared one circular outline at
>= 0.85 shape IoU, so correcting the three worst pairs one at a time would only
have moved the confusion. At true scale mini1 is 10 x 13 px, so an appendage is
one pixel; the separation had to be the animal. Every A-path body used to come
out of one `drop()`. Now there are three profiles as data (`EGG`, `SPIRE`,
`SQUAT`) plus `_stack`, and the family splits into TALL (blub1, mini1, cyber)
against LOW (blub2, mini2, hungry). `drop()` survives for blub3 alone, which
passed revue 1 on that shape. Measured at the review's reference scale
(viewport 1278 x 719 equivalent; superb 68 x 66, mecha2 69 x 38):

| pair | raw IoU 0/45/90 | shape IoU | blub1 inside blub2 |
|---|---|---|---|
| mini1 / mini2 | 0.951/0.921/0.986 → **0.603/0.615/0.592** | — → 0.780 max | — |
| blub1 / blub2 | 0.639/0.668/0.606 → **0.321/0.412/0.685** | 0.895 → **0.764** max | 0.922 → **0.504** (0.737 worst yaw) |
| hungry / cyber | 0.862/0.785/0.785 → **0.751/0.648/0.634** | 0.877 → **0.740** max | — |

No pair among the ten now reaches 0.85 shape IoU at all; the seven-entry
`>= 0.85` list in the review is empty.

**The mouths, reported twice by the owner** ("the mini blub and hungry blub are
unreadable because they're open from behind"). The dark throat cavities added
last time closed the see-through hole and left the cause alone: the jaws were
wide plates flared apart with an ellipsoid WIDER than them wedged between, so
the outline was an open clamshell with no head above the gape. New rule, in
`maw()`: **the mouth never touches the outline.** It is a band of dark tiles
laid on the head's own curve at `radius_at()`, with the teeth on the same
surface — it cannot widen the silhouette, cannot be seen through, and the head
closes over it. `teeth_ring()` is gone; the review had already measured its
crown as "une frange de 1 px". The Hungry Blub's head is now two wedges of
falling width (jaw under skull, prognathous) under a domed cranium, with the
gape a dark line strictly smaller than both in x and y. Checked at four yaws in
silhouette: no daylight through either unit from any angle.

Colour build committed (not the silhouette build — that mistake shipped 46 grey
models once). Verified on a fresh page load: 10/10 registered, 3 to 10 palette
entries each, mean chroma 31.4 over 8885 model pixels, 2.8% achromatic and that
is the stone and the chrome. `node tools/check-winding.js`: all 12 primitives
outward — no new primitive was added, only `td_mesh`'s existing ones.

Screen area now rises with the footprint across the whole family: 108, 134, 232
(fp 10), 249 (13), 612 (20), 824 and 832 (25), 858 (30), 2046 (40), 3095 (50).

**2026-08-10 — the Summoner's three effect modules are wired in.**

`js/gl/blub-circles.js`, `js/gl/blub-projectiles.js` and `js/gl/blub-systems.js`
had been written but were loaded by nothing and had never executed. They are now
in both script lists (after `js/gl/gl-world.js`, and the two lists stay
identical) and called from `js/gl/gl-world.js` at the sites each file documents:

* `install()` binds both helper-taking modules and builds `BLUB_FX_API` once;
  `ensureMap()` resets all three on a map change, so a new board keeps none of
  the old one's splatters, circles or brass.
* `drawWorld()` runs `BlubFXSystems.update` before anything is drawn, adds
  `BlubFXCircles.descentLift` and `BlubFXShots.recoil` to a summoned body's own
  transform, and draws `dyingBodies()` as real geometry between the tower loop
  and the enemy loop.
* `drawOverlays()` lays the ground group down in one bottom-to-top order —
  death stains, shot decals, summoning circles, swarm threads — then the weaken
  sigils immediately before the health bars, then the air group (`drawAir`,
  `drawDeaths`) between `drawShots` and `drawEffects`. All at top level, never
  inside a `withGround`: each module pins its own ground per mark.

Nothing in the three files was modified; `js/blub.js` was not touched. Measured
at 1280x720 on a 7-maxed-Summoner board (95 blubs, 100 enemies, 72 live circles,
~95 threads): `draw()` 1.40 ms without the modules, 2.30 ms with them — **+0.90
ms**, against the 6.0 ms ceiling in `visual-pass/PERF.md`.

**2026-08-10 — the rail box becomes the switch, and five corrections around it.**

All six from the owner, in one pass, and four of them are him catching something
the previous session got wrong.

**THE GREY BOX IS THE SWITCH NOW.** Clicking one used to open a second panel
view with a Producing/Stop button inside it. His verdict: it *"creates an unknown
behavior"* — you click a thing that looks like a switch and get a different
screen with another switch on it. He is exactly right, and the fix is his:
*"from a3 onward make the greybox highlighted while they produce and if they are
left clicked they dim and stop production."* Lit or dim, one click, one meaning,
and no word has to be read to tell the two states apart.

The base stats moved to the **hover card**, which is where they should have gone
first: hovering is the gesture that cannot change anything, which makes it the
right one for reading, and every other explain-before-you-touch-it in this game
already lives there. A box below A3 still draws and still counts down — what a
tower is making and when is worth knowing from the first one — it just refuses
the click, and its card says why. The whole panel-view apparatus
(`selectedLine`, `viewedLine`, `clearPanelView`, the Back button, the swapped
`statLines`) is gone rather than left lying about.

**NO ROOM NOW MEANS WAIT, NOT SKIP.** *"lorsqu'il ne peut plus en placer a cause
d'un manque de place la bar reste chargee au maximum et un blub est place a
l'instant ou une place se libere."* The brief originally said a failed cycle
simply came round again, and in play that was worse than it sounds: on a full
board every line spent its whole interval counting down to another failure, so a
space that opened sat empty for up to a cycle. The timer holds at zero, the bar
stays full, the box says *no room*, and the body lands on the first step there is
somewhere to put it.

**A TIER THAT SHORTENS A CYCLE NOW BRINGS THE NEXT BODY CLOSER**, and the way
that went wrong is the entry worth keeping. A running clock has to be clamped to
a newly shortened interval or the bar — `1 - left / total` — sits pinned at empty
for the overhang. The clamp went into `syncLines`, which `recalcStats` calls…
which `previewUpgrade` calls twice per hover. So merely laying out the panel
previewed A1's 18 s cycle, clamped the live 20 s clock to 18, and left it there:
**hovering the tower made it summon faster.** It lives in `applyUpgrade` now,
beside the HP grant, which documents the identical trap for the identical
reason. A test pins it.

**T0–T2 MONSTERS NO LONGER REPLACE THE TOWER.** *"for t 0 1 and 2 the monster
should not replace the tower and now it does, only t 3 and 4 should, and should
be placed as near as possible to the track."* Below tier 3 the tower carries on
summoning beside its monster, so parking the monster on top of it hid the thing
still doing the work — and stood a body that has to shoot wherever the tower
happened to be built. It goes to the free spot nearest the road now
(`findRoadSpot`, the same sweep a blocked summon falls back to). From tier 3 it
*is* the tower and stands where the tower stands, which was always the intent.

**A BLUB SOLD THROUGH ITS PANEL LEAVES THE FLEET.** He noticed it was "counted as
still alive", and it was: `sellTower` took it out of `towers` — so it could not
shoot or be clicked — while it went on counting in its summoner's blub count,
its pooled HP, the swarm buff every other blub was drawing on, and the next
Coagulation's tier. A ghost in exactly the numbers the tower is played on.
`sellTower` calls `onRemoved`, `isDestroyed` reports it, and every reader that
already went through `livingBlubs()` is correct at once.

**THE SANDBOX GETS 20x AND A 100 000 HP BASE.** The speed is one more entry in
the array the workbench already extends. The base is the more interesting one: a
workbench needs leaks to be a *reading* rather than an ending, and at 100 HP a
single Brute finishes the session — which turns every measurement into a race
and makes the loss overlay the thing you spend your time dismissing. It moves
`BASE_MAX_HP` rather than `baseHp`, so `restartGame()` carries it; the loss path
is still reachable, so it stays testable. One existing smoke test asserted "base
HP can be set above its starting maximum" using a literal 10 000, which stopped
being above the maximum the moment it became 100 000 — it derives the figure
from the constant now.

**2026-08-09 (latest+4) — the blub rail, and 5x/10x on the workbench.**

Two owner requests on top of the Summoner, both about being able to SEE what it
is doing.

**THE SUMMON LINES LEFT THE PANEL AND BECAME A RAIL.** They shipped as three
compact rows inside the inspection panel a few hours earlier; the owner asked
for *"separated grey color boxes on the left of the panel, one per blub type
that can be clicked to show the blub base stat"*, and he is right about all
three parts of that.

They are not actions on the tower, they are its *contents* — three things it is
making, each on its own clock. As panel rows they competed for height with the
upgrade buttons, needed a layout exemption to fit at all, and read as three more
things to buy. **The grey is the load-bearing part**: every other rectangle on
that panel is an offer (green buys a tier, violet fires an ability, gold is a
live reading), so grey says "status, not shop" before a word of it is read.

Each box carries the same clock twice — **a bar that fills to the moment the
next body appears**, which was the request before this one, and the seconds
beside it. A bar is for glancing at while you watch the road; a number is for
when "nearly full" has to mean one second rather than twenty. It also shows how
many of that type are standing, which is the other half of the same question. A
stopped line **holds its bar where it stands** rather than emptying it, because
that is what stopping actually does to the clock.

Clicking a box swaps the panel to that blub TYPE, including a **lifetime damage**
row — what one will do if it spends every charge. That is the number that
actually compares two summon lines, and neither the damage nor the rate says it:
a Mini Blub II is 36 and a Cyberblub is 480.

`action.compact` survives from the row version, now carrying the blub view's two
one-word buttons, and `action.progress` joins it — 0..1, swept across a button
as its own clock runs. Both are generic, both are set by one tower.

**A FUSED TOWER HAS AN EMPTY RAIL.** From tier 3 the monster blub is the tower
and nothing is being produced; three frozen bars would say the opposite of what
is happening. A test pins that it comes back when the monster dies, because "the
panel is stuck on a line that no longer exists" is exactly the bug this shape
invites.

**5x AND 10x, IN THE SANDBOX ONLY.** `js/sandbox/sandbox.js` APPENDS to
`GAME_SPEEDS` rather than replacing the button, which matters more than it
looks: the entire design of `gameSpeed` is that speed is applied in exactly one
place — how many fixed steps `frame()` runs, never a scaled dt — and a
sandbox-only second implementation would be a second place to get that wrong.
A test asserts that one frame at 10x is ten ordinary 1/60 s steps and not one
big one.

The shipping ladder is deliberately untouched. A workbench exists to reach a
board state quickly and 10x turns a two-minute wait into twelve seconds; in a
real run the same button is a difficulty setting, because nobody can react at
10x. The speed button's chevrons now cap at three — ten arrowheads do not fit in
a 78 px button, the cap is invisible in the game, and the number was always the
precise statement.

**2026-08-09 (latest+3) — the Summoner, the fifth tower: it never fires, and
its units' hit points are their ammunition.**

Built against a fully-specified brief from the owner — concept, both upgrade
tables, ten units' stats, two crowd mechanics, Coagulation's five tiers, and
twenty-eight numbered acceptance tests. `js/blub.js`, $450, id `blub`, and it
takes the fifth build slot that has been empty since the gunner was deleted.
The full rules are in `AGENTS.md` under "The Summoner"; this records the
decisions, which is what the code cannot show.

**A BLUB IS IN THE `towers` ARRAY, and every other decision falls out of that.**
The brief asks for units that occupy space under the tower packing rule, cannot
be built on top of, open a stats panel when clicked, carry HP, die, and eat area
stuns. `towers` already provides all six — `whyCannotBuild` compares footprint
radii, `towerAt`/`inspected` opens the panel, `sellValue` reads `totalSpent` and
so pays exactly $0, `TowerHealth.tickStun` handles stuns, the destroyed sweep
does the death animation and frees the ground, and `restartGame()` clears the
lot. Building them as recruits instead (`js/soldier.js`, units that are
deliberately NOT towers) would have meant reimplementing all six.

What being in `towers` must not give them is enemy attention, so `isSummon` is
the flag `Enemy.attackCandidates` skips. That placement matters more than it
looks: excluding them from the candidate list rather than at each attack is
what keeps `targets` honest, so an aimed shot taking "the two highest-DPS
towers" can never spend a pick on a blub it cannot hurt.

**ATTACKS ARE INSTANT, not projectiles**, which is a departure from every other
shooting tower here and is entirely about ammunition. A charge must not be spent
on a corpse, and a bullet only claims damage while it is in the air — with
instant resolution the enemy is already dead when the next blub in the same step
looks at it, which is strictly better than a claim and costs nothing. Half the
roster does not fire a bullet anyway: one splashes, one fires a piercing lance
every tenth attack, one detonates when it dies, and a merged monster can hit the
whole map.

**TWO NUMBERS IN THE BRIEF DISAGREE WITH THEIR OWN PROSE, and both were
resolved towards the acceptance test rather than quietly reconciled.** The
Hungry Blub's text says its damage grows by "4% de sa valeur de base,
cumulatif", which reads additive and totals 1176 — but its numbered test says
1473 across 35 charges, and `20 × (1.04³⁵ − 1) / 0.04 = 1472.95`. It compounds.
The SuperBlub's "51 PV n'autorisent que 51 attaques" sits beside a free lance
and an exact count of five: the lance costs no charge, so 51 charges buy 51
paid attacks and five lances fall among the 56 it makes. Both are flagged in
`AGENTS.md` and in the code, because a silent reconciliation is a decision the
owner never got to make.

**Randomness is a seeded xorshift, not `Math.random`.** The brief asks for "un
point aléatoire"; this project does not put a clock or an unseeded generator in
the simulation, for the same reason lane offsets and the boss's attack cycle are
deterministic — a run that cannot be replayed cannot be tested. Seeded off the
tower's own position, so two Summoners lay out differently.

**Three shared changes, each because the rule belonged there and not here:**

- **`whyCannotBuild` now skips a tower at zero HP.** The brief asks for the
  death animation to play while the ground is freed instantly, and for that to
  be "la même pour toutes les tours du jeu". The destroyed sweep runs once a
  step, so without this a spent blub held its footprint until the next frame.
- **`TowerHealth.stun` respects a `stunImmune` flag.** A tier 4 monster blub is
  immune, and the boss's aimed shot, its landing shockwave and the monster's own
  leap all reach for that one function — an immunity at the call sites would
  have been three chances to forget it.
- **`inspectionLayout` learned `action.compact`.** A finished path A carries six
  action rows and at 60 px each the panel grows through the build bar, which
  `sandbox.smoke.js` pins against. A toggle's whole text is a unit name and the
  word ON. Rows are now planned before the height is known and placed by walking
  that plan, so the measurement and the drawing cannot disagree; nothing else in
  the game sets the flag and every existing panel lays out unchanged.

**`js/systems/damage-amp.js` is new, and is deliberately not
`js/systems/buff-stacks.js`.** That tracker is a count of stacks sharing one
refreshed window (the Sniper's kill stacks) — a new stack pushes the whole
thing out. The weakening debuff must decay a thousand hits as a thousand
separate five-second timers, which is the opposite behaviour, and teaching one
module both would have put two behaviours behind one name. It is applied AFTER
mitigation in `Enemy.takeDamage`: it is *damage taken*, so a brute hit for 6
through 5 flat armor takes 1, and at +100% takes 2 rather than 7.

**The index screen walks past B3's cross-branch gate.** B3 requires A2 — the
Cyberblub is an evolution of the Blub III — and the codex's branch walk stops at
any refused tier, so path B would have shown three tiers and hidden B4 and B5.
`satisfyCrossBranchGate` buys the named chain first, structurally off the
upgrade table rather than by parsing "needs A2" out of a sentence, and the tiers
it then shows are measured on the tower a real path-B player actually holds.

**A 90-COIN PURCHASE, NOT A STARTER**, and that was a decision. Putting a tower
that produces free damage forever into the opening kit would move the premise
the whole meta loop rests on — *a fresh profile cannot win* — which
`tools/measure-starter-kit.js` exists to keep checking. One field and a re-run
of that tool if the owner wants it in the starting hand.

**Two renderers, one readout.** The blub count and pooled charges are drawn
over the tower all run, and the 2D pass that draws them lives in
`BlubTower.draw` — which the WebGL branch replaces wholesale, so in 3D they
simply were not there. Same gap the recruit hover readout hit, same fix: the
STRING comes from `BlubTower.counterLabel()` and only the placement is done in
`gl-world.js`'s overlay pass. Verified by reading the GL framebuffer and the
overlay canvas back — 11 blubs paint 10 151 pixels of board that vanish when
they are removed and return byte-identical when they are put back, and the
badge itself is 1 616 pixels of the overlay layer.

`tests/blub.test.js` is the acceptance list, one test per numbered item, 34
passing. Three fixtures moved with the roster: `tests/run.js`'s build-bar line
now expects five towers, its shared-run line counts non-summons (a Summoner
plants its first blub at the 20 s mark, and a raw length would grow for a reason
that has nothing to do with what that line asserts), and `sandbox.smoke.js`
expects the fifth slot filled. The sandbox's `ROSTER` is its own list, not the
meta catalogue — a workbench has no coins — so it had to be told separately.

**The content suite's line in `AGENTS.md` was stale, and this found it.** It
read 182/30; the checkout measures 181/31 with or without any of this, because
two of its tests still assert the 40 s recruit cooldown that moved to 45 s on
2026-08-01. Diffing failure NAMES rather than totals is what showed it.

**2026-08-09 (latest+2) — the Siphon gets a body, and the overlay layer learns
the board has height.**

**THE SIPHON IS NO LONGER A PLACEHOLDER CYLINDER.**
`tools/blender/tower_siphon.py` builds five bodies — base/a3/a5/b3/b5 — against
`td_mesh`, so it needs **Python and not Blender**. 2160–2632 tris each.

**Why this is the tower that carries the wizard read.** The owner asked for the
old magician style to survive somewhere in a project that is otherwise arcane
tech. It cannot be the Warbringer — the model contract caps him by name, *"this
must never become a wizard"*, because he is a smith. The Sniper is a martyr and
the Rifleman a gangster. The Siphon is the only tower with no ballistics at all:
it holds a beam on a body, drains it, banks the drain as gold, heals off it and
at B5 refuses a death. So: a hooded robe, no face but two ley points, a focus
ring held at arm's length, and a brass reservoir he cradles whose fill rises
with the tier. He carries no weapon anywhere. The dais is a `world_fixed` child.

Seven tiers share five bodies — 4 wears 3's, because a tier that buys a rate or
a ratio does not change what a man is carrying.

**EVERY z IN THE OVERLAY LAYER IS A HEIGHT ABOVE THE BOARD, NOT ABOVE ZERO.**
Owner-reported against the previous entry: *"les effets, bullets laser charges
ne montent pas avec le modele de la tour"*. Standing the models on the surface
left the projected layer behind, so a tower on a 9.4 deck rose while its range
ring, charge circle and muzzle anchors stayed on the floor. `project()` adds the
ground height, and `ringPath` projects per point rather than through
`camera.groundCircle`, which solves only against the flat plane.

**AND THEN THE OPPOSITE MISTAKE, reported immediately after:** *"the effects and
the bullets follow the curve, it's funny but very unrealistic"*. Sampling the
ground under every point is right for a decal and wrong for anything rigid or
airborne — a rail cannon's coils and muzzle are spread along a barrel that
overhangs a deck edge, so the weapon's own hardware bent into a curve, and a
shot in flight flew a ski jump over the terrain.

**The rule that came out of it, and it is the one to keep:** a caller that owns
one object pins the reference height for everything it draws (`withGround`).
Tower hardware measures from the height the TOWER stands at, so a weapon stays
rigid however far it overhangs. A shot fixes one reference per round, eased
between the ground it left and the ground its target is on, so it flies a
straight line aimed at the target. Recruits keep their own. Ground decals still
sample per point — that is what makes a range ring drape over an edge.

No regression: stress board 4.44 ms against a 6.00 ms ceiling. All five suites
unchanged.

**2026-08-09 (latest+1) — everything on the board was standing inside it.**

Reported by the owner from two screenshots: a Rifleman built on a raised deck
was buried to the knee in it, and a column of carriers was walking sunk into the
road up to the axles.

**THE BOARD HAS HAD REAL HEIGHT SINCE THE ZONES AND ROAD WERE EXTRUDED, AND
NOTHING EVER TOLD THE ACTORS.** Every actor was drawn at `z = 0` while a deck
top sits at 9.4 and the road ribbon at 7. The models were never wrong; they had
no idea how high the floor under them was, because nothing could tell them.

`gl-world.js` now stamps a coarse HEIGHT FIELD when it builds the map mesh, from
the same numbers the geometry is built from, so the surface a body is drawn
standing on and the surface actually built under it cannot drift apart.
`ROAD_LIFT` became a named constant for exactly that reason — it was a bare `7`
at its one call site. Highest surface wins, so where a route crosses a raised
deck the actor rides the deck, which is the surface that is visible there.

A lookup is two integer divides and an array read: **0.093 µs**, or 0.006 ms per
frame with sixty actors, 0.03% of the frame budget. That is what makes it
affordable per actor per frame instead of caching per entity and going stale the
next time the map changes.

One subtlety worth keeping: a cell counts as covered when its **centre** falls
inside the stamped rect. Rounding outward instead grew every slab by up to a
cell on each side, which put deck-height ground nearly twenty pixels out into
open floor — and the level test below then answered for a deck that was not
there.

**A TOWER MAY NO LONGER BE BUILT ACROSS TWO LEVELS.** New rule, at the owner's
request, and the one placement rule that is not pure geometry from the map data
— it asks the renderer, because the renderer owns board height. See "Placement
rules are derived, not hand-picked" in `AGENTS.md`. Guarded on
`World3D.isEnabled()`, so the flat 2D fallback and the Node suites are
unaffected; all five suites report their unchanged figures.

**2026-08-09 (latest) — the board had no props, its decks were the wrong
colour, and the road had no sides.**

Three findings from a visual quality pass over the whole project. All three are
presentation only; no simulation value, collision volume, path or stat moved,
and all five suites report the same figures as before (105/3, 182/30, 70/1,
45/0, 2 sandbox failures).

**THE SIX MAPS EACH AUTHOR NINE SCENERY PROPS AND THE 3D BOARD DREW NONE OF
THEM.** `buildMapMesh` read `Maps.ENVIRONMENTS[id].zones` and never `.models`,
so every route ran across a bare plane while the map chooser's own thumbnails
showed a decorated one. `gl-geometry.js` gains a scenery vocabulary --
`frustum`, `boxAt` and `scenery` -- covering all ten authored kinds (antenna,
server, reactor, console, pylon, tank, vent, holo, battery, coil), and
`buildMapMesh` bakes them into the STATIC map mesh. They never move, animate or
turn, so nine props cost no draw calls and nothing per frame; measured cost is
+0.13 ms GPU at the light scene.

Each prop is built from its own map's palette, so Mana Coil's props are violet
and Sigil Lattice's are green with no second table to keep in step. Value ladder
per the model contract: dark shell, ley accent as the only bright note.

**`GLGeometry.Builder` now carries a per-vertex emissive channel**, the same one
the Blender exporter emits, so runtime-built geometry can own a lit surface too.
The map pass drives `uGlow` in the map's accent colour and resets it immediately
afterwards. This is the emissive-geometry rule applied to the board: a reactor
core glows and is occluded by whatever stands in front of it, rather than being
a disc painted over the top.

**EVERY ZONE IN THE GAME RENDERED AS `metalDark`, AND `P.panel` WAS NEVER
VISIBLE ANYWHERE.** The skirt around a zone slab was drawn both larger in x/y
AND proud of the slab -- for a deck the slab spanned z 0.4..9.4 and the skirt
8.1..9.5 -- so the skirt's top face occluded the slab's completely. Measured
before: three separate slab tops all read (27,47,60), which is `#132733` through
this pipeline to within 1/255. They now read (26,63,81), and floor-to-slab
luminance separation goes from **7.6% to 37.6%** -- out of the sub-8% "one dark
blob" band this project has already been burned by once on the Rifleman's
palette. The skirt is now a rim below the slab top rather than a lid over it,
which is what its size always implied.

**THE ROAD HAD NO SIDES, ON ANY MAP, EVER.** Both kerb quads in
`GLGeometry.road` were wound with their normals pointing INWARD, and
`CULL_FACE`/`BACK` is enabled in `GLRenderer`, so both were culled on every
frame. Worked through for a road along +X at half-width 10 and lift 7: the +Y
kerb's `u x v` came out (0,-700,0) and the -Y kerb's (0,+700,0), both pointing
back across the ribbon. That file's own header promises "a raised ribbon with
visible kerbs... real height, which is most of why the board reads as 3D the
moment the camera tilts" -- none of which had ever been on screen. Both windings
reversed; a kerb band now reads at luminance 36 against floor 41 and deck 71.

The lesson worth keeping: **a culled face and an absent face look identical, and
neither throws.** Winding is not checkable by looking at a still of the thing
from one angle, which is how this survived. Cross-product the quad by hand, or
turn `CULL_FACE` off for one frame and diff.

**2026-08-10 (later) — three panel shortcuts, and the monster blub comes back
inside the range.**

**X SELLS, O BUYS PATH A, P BUYS PATH B**, at the owner's request, and only
while a panel is open — outside one they are ordinary letters. `Delete` and
`Backspace` keep selling. None of the three is a camera key: panning is WASD
and the arrows, which is why `S` was never available for Sell and `X` is the
key that was, with `O` and `P` beside it in path order.

**The two upgrade keys press the BUTTON rather than reimplementing it.**
`pressUpgradeButton` looks the branch's rectangle up in
`inspectionLayout(...).upgrades` and calls `runPanelAction` at its centre, so it
inherits the context object, `refreshBlockReason`, and the rule that a maxed,
locked-out or unaffordable button swallows the press and does nothing. Calling
`performAction` directly would have been a second implementation of "buy the
next tier", free to drift from the mouse — and it needed no knowledge of any
tower's action ids, because all five types tag their upgrade actions with a
branch letter, the two config-driven adapters included. **The letters are drawn
on the buttons** (`drawKeyHint`), dim, against the right edge, from the layout —
five copies of "  (O)" in five `panelActions` would be five places to go stale.

**THE MONSTER BLUB WAS STANDING OUTSIDE ITS OWN TOWER'S RANGE.** Yesterday's fix
for "place it as near as possible to the track" let the sweep run out to several
times the range, and at tiers 0–2 that put the merged body well beyond the
circle the tower draws. The owner: *"make sure monster blub spawns like a normal
blub inside the range when T 0 1 or 2."* It is bounded to `rangePx` now and
still takes the spot nearest the road within it. Nothing is lost — Coagulation
needs A5 and A5 puts the range at 250 u.l., so a 35 u.l. body always has
somewhere to stand. Measured on all five tiers: T0/T1/T2 land 200 u.l. out
against a 250 u.l. range, 3.8 u.l. from the road, clear of the tower and leaving
it summoning; T3/T4 still fuse.

**A note for the next session that verifies in a browser.** `python -m
http.server` plus Chrome's heuristic cache served STALE `js/*.js` after edits
while reporting a successful navigation, and two placement readings taken that
way were measuring yesterday's code. Re-fetching every `script[src]` with
`fetch(url, {cache: "reload"})` before `location.reload()` is what forces the
real build. Check a known-new symbol exists before trusting a reading.

**2026-08-10 — the fifth tower: the Summoner, and the blubs that do its
shooting.**

**IT NEVER FIRES.** `js/blub.js`, $450, and the fifth build slot — the last one
the bar had. It plants standing units inside its own range and they shoot for
it. **A blub's hit points ARE its ammunition**: every attack costs one and at
zero it dies, which is the whole economy of the tower in one rule and the
reason nothing here has a magazine, a reload or a lifetime timer.

Built against a full written brief — two paths of five tiers, ten unit types,
a swarm buff, a weakening debuff, and Coagulation — with twenty-eight numbered
acceptance criteria. `tests/blub.test.js` is those criteria, one test each,
plus the regressions the session turned up. It runs standalone like the
Longshot and beam suites: **47 pass / 0 fail**.

**THE STRUCTURAL DECISION EVERYTHING ELSE FOLLOWS FROM: a blub is in the global
`towers` array.** It is not a recruit — those live on their parent and are
deliberately not towers. The brief asks for units that occupy space under the
tower rule, cannot be built on top of, open a stats panel when clicked, carry
HP, die, and eat area stuns. `towers` already provides every one of those:
`whyCannotBuild` compares footprint radii, `towerAt`/`inspected` gives the
panel and the Sell button, `sellValue` reads `totalSpent` (0, so the sell
button pays exactly the $0 the brief asks for), `TowerHealth.tickStun` catches
area stuns without this file knowing they exist, the destroyed sweep plays the
death animation and frees the ground in the same step, and `restartGame()`
clears the lot. `isSummon` is the one flag that takes it back out again — for
enemy attention.

**ATTACKS ARE INSTANT, not projectiles**, and that is a deliberate departure
from every other shooting tower here. A charge must not be spent on a corpse,
and instant resolution is strictly better than a claim: the enemy is already
dead when the next blub in the same step looks at it. Half the roster does not
fire a bullet anyway — the Hungry Blub splashes, the SuperBlub fires a free
piercing lance every tenth attack, the Mechablub MK2 detonates when it dies,
and a monster blub can hit the whole map.

**TWO FIGURES IN THE BRIEF DISAGREE WITH THEIR OWN PROSE, and the acceptance
test won both times.** The Hungry Blub's stated 1473 total across 35 charges
requires **compounding** 4% growth (additive totals 1176; `20 × (1.04³⁵ − 1) /
0.04 = 1472.95`), not the "4% of its base value" the sentence above it
describes. And the SuperBlub's five lances follow from a lance that costs no
charge. Both are flagged in the code and in `AGENTS.md` rather than quietly
reconciled.

**Also new, and both shared rather than tower-specific:**

- `js/systems/damage-amp.js` — the weakening debuff's stacks. NOT
  `buff-stacks.js`: that one is a count sharing one refreshed window, and the
  brief wants a thousand hits inside a second to decay as a thousand separate
  five-second timers. Running total plus a head index, so both operations are
  O(1) amortised on an enemy carrying its capped thousand stacks. Applied in
  `Enemy.takeDamage` **after** mitigation, because "+X% dégâts subis" is damage
  this body takes rather than a bigger swing armour then eats — before
  mitigation the same debuff would be worth twelve times as much against a
  swarm as against the armour it exists to crack.
- `TowerHealth.stun` learned `stunImmune`, checked in the one place rather than
  at the three call sites that stun.

**A SHOCKWAVE STUNS SUMMONS AND ONLY STUNS THEM.** The brief keeps both halves —
blubs cannot be attacked, but they take area stuns — so they are absent from
`attackCandidates` (no damage, and they can never soak an aimed shot meant for
a real tower) and a leap sweeps them separately for its stun alone. An aimed
shot picks one tower by name and has no area, so it does not qualify.

**Six corrections came out of playing it, and each is worth its own line:**

- **THE MONSTER BLUB WAS BLEEDING ITSELF TO DEATH ON AN EMPTY BOARD.** Its leap
  fired on a bare timer, and a tier 2 leap costs 20 charges — so a monster
  between waves spent 20 every 15 seconds into nothing. It is an attack now: no
  targets, no leap, and the clock **holds at zero** rather than banking, so the
  blow lands the instant a wave arrives. Same hold-at-zero rule an idle rifle
  has followed since v0.4.7.
- **A BLOCKED LINE NOW WAITS AT FULL INSTEAD OF STARTING OVER.** The brief said
  a failed cycle simply came round again; in play a full board spent every
  interval counting down to another failure, so a space that opened sat empty
  for up to thirty seconds. The bar pins full, the box says "no room", and the
  body lands on the frame a space opens.
- **THE SUMMON TOGGLES LEFT THE PANEL FOR A RAIL BESIDE IT.** Three action rows
  cost the panel its height and needed a layout exemption to fit; as grey boxes
  in a column they cost it nothing and the colour says "status, not shop".
  First cut opened a second panel view with a Producing/Stop button inside it,
  which the owner reported as "an unknown behavior" — clicking something that
  looks like a switch handing you another screen with a different switch on it.
  **The box is the switch now**: lit while producing, dim when clicked, with the
  base stats on the hover card, which is the gesture that cannot change
  anything.
- **COAGULATION STOPPED REPLACING THE TOWER BELOW TIER 3.** Putting the monster
  on the tower was wrong twice over under tier 3 — it hid the thing still doing
  the work, and it made a body that has to shoot stand wherever the tower
  happened to be built. T0–T2 go to the free spot nearest the road; T3 and T4
  fuse, because there the monster IS the tower.
- **A SOLD BLUB WAS A GHOST IN EVERY NUMBER.** It left `towers` — so it could
  not shoot and could not be clicked — while still counting towards its
  summoner's blub count, pooled HP, the swarm buff every other blub drew on,
  and the next Coagulation's tier. `sellTower` tells the owner now, through
  `isDestroyed`, so all five readers are fixed at once.
- **LAYING OUT THE PANEL PERMANENTLY SHORTENED A SUMMON CLOCK.** The fix for
  "a faster tier must bring the next body closer" was a clamp inside
  `recalcStats` — and `previewUpgrade` measures a tier by setting its flag,
  recalculating, and setting it back, so merely drawing the panel previewed A1's
  18 s cycle, clamped the running 20 s clock to 18, and left it there. It lives
  in `applyUpgrade` now. Same trap the HP grant documents one function down, and
  the same answer: a purchase is the only thing that may move live numbers.

**THE INDEX WAS TRUNCATING PATH B AT ITS CROSS-BRANCH GATE.** B3 requires A2 —
the Cyberblub is an evolution of the Blub III — and `walkBranch` stops at any
tier the tower refuses, so B4 and B5 were absent from the field guide entirely,
which is the one thing the field guide exists to prevent. A refusal that NAMES
another tier the specimen could buy is a route, not a wall: it buys it and asks
again. The Siphon's B5 gate names no tier, so that one still stops, as it
should.

**The panel layout gained `action.compact`** — a 34 px row that pairs with the
next one, for a switch rather than a purchase. Nothing sets it today (the
toggles moved to the rail before it shipped), so every existing panel lays out
exactly as it did; it is kept because the row planner it required is the
clearer code and because the next switch will want it.

**Two stale test lines were corrected on the way past.** `tests/content.test.js`
asserted "the gunner has no upgrade paths" against entry 0 of the roster — the
gunner was deleted on 2026-07-30 and everything shifted down a slot, so it had
been asserting that the **Warbringer** has no upgrade tree ever since. And
`tests/run.js`'s shared-run test counted `towers.length`, which a Summoner grows
for reasons that have nothing to do with what the line asserts.

**Sandbox only:** 5×, 10× and 20× on top of the game's 1×/2×/3×, by extending
`GAME_SPEEDS` rather than by replacing the button — speed is applied in exactly
one place and a second implementation would stop the workbench being a truthful
preview of the loop. And **base HP 100 000**, so a leak is a reading rather than
an ending. Neither touches the game.

**Priced at 90 coins in the armoury, NOT a starter.** `starter: true` would put
a tower that produces free damage forever into the opening kit, and the premise
the whole meta loop rests on — a fresh profile cannot win, which
`tools/measure-starter-kit.js` exists to keep checking — is measured against the
kit as it stands. If it belongs in the opening hand that is one field plus a
re-run of that tool.

**2026-08-09 (late) — the hammer came out of his chest, and the check that
should have caught it was worthless.**

**THE A4/A5 HAFT RAN STRAIGHT THROUGH HIS TORSO.** The rest pose put the weapon
on his centreline (y = -0.02) with the butt behind his shoulder and the head on
the ground in front, which is a line through his chest and hips. It now rests
off his ribs at `_SIDE`, where a man actually leans a tool.

**AND THE CLEARANCE CHECK REPORTED A COMFORTABLE GAP THE WHOLE TIME.** It
compared VERTEX TO VERTEX, and two boxes interpenetrate happily with their
corners far apart -- so a haft buried in a torso measured as 10 mm of clearance.
It was documented as "a proximity measure, not a proof", which was honest and
useless: a check that cannot fail on the thing it is named after should not have
shipped.

It now tests the weapon SOLIDS against the body SOLIDS as boxes and reports how
deep the worst one goes (`td_mesh.overlap`, `tower_warbringer.penetration`), and
the build FAILS on any overlap. Three classes of part are excluded and each for
a stated reason: hands and forearms, because closing on the haft is the point;
ley veins and the A5 core, because they are inlaid in the head; the anvil pad
and the stakes, because the head is supposed to rest on the deck. All seven
bodies now report 0.000 across all eight frames.

**THE WARBRINGER'S AOE NEVER DREW.** `drawReach` looked for `core.stats
.targetShape`, which the Smasher does not have -- it predates the config-driven
towers and keeps `arcDegrees` / `fullCircle` on itself -- so inspecting one
showed a plain circle where the real reach is a 120 degree wedge, or nothing
that matched the panel's own "AOE" row. It has its own branch now: a wedge on
its live aim below A4, a full circle from A4.

**PATH B'S STAKES GOT THEIR OWN IMPACT.** `warbringer-ring`: three rings chasing
each other outward at different speeds, teal like the stakes, with almost no
disturbance of the floor -- the tier hums, it does not split rock. The A path
keeps the forge-slam. `swing()` picks the kind off `hasUpgrade("B3")`, so one
event still resolves at one instant and only the picture differs.

**2026-08-09 (night) — the Warbringer winds up before it hits, recruits raise
their rifles, and path B plants stakes.**

**THE FIRST BLOW USED TO LAND INSTANTLY, ON ONE ENEMY, WITH NO ANIMATION.** A
long-standing bug the owner had been looking at. `attack()` applied damage the
moment a target appeared and then spent the cooldown playing the animation — so
the swing on screen was a REPLAY of a hit that had already happened, and a fresh
tower's cooldown is zero, so its first blow had no animation at all.

The swing is a real wind-up now: sighting starts it, `swingSeconds()` of
animation plays, and damage resolves at the END against the zone AS IT IS THEN.
That is also why it stops hitting only one enemy — half a second is long enough
for the rest of the group to walk in, which is what an overhead slam should be
waiting for. `swingProgress()` reads the wind-up instead of the cooldown, so the
frame showing the hammer touching the ground IS the tick that resolves it.

**The RATE is unchanged**: the wind-up is taken out of the cooldown that
follows, so a full cycle is still `cooldownSeconds`. Six content tests encoded
the old instant-damage behaviour and were updated to step the swing out through
a new `runSwing()` helper; one asserted the slow never lapses from a hard frame
6, which was really asserting that the hammer teleports, and now counts from the
first application instead.

**A4/A5 REST WITH THE HEAD ON THE GROUND**, at the owner's request — a monolith
on a haft, stood on the deck by his front foot with the shaft raked back to his
hands. He is leaning on it. The blow hauls it up past vertical, hangs for a
beat, and drives it down through the front. **Frames went 4 -> 8**: the arc
sweeps about 165 degrees and four frames could not describe it without the
hammer appearing to jump. Frames cost one 4x4 per group each, so eight is about
a kilobyte.

**PATH B PLANTS RESONATOR STAKES** (`build_b`, three bodies). He keeps a hammer
— a SHORT one, choked up for speed, because the tier sells rate and not weight —
and drives tuned stakes into the road instead of swinging at bodies. B3 plants
one, B4 a line of three, B5 a full ring, which is the shape of what each tier
does: one target, a chain, then everything at once. The stakes hang off a
`world_fixed` node, so they stay driven into the road while he turns.

**RECRUITS RAISE THEIR RIFLES.** The recoil landed, but the weapon never came up
— the rig carries it at the HIP (group origin z 0.70) with the barrel pointing
**36 degrees into the ground**, while `SoldierRecruit.fire` spawns the round at
30.1 u.l. high and 18.2 forward. So the rounds left a barrel aimed at his own
boots, which is exactly what "the bullets come out of thin air" looks like.

The aim pose is SOLVED FROM THE GEOMETRY rather than typed in: it reads the gun
group's own breech and muzzle out of the shipped model, works out the rotation
that levels that line, and then the translation that lands the tip on the spawn
point. Two hand-derived attempts missed — the first ignored the rotation
entirely, the second got its sign backwards and doubled the droop. Measured on
the real draw afterwards: barrel pitch **0.0 degrees**, muzzle height exact,
reach within 0.6 px. The small lateral offset is kept deliberately — a
shouldered rifle sits beside the spine, not on it.

`drawActor` grew an optional per-group pose applied on top of the baked frame,
and `GLMath.localPose` builds those matrices: rotate about a pivot, then
translate, in the group's own space. That ordering is what lets a recoil be
written as "swing the rifle about the shoulder and shove it back", which is what
a recoil physically is.

**2026-08-09 (evening) — the Warbringer's A path is in the game, recruits shoot,
and models can now be built without Blender.**

**`tools/blender/td_mesh.py` — THE SAME PRIMITIVES, NO BLENDER.** Blender is not
installed on the owner's machine, so a new model could not be authored at all.
This is a bpy-free implementation of td_scene's vocabulary (box, cyl, ball,
frustum, ellipsoid, tube, torus) that emits export_mesh's EXACT file contract:
same grouping rule, same group-local storage at frame 1, same column-major
per-frame matrices. `gl-models.js` cannot tell the two apart. Blender stays the
source of truth for anything that also needs a rendered sprite sheet.

One contract difference, documented in the file: **geometry is authored in WORLD
space and `parent` selects the animated group, not a second transform.** Baking
`location` into the vertices is what lets `_hands_on` put a fist on the haft by
naming the point on it. The first version also applied the parent chain and
transformed everything twice — the hammer floated a metre over his head.

**THE WARBRINGER, PATH A** (`tower_warbringer.py`, four bodies): a smith with a
sledge that grows through A1–A2, takes ley in the metal at A3, and by A4 is
holding a monolith overhead. Both hands close on the haft, and every hand is a
point along the haft's own axis, so the grip cannot drift off the shaft.

- **A4/A5 STOP TURNING**, which is the owner's read of the gameplay and exactly
  what the code does: `fullCircle: true` makes the wedge 360°, so `facingTarget`
  stops meaning anything. `gl-world.js` passes yaw 0 for a full-circle
  Warbringer — refusing the yaw at the CALL SITE covers the whole model, where a
  `world_fixed` group would have left his arms and hammer swinging round.
- **The fractured ring is drawn, not modelled.** As geometry it was invisible:
  the map's `deck` zones stand 9 px proud of the ground plane, so a crack lying
  0.4 px above z=0 is buried under the tile it is splitting. Anything that must
  lie FLAT goes through the camera; solid props with real height stay geometry.
- **The swing** comes from `swingProgress()`, already derived from the cooldown
  and already landing at 1 exactly when damage does. The frame mapping was
  `1 + floor(swing * (frames-1))`, which never showed frame 1 and held the last
  pose for two thirds of the blow; it is `floor(swing * frames)` now.
- **The ley lights on the blow**, not on a timer — dark while he waits, brighter
  as it comes over, a hard flash at contact.
- **`warbringer-swing` gets its own impact**: ground splitting from one point,
  not a shockwave. A shockwave is a ring travelling through air; this is a
  hammer arriving.

**A CLEARANCE CHECK, because "the hammer isn't passing through him" was asked
for by name.** Every weapon vertex against every body vertex, per frame, in
world space. His arms are excluded from both sides — a forearm across the chest
is a man holding something. It is a proximity measure, not a proof of
non-intersection, and it caught the two real failures: a swing that pivoted at
his ankles instead of his shoulders, and a pitch sign that swung the head
backward through his own back.

**RECRUITS SHOOT.** They had no firing action at all — a holding recruit was
pinned to frame 0 while rounds left him. `drawActor` now takes an optional
per-group pose applied on top of the baked frame, so the rifle drives back and
the muzzle climbs on the same `cooldown` the shot is fired from, the body
absorbs a fraction of it, and nothing is stored. The rig already had `arm_l`,
`arm_r` and `gun` as separate groups; this is real geometry moving, not a
sprite swap.

**2026-08-09 (later still) — a prop must be frozen WHOLE, and there is now a
tool that checks it.**

Reported: the B5 hat rack "separed, some part move some part doesn t". Exactly
so, and the numbers say why. The rack's posts sit 0.30 from its centre and its
outer hats 0.262 — while the back of the man's overcoat sits 0.30 to 0.34 from
the same point. **The two ranges overlap, so no radius separates them**: 0.42
took his coat (yesterday's bug), 0.25 cut the stand in half. What separates a
rack from a man is x, not distance.

So `gl-parts.js` grew **axis-aligned box volumes**, and the rack, the dais and
the strongbox now use them. The strongbox was torn the same way and nobody had
noticed: its body was frozen while its dial (0.84 out, past the 0.80 radius) and
its gold bar (z 0.315, past the deck cut) still turned with the man.

**THE WARBRINGER CONCEPT IS WRITTEN**, in
`tools/blender/WARBRINGER_CONCEPT.md`, from the owner's brief and before any
modelling — the same order the Rifleman was done in. The one finding worth
repeating here: the owner's instinct that at full AoE "he doesn't bother hitting
the enemies, he stops turning" **is what the code already does**. `fullCircle:
true` at A4/A5 makes the wedge 360°, so `facingTarget` stops meaning anything
and the tower has no facing left to track. So at A4/A5 the ENTIRE model is
`_world_fixed_child` — the cleanest possible case of the map-fixed contract, no
volumes to tune and nothing that can tear. The doc also ranks the next five
enemies to model, by how badly a coloured sphere lies about each one.

**A TORN-PROP DETECTOR, because eyeballing this does not scale.** A prop is a
cluster of solids that TOUCH; if part of that cluster is map-fixed and the rest
is not, it tears the moment the tower turns. The tool flags every grounded
solid that is NOT fixed but whose bounding box touches one that is. Run it after
changing any volume. It reports contacts as well as tears — a man's boots on the
deck he stands on will always show up — so each hit is read against the build
script rather than fixed blindly. On the current set every remaining hit is a
genuine figure-on-prop contact.

Bias, at the owner's instruction ("be cautious with the details"): when a solid
is borderline, let it TURN. A detail that turns with the tower is a far smaller
error than a prop split down the middle.

**2026-08-09 (later) — the readouts came back, the volumes stopped eating the
man, and this log moved out of `AGENTS.md`.**

**THIS FILE EXISTS AS OF TODAY.** The owner asked whether a 7 500-line
`AGENTS.md` was really necessary. It was not: 3 800 of those lines were this
log, so the rules were buried under the history. `AGENTS.md` is now 3 700 lines
of what is TRUE NOW; every entry is preserved here, unchanged.

**HEALTH BARS WERE DRAWN AT THE WRONG HEIGHT, WHICH IS THE SAME AS NOT AT ALL.**
The lift came from `footprintPx * 2.6` — footprint measures how much GROUND a
tower occupies. A Rifleman's is 11.7 and he stands 64 px tall, so the bar was
painted across his waist: a dark bar on a dark coat, invisible in play. Models
now record their own top at expand time (`model.top`, gl-models.js) and every
readout hangs off that. A sphere or a stand-in cylinder still falls back to the
radius rule, because for those the old figure was right.

**A SHIELD IS A SECOND POOL AND IT EMPTIES FIRST.** The bar read only `health`,
so a Bulwark could absorb a dozen hits with nothing to show for it — each one
lands on the shield, health stays full, and the bar suppressed itself as
undamaged. Enemy bars now carry a shield strip, the same split the 2D hover card
always used.

**THE HOVER READOUTS WERE NEVER PORTED.** `drawEnemyHover` and
`drawRecruitHover` live inside the 2D world block that the 3D branch replaces,
so pointing at a body gave a ring and no numbers. Both are now drawn by
`World3D.drawOverlays`, anchored to the projected crown of the body so they
follow the camera, with the recruit's own reach ring restored alongside.

**THREE PROP VOLUMES WERE SWALLOWING THE FIGURE.** Reported: "b4 and b5 torso
and part of his legs count as the non moving part." All three were volumes sized
to a comfortable radius rather than to the prop:

- B5's rack, r 0.42 at x -0.66, reached x -0.24 and froze the back of his
  overcoat and his shoulders. Now 0.25, which covers the rack and its hats.
- B3's spotlight, r 0.30 at (-0.30, -0.40), reached the man's own y and froze
  his near arm. Now 0.20.
- A3's stand, r 0.30, took his shoulder and hip arm. The servo box genuinely
  sits 0.27 from the stand centre and his arm sits 0.26 to 0.30 from the same
  point, so no single radius separates them: the stand is now a tight 0.22 and
  the servo has its own small box high up, where no part of him is.

And a guard that makes the whole class of bug harder to reintroduce: **a
component that dips below the ground plane can never be map-fixed**
(`GROUND_EPS`). Ground props rest on the ground by construction; the Riflemen
are authored with their origin at hip height and their legs running to z = -0.5,
so this alone rules the figure out of every volume drawn around him.

**The lesson about testing, again.** The zero-pixels-moved test proves the fixed
set does not ROTATE. It says nothing about whether the fixed set is CORRECT — it
passed with his torso in it. What found this was rendering the two sets
separately and looking at them, which is now the documented check.

**2026-08-09 — the ground stopped turning, the guns light themselves, and the
rules for the next model are written down.**

The owner's verdict on the result: the game "feels much much much better". What
follows is the mechanism, and **the contract every future model has to meet is
now a body section — "Building a model that looks like the ones that already
work"** — rather than something to be reverse-engineered out of this log. The
Warbringer and the Siphon are the next two, and they should meet it from the
first commit.

**LIGHTING WAS RAISED**, at the owner's request, once the models stopped being
lit by canvas blobs sitting on top of them: key 0.88 -> 1.02, ambient and fill
lifted in the same proportion. The RATIO is untouched, so a sunlit top face
still lands near the authored colour instead of blowing out.

**EVERY BASE ON EVERY MODEL IS NOW MAP-FIXED**, not just the two that were
reported. A sweep of all twelve tower models — searching the exported geometry
for wide flat solids sitting near z 0, then reading the build script to confirm
what each one is — found three more that were turning:

- Rifleman B5's `dais`: the deck, lip and four corner crates he stands ON, and
  the largest single surface on the model.
- Rifleman A3's `feed_stand`: foot, chromed column, clip rack, servo and the
  case leaning against it.
- Sniper A4's `mount_base` / `mount_ring` / `mount_glow`: the squat bolted
  mount. The cut is at z 0.36, because everything above it — yoke arms at 0.49,
  axle and trunnions at 0.72 — is the GIMBAL, which genuinely does swing with
  the weapon.

Sniper base/A3/B3/B4 have no base geometry at all (`build_caster`: "NO PLINTH --
Tower.draw already puts a raised platform under every tower"), so there is
nothing to fix on those and nothing missing. That was checked rather than
assumed: an earlier draft of this entry claimed the same about A4 and was wrong.

The A3 stand volume is authored 0.06 off the stand's own centre: his rear shoe
sits 0.26 from that point and the stand's foot is 0.23 wide, so centred on the
authored value the two overlap and centred here they do not. That kind of nudge
is exactly what clause 1 of the model contract exists to make unnecessary.

**WHAT IS BOLTED TO THE MAP NO LONGER PIVOTS WITH THE WEAPON.** A tower turns to
face its target, and in 3D that is a yaw on the whole mesh. Right for a man with
a rifle; wrong for what he is standing among. A5 is a floating cannon on an
installed foundation, B5 is a prisoner chained to four stone obelisks, and the
Rifleman fights from behind crates with a spotlight on a stand. All of it
orbited once per turn.

The Blender rig already knew. `tower_sniper.py` builds both foundations under
`_world_fixed_child`, whose driver cancels the aiming parent's yaw precisely so
the shrine stays bolted to the same world corners in all 48 sprite rows. That
did not survive the export: **a driver is not an action**, so
`export_mesh._group_root` walked straight past it and the foundation landed in
the same unnamed group as everything else that does not animate. The Rifleman's
scenery was never counter-yawed at all — it hangs off the aim root, so it span
in the sprites too; stopping it is a change to the design, at the owner's
request.

Fixed at both ends:

- `export_mesh.py` now recognises those nodes and emits a `world_fixed` group.
  The next Blender run makes the runtime recovery below dead weight.
- Blender is not installed here, so the models on disk cannot be re-exported.
  `js/gl/gl-parts.js` recovers the same subtrees from the shipped geometry:
  union-find over shared vertex positions puts exactly one authored primitive
  in each connected component (every `td.box`/`td.cyl`/`td.ball` is its own
  mesh, and two that merely overlap share no vertices), each component is
  classified WHOLE against volumes taken from the build script's own placement
  calls, and the triangles are stably partitioned so the map-fixed ones are a
  contiguous head of the unnamed group. `drawActor` draws that head with the
  yaw taken out — one extra draw call, no second mesh.

Classifying whole components rather than triangles is the part that matters:
half a crate turning would be worse than all of it turning. Only the unnamed
group is reordered; the animated groups own explicit ranges and their own
per-frame matrices, and moving a triangle across that boundary would hand the
bolt's pose to the stock.

Verified by suppressing every draw that carries a yaw and diffing the
framebuffer at two different aims: **zero pixels moved**, on both snipers and on
the Rifleman. (The naive test — diffing the whole tower — is useless here: the
barrel sweeps over its own foundation, so occlusion changes those pixels
whether or not anything rotated.)

**THE CHARGE IS THE WEAPON NOW, NOT A DECAL OVER IT.** The wind-up was drawn as
translucent discs on the 2D canvas, one per authored coil point. Being canvas
they sat on top of the entire board — visible through the barrel, through the
enemies standing in front of the tower, through everything — which reads as a
sticker rather than as a machine warming up, and the owner's word for it was
"ugly".

These models already carry emissive materials on exactly the right parts: the
coil stages, the arc core, the aperture, the breech orb, the pylon lamps. That
emission used to be folded into the vertex colour as a floor, which is right for
a cigar and wrong for a weapon. It is now its own per-vertex channel with a
`uGlow` uniform driving it, so a tower hands its firing cycle straight to the
shader and the light lands on the geometry it belongs to — **occluded by
whatever is in front of it, because it is real geometry.** Cubed against the
cycle, so most of the cycle is dark and it winds up just before the shot; a
linear ramp reads as a lamp on a dimmer. What stays on the canvas is only what
geometry cannot do: current arcing across a gap, the spinning rune circle, and a
faint heat haze in the air at the mouth.

**THE B-PATH RELOAD READOUT AND THE STUN CAME BACK.** From B3 the Sniper fires
four and stops for a beat, which is the one thing about it a player can act on.
The 3D port lost the pips, so the tower simply stopped firing with nothing on
screen to say why. Restored as pips above the tower with a countdown bar under
them while reloading — and gated on `stats.flags.reload`, not on the presence of
the tracker, because the tracker is built from config for the whole tower type
and a graft-path cannon that never reloads was showing four pips of nothing. The
stun (B5 pays seven seconds for its strike) now carries a countdown arc on the
ground and three sparks orbiting the head, rather than a ring indistinguishable
from a selection mark.

**HOW THE MAP-FIXED CLAIM IS TESTED**, because the obvious test is wrong.
Diffing the whole tower between two aims proves nothing: the barrel sweeps over
its own foundation, so occlusion changes those pixels whether or not anything
rotated — it read as a failure twice before that was spotted. The test that
works is to suppress every draw whose matrix carries a yaw, leaving only the
geometry claimed as map-fixed, and diff THAT at two aims. All seven models with
declared foundations move **zero** pixels.

All four suites at baseline: 105/3, 182/30, 70/1, 45/0.

**2026-08-08 (night) — every tower effect is in the 3D build, and three
projection bugs that were quietly wrong came out with them.**

**THE EFFECTS ARE PORTED, NOT REINVENTED.** `js/gl/gl-world.js` now draws
everything the 2D pack drew, from the same tables and the same constants:
the Arcane Sniper's coil charge (`SNIPER_FX`, the authored muzzle and coil
points `tower_sniper.py` prints), A4's arcs jumping between lit coils, A5's
rune ring around the muzzle and its five kill-stack hoops, the A4/A5 lance and
the remnant it leaves, B5's covenant round and the seal it breaks on contact,
the three-second channel telegraph and the strike that resolves it, the
Rifleman's per-tier rounds and muzzle star, and the recruits' poorer version of
both. Where 2D drew a screen-space ellipse for a thing lying on the board, 3D
projects the real shape per vertex — a ritual circle is a ground circle under
this camera, not a squashed sticker.

Two rules the port is built on, both learned the hard way here:

- **A beam keeps its WIDTH and loses its ALPHA.** Pierce falloff eats the
  shot's damage as it travels; carrying that in the width draws a cone, which
  says "spreading out" — the opposite of what a rail lance does. One `beam()`
  serves the live shot and its remnant so the afterimage cannot disagree with
  the shot that made it.
- **Light is sized in WORLD units.** `glow()` takes a board-pixel radius and
  converts. A muzzle flash pinned to a screen-pixel radius is the size of the
  whole weapon once the board is zoomed out.

**`project()` RETURNED THE SAME OBJECT EVERY TIME.** It projected into one
shared scratch, and `worldToScreen` writes into whatever it is handed and
returns it — so two calls returned one object. Almost everything here holds two
points at once: a spark's head and tail, a beam's muzzle and head, the four
corners of a light column. Every one collapsed to a zero-length line the moment
the second call overwrote the first, which is why sparks drew as bare dots and
the debris fan drew nothing at all. It reads as a design choice right up until
someone holds three points. Each call allocates now; a few hundred small objects
a frame is nothing beside the gradients this file already builds per shot.

**`worldToScreen`'s SCALE CAME FROM THE VIEW-PROJECTION.** It read `vp[5]`,
which is a term of `proj * view` and therefore carries the camera's yaw and
pitch: orbiting the board changed it by a factor of five while neither the depth
nor the lens had moved, so every spark, bar and bloom silently shrank as the
player turned. It reads `_proj[5]` — `1 / tan(fovY / 2)`, the lens alone — and
now matches measured pixels-per-world-unit to 0.06%. The compensating `* 0.5`
that had been sprinkled over every caller is gone with it.

**`viewProjection()` REBUILT THREE MATRICES PER PROJECTED POINT.** It is called
once per point, not once per frame, and the overlay layer projects every vertex
of every ring, cone and spoke — so a 44-point ring paid for 44 lookAts, 44
perspectives and 44 multiplies. Cached on eight numbers (eye, target, lens);
`_recomputeBasis()` rewrites `_eye` whenever the camera moves, so it cannot go
stale. A crowded board with 24 live impacts went 22.2 ms → 16.1 ms.

**THE STRAY RING BESIDE THE PANEL WAS `drawInspection`, AND HAD BEEN ALL
ALONG.** Reported three times and "fixed" twice on the wrong suspect. It draws
the subject highlight and range circle at the tower's WORLD position but after
`ctx.restore()`, in raw logical screen pixels. In 2D that is correct by
construction — the world transform is identity at the default camera, so world
(560, 300) and screen (560, 300) are the same point. Under the 3D camera they
are not the same point and cannot be made into one, so it painted a 260 px
circle at logical (560, 300), which lands next to the inspection panel. It now
draws neither when the 3D world is on; `drawOverlays` owns both marks, and the
inspected tower's footprint ring is amber to keep the panel's colour language.

**A NaN ALPHA IS A THROWN EXCEPTION, NOT A BAD-LOOKING BEAM.** `addColorStop`
rejects `rgba(r,g,b,NaN)` with a SyntaxError, and this runs inside `draw()` — so
one shot with incomplete falloff parameters took out the whole frame, HUD
included. `beam()` clamps.

**AND THE NaN WAS REAL, NOT A TEST ARTEFACT — IT WAS CRASHING sandbox.html ON
EVERY LOAD.** `Pierce.damageAtIndex` read `params.softener` and `params.decay`
blindly, though this file's own header has promised the spec's 20 and 0.95 as
defaults since it was written. A tower holding the `pierceFalloff` FLAG with no
mechanics block — a legal intermediate state while an upgrade tree is authored,
and what the sandbox scene produced — returned NaN.

This is a simulation bug, not a cosmetic one, and NaN is the worst possible
answer to give here: it is not `<= 0`, so `PierceBullet`'s "the falloff has worn
this shot out" test does not catch it, and the shot goes on to call
`enemy.takeDamage(NaN)`. It only surfaced because the renderer now treats that
number as an alpha and canvas refuses to. `damageAtIndex` implements the
documented defaults.

Verified in the browser on the real game, not on a harness: recruit bars sampled
pixel-by-pixel at 0.97/0.75/0.40/0.15 health and matching the authored green,
amber and red exactly; the cone wedge and its cursor-following re-aim preview
committing the angle it previewed; the channel, strike, lance, remnant and
covenant round each framed and read; 20 maxed towers with 60 enemies and 40
rounds in flight at 50 fps with the overlay layer measuring at essentially zero
cost against the WebGL pass. All four suites at their recorded baselines:
105/3, 182/30, 70/1, 45/0.

Also fixed `.claude/launch.json` in the repo root, which still served
`TD_0.4.13`.

**2026-08-08 (evening) — the models animate, the effects have shape, and the
last pointer bug is gone.**

**RIGID-GROUP ANIMATION, NOT VERTEX FRAMES.** The obvious export is a copy of
the mesh per frame, and for these models it is enormous: the base Rifleman is
9224 triangles, so four frames of a bolt cycle in which only the bolt moves is
about 2.8 MB. Every rig here animates by keying EMPTIES and the geometry
hanging off each one is rigid, so `export_mesh.py` now walks up from each mesh
to its nearest animated ancestor, stores the geometry once in that empty's
local space, and writes one 4x4 per group per frame. **The Rifleman's whole
animation costs 2 KB** (687.9 against 685.7). The runtime uploads one mesh and
issues a draw call per moving group.

Animated: all five Rifleman bodies (4 frames), both recruits and all four
enemies (8), and the Sniper's base/B3/B4 (4). A3-A5 and B5 are stills on
purpose -- those tiers charge rather than reload and that was always drawn
procedurally.

**The clocks are the ones that already existed.** Towers index the cycle off
`gearPhase()`, which already reconciles burst and automatic fire; enemies and
recruits advance by `progress`, so a planted foot stays on one patch of road, a
slowed enemy's legs drag and a stopped one stops mid-step. Identical mapping to
the sprite sheets -- the 3D board plays the animation the 2D board could only
flip between. Measured with 25 towers and 62 enemies: **1.23 ms/frame, 411 draw
calls, 494k triangles.**

**Effects have structure now.** A blast was one translucent disc that grew and
faded, which reads as exactly that -- a circle appearing. It is now a
shockwave lying ON THE GROUND: a thin bright leading edge, a dimmer wake
chasing it, a scorch that outlives both, and a deterministic debris fan. Sparks
follow a real ballistic arc and are drawn as short streaks along their own
path with a hot core while fresh, rather than as round dots that shrink. All on
the ground plane deliberately -- a camera-facing blast would swing around as
the board turned, and lying flat is the one thing a 3D board can say that a 2D
one cannot.

**`worldMouse` was stale for a frame or three, and it was the last of the
pointer bugs.** It was recomputed on mousemove, which covered every case in 2D
because the 2D camera only moved during a drag and a drag IS a mousemove. The
orbit camera keeps easing for a few hundred milliseconds after the mouse stops
and refits itself when a map loads, so the ground under a stationary cursor
kept changing with nothing to trigger a refresh -- **98 px of drift**, showing
up as a build ghost and a range ring sitting away from the cursor.
`refreshWorldPointer()` now also runs once per frame while 3D is on.

**2026-08-08 (later still) — the 3D overlays were in the wrong coordinate
space, and five bugs fell out of one line.**

**THE CANVAS HAS THREE COORDINATE SPACES AND THEY ARE NOT INTERCHANGEABLE.**
`VIEW_WIDTH`x`VIEW_HEIGHT` is the fixed LOGICAL space every 2D draw call and
every `toGameCoords` result lives in; the CSS box is whatever the window makes
it; the backing store is CSS times device ratio, capped. `worldToScreen`
returned CSS pixels and `screenToWorld` divided by the BACKING STORE. Neither
matched the space the game speaks, so:

- the build ghost and its range ring sat away from the cursor,
- clicking a tower missed it, so upgrades were unreachable,
- health bars, hover rings and effects were all displaced,
- and the error scaled with window size, which is why it looked arbitrary.

`OrbitCamera` now takes a `viewport` (set to the logical view) that
`worldToScreen` and `groundCircle` project into, plus `viewToClient` as the
explicit inverse of `toGameCoords`. A logical -> world -> logical round trip is
exact at every probe. **When adding anything that draws in world space, say
which of the three spaces the number is in.**

**Right-drag did nothing immediately after an orbit.** The orbit pivot outlives
the middle-drag until the easing settles, and while it lives `update()`
recomputes the target from it every frame -- overwriting whatever the pan had
just set. Two gestures cannot both own the target, so starting a pan drops the
pivot.

**No range ring ever drew in 3D.** `showRange` was assigned inside the 2D world
block, which the 3D branch skips. It is set in `worldRenderState()` now, so one
rule serves both renderers. The inspected tower also gets its deadzone and
footprint rings, without which a Sniper cannot be repositioned by eye.

**Every sphere enemy was the fallback grey.** The authored colour is on
`enemy.type.color`; the code read `enemy.color`, found undefined, and fell
through -- silently, and it looked deliberate.

**The hover ring stuck to dead enemies.** `hoveredEnemy` only refreshes on
mousemove; `drawEnemyHover` has always re-asked `enemyAt` per frame for exactly
that reason, and the 3D path now does too.

**2026-08-08 (later) — 3D IS the game now: index.html and sandbox.html both
render the WebGL board, and every actor has a 3D body.**

`game3d.html` is gone — it existed for one session as a safe copy, and keeping
a second page was exactly the duplicated-document failure this file opens by
warning about. `index.html` and `sandbox.html` carry the 3D stack themselves;
if WebGL is unavailable the install fails cleanly and the 2D renderer takes
over unchanged. All suites at baseline after (105/3, 182/30, 70/1, 45/0, plus
the sandbox smoke).

**The "camera disappeared" bug was an input-routing bug.** The 3D board draws
on a canvas BEHIND the HUD canvas, so the camera bound to its own canvas
received no pointer events at all. `OrbitCamera` now takes an `inputTarget`
(the top canvas) separate from its projection canvas. The three gestures the
2D game already owned are shared rather than fought over: the 2D middle-drag
map-grab and wheel-zoom stand down when World3D is on, and right-click-cancel
checks `camera.rightDragMoved` (4 px of slop) so a pan is not a deselect but a
twitchy click still is.

**Every actor renders in 3D now, by one of three routes:**
- *Exported Blender model* — the Arcane Sniper joined the Rifleman: all seven
  of its bodies (base/A3/A4/A5/B3/B4/B5), picked by the same `purchased`-tier
  rule the sprite pack uses. 18 models, ~128k triangles total.
- *Sphere* — every enemy type without an authored mesh is a low-poly sphere in
  its own type colour at its own live radius, with a darker cap ring so it is
  two values instead of a dot. The 2D game drew these as circles; the sphere
  is the same statement in the new grammar.
- *Cylinder* — a tower without a mesh (Warbringer, Siphon) is a capped
  cylinder in its own `tint()`, on a pad. Never invisible, clearly a stand-in.

**Effects are visible in 3D.** `Effects.worldState()` exposes the live
particle/popup/impact arrays read-only; `World3D.drawEffects` projects them —
impacts as expanding ground rings via `groundCircle`, sparks as dots that rise
in real z (the 2D pass faked altitude by subtracting from y, which under a
perspective camera slides along the ground instead), bounty popups as
screen-size text. The quake cracks and screen flash still work: drawScreen was
always outside the world transform.

**Animation is procedural whole-body for now.** Enemies bob once per stride
driven by `progress` — distance, not a clock, the same rule the sprite walk
cycles follow, so a slowed enemy trudges and a stopped one stands. Sphere
types squash-and-stretch on the same beat. Recruits bob while marching and
stand still while `holding`. Towers kick back along their aim for 90 ms after
`sinceShot()`. Per-frame rig export (real limbs moving) is the follow-up.

**The models were always 3D.** `tools/blender/*.py` has been the source of
truth since the first enemy and the sprite sheets are a *render* of it, taken
from one fixed camera and quantised to 48 facings. `tools/blender/export_mesh.py`
exports the geometry itself instead — 11 models, 85k triangles, replacing about
40 MB of PNG. They ship as plain `.js` that calls `GLModels.register`, because
over `file://` `fetch` and `XHR` are blocked and a `.glb` cannot be loaded at
all. No loader, no parser, no dependency, and the game still opens by
double-clicking.

**THE WHOLE PORT IS TWO HOOKS**, because `draw()` was already split exactly
where it needed to be:

- `draw()` — one `if` around the existing world block. `World3D.drawWorld`
  replaces terrain, road, bodies and projectiles and returns false when the 3D
  build is not installed. Everything past `ctx.restore()` — HUD, panels, menus,
  chooser, codex, store — never knew where the camera was and still does not.
- `screenToWorld()` — the single funnel every world-space input goes through
  (hover, placement, inspection, aiming). Pointing it at a ground-plane raycast
  makes the entire input layer work in 3D without touching one call site.

**What is 3D and what is deliberately not.** Physical things — terrain, road,
bodies, projectiles — are WebGL. Interface *about* a physical thing — health
bars, range rings, the build ghost — stays on the 2D canvas, positioned by
`OrbitCamera.worldToScreen`. Billboarding those into the 3D pass would make
them shrink with distance and tilt with the board, which is wrong for
interface. A ground circle is projected per-vertex by `groundCircle`, because
under an orbited camera a range ring is a skewed ellipse and `ctx.ellipse`
cannot draw one.

**The camera is Baldur's Gate / Roblox.** Middle-drag orbits, right-drag pans,
wheel zooms to the cursor, WASD pans, R refits. Three properties are exact
rather than approximate, and each is asserted numerically rather than eyeballed:
the pan grabs the ground under the cursor and holds it (0.000 px drift), the
zoom holds the ground under the cursor (0.000 px), and the orbit turns around
the point grabbed at drag start (0.02 px on screen across the pitch range).
Each was wrong once and measurement is what found it — a pan reading the live
damped orbit drifted 1806 px, a released pivot slid 434 px, and clamping the
target instead of the pivot tore it off its anchor.

**One measurement trap worth recording.** Pivot drift measured in WORLD units
looked like a 505 px failure; the same error measured on SCREEN was 0.02 px. At
a shallow pitch the ground is nearly edge-on, so a sub-pixel screen error is
hundreds of world units. Measure the quantity the player can actually see.

**Colour is linear now, everywhere.** The first 3D pass multiplied sRGB values
by the light term, which is the classic mistake and does not look subtly wrong
— `#2E2F3C` charcoal rendered as mid-grey. sRGB stretches the dark end, so a
1.3x multiply lands far further up the curve than the same multiply in linear.
`GLGeometry.hex`, `GLModels.expand` and `td_scene.srgb` now all use the exact
same curve, and the shader converts once on output.

**What is NOT done.** Effects (particles, popups, the earthquake, blast rings)
still draw through the 2D path and are currently invisible in 3D. Only the
Rifleman and the four authored enemies have meshes; the Warbringer, Arcane
Sniper and Siphon draw as placeholder blocks. Enemy walk cycles and tower
firing animations are not wired — the exported meshes are single poses. The
terrain reads lighter than its authored floor colour and wants a lighting pass
against the Blender previews.

**2026-08-08 — the rendered models were unplayable at fifty enemies, and it was
never the sprites.**

Presentation only. The owner reported the board freezing once the rendered
enemy models were in with about fifty bodies on it. Measured rather than
guessed, and the answer was two canvas features, not the art:

```
150 enemies + 10 towers, draw only
  as shipped                              31.0 ms/frame   (32 fps)
  without ctx.filter                      ~13   ms/frame
  without ctx.filter and canvas shadows    7.5 ms/frame   (133 fps)
```

**`ctx.filter` and canvas shadows are not ordinary state changes.** Each forces
the drawImage it wraps onto a separate surface, filters or blurs it, and
composites it back — per sprite, per frame. Blitting 150 sprites costs about
6 ms; filtering and rimming them cost 25.

**Both were being paid by every enemy on every frame regardless of state.**
`enemyFilter`'s resting value was a permanent `brightness(1.04) contrast(1.08)`
lift and `enemyRimColor`'s was a constant pale halo, so nothing on the board
ever took the cheap path. **The rule now is that a filter or a shadow may only
carry STATE**, and anything wanted on a resting model has to be baked into the
sheet by Blender instead.

The hit flash and slow tint moved off `ctx.filter` onto a new `tint` option in
`js/visual-models.js`: the tile is copied into one shared scratch canvas,
`source-in` floods it with the colour while keeping the sprite's alpha, and the
silhouette is drawn over the sprite at the requested strength. Two ordinary
blits instead of a filter pass, and no per-sheet cache to hold in memory.

The rim is gone entirely, including for the flash. Keeping it for that alone
still cost about **1 ms per flashing enemy**: a quarter of a fifty-enemy board
taking a hit ran at 20.8 ms against 7.1 ms resting. The tint already washes the
whole body white at the moment of the hit, which is a larger and more legible
change than an edge glow was.

Real end-to-end frame times after, median over 70 frames:

| enemies | resting | a quarter flashing |
|---|---|---|
| 50 | **7.0 ms (143 fps)** | 13.9 ms (72 fps) |
| 150 | **7.0 ms (143 fps)** | 20.9 ms (48 fps) |
| 450 | 14.1 ms (71 fps) | 62.4 ms (16 fps) |

Fifty enemies was 32 fps and is now 143. **What is left is the tint itself** at
high simultaneous-flash counts — about 0.55 ms per flashing body, which only
bites when an area attack lights up a large fraction of a very full board. The
next lever there, if it is ever wanted, is one lazily-built white-silhouette
copy per sheet (about 5 MB each) so the flash becomes a single extra blit with
no per-draw fill. It was not built because the reported problem is fixed with
room to spare and 40 MB of canvases is a real cost to pay for a case nobody has
hit yet.

**Leaving the browser was considered and rejected.** Canvas was never near its
limit here; one badly-chosen canvas feature was doing 4x the work of the entire
rest of the frame.

**2026-08-07 — the Rifleman is a rendered model: a boss in a suit, and the one
tower on the board with no magic in it.**

Presentation only. Not a stat, a cost, a footprint, a range, a rate, a tier
table, a recruit number or a targeting rule moved. `tools/blender/tower_rifleman.py`
builds seven bodies and sixteen accent layers; `js/skins/draw-pack.js` composites
them over `soldier:body`; the procedural clockwork automaton in
`Soldier.prototype.drawFigure` is still there and is still the fallback.

**What he is now, and why it is the right answer for the STARTING tower.** Every
other defender pays for power by stopping being a person -- the Arcane Sniper
bolts the enemy's own hardware onto himself on path A and burns what is inside
him on path B, and the Warbringer was never a man. The Rifleman is the one who
does not: a boss in a three-piece suit and a fedora, with a lit cigar, a gold
watch chain and a violin case of gold-cased clips at his feet, firing a
walnut-stocked carbine from the hip. He is the baseline the rest of the roster is
measured against, he is what $300 buys, and he is still standing there unchanged
at wave 35. That is the whole design.

**HE HAS NO FACTION COLOUR AND MUST NOT GAIN ONE.** He owns none of the
ley/sigil palette. `td_scene.PALETTE` gained a tailoring set -- charcoal,
ivory, oxblood, real gold, walnut, blued steel -- and the only two emissive
materials on the model are a cigar ember and a spotlight filament. Both are
fire and tungsten. Path A is allowed *a bit* of cybernetic, because path A is
the arsenal and by A4 he is wearing hardware to work a mounted gun: the budget
is exactly three things (a chromed forearm brace, one servo readout, a
targeting monocle) and it is spent so that A5 still reads as a man in a suit
operating a machine -- the direct inverse of the Sniper's A5, whose point is
that nothing of him is left. Path B gets none of it at all. Its camo detection
is a filament in a can on a tripod, its defence pierce is a case of gold-tipped
shells, and its recruits are hats on a rack.

**The tiers, and what each one draws.** A0-A2 a carbine and the case; A3 a
chromed feed column and a loader arm, so he stops reaching -- which IS the
shorter burst cooldown; A4 the gun leaves his hands onto a hopper-fed pintle;
A5 a four-barrel battery with a drift of spent gold around the pad. B3 the
burst ends and so does the weapon -- drum-fed automatic, overcoat, barricade,
spotlight; B4 crates and riveted plate, a rack with two spare guns and TWO
HATS, an open case of gold-tipped shells; B5 a dais, a heavy tripod gun, a
fur collar, a strongbox and FOUR HATS. **The hats are the recruit count**, so
B4's two and B5's four are readable without opening the panel, and
`make_preview.py --validate-riflemen` asserts both.

**Two things it does differently from the Sniper, both deliberate.** Its final
tiers DO carry crosspath accents (sixteen accent sheets, not eight): A5+B1+B2
is the owner's own specified build at 9 damage / 75 DPS and B5+A1+A2 is a row
in the DPS table, so leaving those bare would hide a bought upgrade on exactly
the two builds the balance notes single out. And the four animated frames are
indexed off `Soldier.gearPhase()`, which already reconciles the tower's two
firing models -- so the same sheet plays as a measured burst at base, a fast
one at A5 and a continuous shudder from B3, with no second clock anywhere.

**His recruits are modelled too, and they are deliberately pitiful.**
`tools/blender/summon_recruit.py` builds `soldier-recruit-b4` and `-b5`. They
are not his crew: B4 is a survivor in a coat two sizes too big, one boot and
one rag-wrapped foot, a rag over the mouth, a bedroll and a satchel, carrying a
short carbine that is wire-wrapped at the wrist because it broke once already.
B5 is the same person four weeks later -- a helmet a size too big, a webbing
belt, boots that match, a full-length bolt rifle, and **the Rifleman's oxblood
armband**, which is the only thing on either model that says who sent him. He
stands straighter and he is still thin and still hunched, because 40 hp and 3
damage must not read as a unit that holds a lane.

They use the ENEMY pipeline, not the tower one, because they walk a path: 8
facings and a cycle advanced by `progress` so a planted foot stays on one patch
of road. What they add is a second state the enemies have no equivalent of --
**they stop to shoot**, so `holding` selects a separate braced sheet whose
four-frame recoil runs off the recruit's own shot cooldown. A distance-driven
cycle on a unit that has stopped would freeze mid-step forever.

**THE SHOT NOW LEAVES THE BARREL.** `Soldier.fire` used a flat 16 pixels
forward, which was right for the old clockwork automaton and wrong for a tower
whose muzzle is 28 u.l. out at base and 37 from A4 -- every round appeared in
mid-air beside him. It is now `Soldier.MUZZLE_UL`, one forward distance per
rendered body, converted once from the Blender print. **This is a simulation
value**, not a presentation one: a bullet's start position is where it starts
homing from. The change is sub-frame in flight time and all four suites are
unmoved, but it is the one thing in this pass that is not purely cosmetic and
it should be read as a deliberate correction rather than a skin. The model's
small lateral offset is dropped rather than approximated -- `aim` is a screen
angle and the simulation has no ground plane to rotate a sideways offset in.
Recruits got the same correction with their own numbers.

Two presentation-only fields ride on each round: `liftUl`, which draws it at
barrel height while its real position stays on the plane it does its hit tests
on, and `shotBody`, which picks its appearance. Both are stamped once at fire
time rather than looked up from the owner, so selling or upgrading a tower
cannot change what is already in the air. **Every tier fires a different
round** -- brass tracers at base, bigger and whiter through A4 into A5's
battery, small pale rapid rounds on path B, one heavy slug at B5, and visibly
duller and smaller ones from the recruits, because 1 damage should not look
like 8. Each lands a matching `rifleman-hit` impact, emitted through the
Bullet's existing `onHit` hook so no other tower's shot gains a mark it did not
ask for.

**Two tooling changes came out of building it, and both are reusable.**
`make_preview.py --frame-riflemen` computes the smallest `ortho_scale` each
body can be rendered at without touching the tile gutter, by sweeping every
evaluated vertex through all 48 yaws and projecting through this exact camera.
The first shipped pass was hand-framed and **all seven groups clipped**; the
gutter warning is the right safety net but a terrible feedback loop at minutes
per body, and the camera is a fixed linear projection, so the answer is
arithmetic. The binding constraint is almost always the BOTTOM -- a prop at
ground radius `r` projects `0.56 * r` below the world origin and only 0.14 of a
tile sits there. `--validate-riflemen` is the other: it asserts the four accent
seats hold identical world matrices across all four animated frames, which is
the failure a still cannot show.

**One shared-file change worth knowing about.** `td_scene.py` gained public
`frustum`, `ellipsoid`, `torus` and `tube`; `tower_sniper.py` now aliases its
four private copies to them rather than keeping a second implementation.
`make_preview.py --validate-snipers` passes unchanged, which is what proves it.

**2026-08-05 — dimensional Swarm, Hive and Brute models, plus restrained live
shield variants for them and the Normal.**

Presentation only. No health, armour, shield quantity, speed, spawn rule,
lane, path, radius, hover area, hit box, bounty, timing or other simulation
value changed.

Three roster roles now explain themselves in silhouette. Swarm is a low
six-legged scavenger-tick with a connected chassis, fork feelers and recessed
red intake; its alternating tripod gait remains readable at `sizeScale .55`.
Brute is a broad breach engine with overlapping slab armour, buried head,
furnace, exhausts, huge gauntlets and a compressed planted march. Hive is a
six-legged brood foundry: armoured incubator, repeated recessed brood windows,
rear hatch and a heavy tripod walk, rather than a large recoloured counter.
All are real directional volumes built facing +X and rendered through the same
eight-row camera contract as Normal; there are no camera-facing cards.

Normal, Swarm, Brute and Hive each have an exactly aligned `*_walk_shielded`
sheet. The alternate image adds only dark-mounted ley projectors and is chosen
from the live instance's `shield > 0`; the instant the pool breaks, the clean
base body returns while `shieldFlash` finishes the transition. Added opaque
area is deliberately small: 5.57%, 5.71%, 1.83% and 2.67% respectively. The
old full circle became four separated elliptical field panels, leaving the
body readable in a crowd. A steady cyan layer remains under the gold grant
pulse so the last pulse frame cannot fade to nothing and pop back to cyan;
after a break, gold expands alone and disappears.

Walk frames remain driven by distance, but no longer borrow Normal's stride.
Evaluated planted-sole travel gives per-height cycles of Normal `.62`, Swarm
`.192`, Brute `.16` and Hive `.11`. Ground audits measured maximum planted-foot
errors of 3e-8 / 1e-8 / 2e-8 / 5e-8 and positive recovery clearance on every
frame. The public health-bar metrics use measured `contentTop`: `.8438`,
`.6875`, `.6937` and Hive's shield-safe `.5750`.

Every base/shield enemy sheet is 1024×1280 (8 facings × 8 frames of 128×160). A final
per-tile alpha audit passed all eight files. Minimum left/right/top/bottom
gutters are Normal 25/25/25/9, Swarm 9/9/50/5, Brute 12/12/49/4 and Hive
22/22/68/3, so none touches the outer-three-pixel contract. Cache version is
`ASSET_VERSION = 12`.

The first parallel render exposed a tooling race: every Blender process wrote
`assets/_tmp_frame.png`. `td_scene.render_sheet` now uses a sheet-name + PID
scratch path and removes it in `finally`, so independent model renders neither
truncate each other nor leave debris after an exception. Enemy previews now
cover all four base/shield pairs, `--enemies-only` skips the Sniper set, and
saved clean `.blend` previews hide shield-only hardware in both render and
viewport state.

One focused core test creates immediately-ready image sheets and proves all
four bodies choose base → shielded → base across a shield break, then checks
the steady field remains beneath the tail of a grant pulse. Full-suite totals
are 105/3 core, 182/30 content, 70/1 Longshot, 45/0 beam and the same two
Sandbox failures as before. The in-app browser's URL policy refused a fresh
localhost reload/inspection, so no live-browser claim is made; rendered atlas
inspection, the full-frame harness and the source/alpha audits are the visual
verification for this pass.

**2026-08-05 — B5's fourth-round punctuation, a moving ability lock, and
visually silent tower stuns.**

Three focused corrections following the final-tier model rebuild. None changes
a stat, damage formula, reload interval, projectile speed, ability duration,
stun duration, target priority or upgrade cost.

B5's guaranteed fourth round no longer asks a colour change to carry an 8k+
crit. The existing `empowered` presentation flag now selects a wholly separate
covenant-round silhouette: diamond penetrator, split violet rails, orbiting
seal fragments and forked discharge. Each enemy it physically intersects also
gets one compact, 0.46-second `arcane-empowered-hit` at the actual contact point
and barrel lift. Its entry slash, broken seal, flash, shards and grounding ring
are emitted only after the unchanged damage path resolves; the effect is never
read back by simulation. A focused test gives identical 10-damage normal and
empowered fixtures, observes zero versus one impact, and pins the impact's
target position, radius and lift.

B5's three-second ritual now stores the strongest enemy object chosen on the
button press and copies only that object's live position into the telegraph on
each channel frame. A later stronger body cannot steal it. A dead or leaked
lock leaves the last valid point behind, so an already-promised strike neither
snaps nor disappears. The resolution frame returns immediately after the
detonation; it cannot rotate or fire in the sliver between starting its
self-stun and the next central update gate.

Stun state now has one route through config adapters too:
`TowerHealth.mirror` forwards `stunTimer` beside both HP fields, so an enemy
stunning the outer tower and B5 stunning its core are the same timer seen by
the main loop. That loop already keeps every directional tower's stored aim
unchanged by skipping `update()`. Siphon was the visual exception because its
beam renderer followed live enemy objects even while simulation was skipped;
`visibleLocks()` hides those beams during stun without dropping locks or ramp,
then exposes the same locks again on wake.

Focused coverage added one core test and four content passes. Full-suite totals
are 104/3 core, 182/30 content, 70/1 Longshot, 45/0 beam and the same two
Sandbox failures as before. A live Sandbox pass caught the fourth hit by its
damage-step transition and showed the new diamond round plus contact slash at
gameplay scale; the moving ritual circle also stayed centred on its chosen
walker. The console remained clean.

**2026-08-05 — corrective visual rebuild: planted normal-enemy motion,
volumetric Sniper foundations, model-locked effects and sharper final tiers.**

Presentation only. No stat, price, range, timing, hit box, footprint, target,
projectile path, damage rule or other simulation value changed.

The shared render contract is explicit now. `td_scene.py` raises the camera by
`0.36` of its orthographic frame, placing Blender world origin at `0.86` of a
tile's height. Runtime sprites align that invariant projected origin, not a
changing lowest-alpha pixel; a foreground swing foot can project below the
planted foot in this camera. `report_content_box` now audits every individual
direction/frame tile against an outer three-pixel gutter, because aggregate
bounds hid one-pose clipping. `render_sheet` can page directions horizontally
while preserving one PNG and the same runtime row mapping. A5 uses 512 px
source tiles and B5 384 px, with their 48 facings arranged as three 16-row
pages so final-tier art stays native at the canvas's maximum 3x backing scale.

`enemy_normal.py` rebuilt the normal carrier's visual hierarchy: its core and
side/rear inspection windows are recessed inside larger dark housings and
solid cage bars, rather than protruding as glowing cards. The gait uses even
fore/aft samples and plants one support sole at z=0 in every frame while the
other clears the floor. `draw-pack.js` aligns the fixed 0.86 pivot and adds a
small contact-occlusion ellipse between the support point and the existing
directional cast shadow, removing the gap that made the enemy look airborne.

`tower_sniper.py` replaces card-like structure with readable volume: jointed
limbs and weapon anatomy below the final tiers; B3/B4 offering motion confined
to the upper body so their boots stay planted; B4's cathedral split into a
grounded, reload-independent fixture with tapered posts; and map-fixed A5/B5
foundations that counter-yaw beneath the aiming body. B5's four restraints are
closed faceted obelisks with stepped feet, alternating tapered faces, ribs,
caged cores, pointed crowns and inboard clevises. Two joined solid chain
segments connect each clevis to the captive instead of stopping nearby. A5's
three engineered pylons received the same faceted/caged depth language.

The custom Sniper body bypasses the fallback body's platform, so its renderer
now paints a flat faction pad and directional cast shadow before a decoded
sprite; this grounds every group without changing the gameplay footprint or
moving Blender's origin. Procedural charge, rapture and B5 ritual light no
longer follows continuous aim or percentages of a generic barrel. A table of
per-group Blender-local anchors names the real muzzles, A3/A4 coils, A5
collars/rune, B3/B4 chambers and fissures, and B5 face glare. Their projection
repeats the sprite sheet's ground-unsquash and 48-row snap, so effects and the
rendered hardware use the same visible axes.

A flattened-layer limitation is recorded rather than hidden: A4+B2 has accent
geometry both behind and around opaque A4 parts. A restrained partial redraw
of the A4 body restores foreground teal after the magenta overlay, but exact
per-pixel depth would require a third Blender-authored holdout/depth mask. Do
not generalise that special-case hierarchy correction to other crosspaths.

The final walk and Sniper runtime sheets were regenerated and the cache key is
now `ASSET_VERSION = 11`. Measured `contentTop` is normal `.8438`; Sniper base
`.7695`, A3 `.7539`, A4 `.5547`, A5 `.5625`, B3 `.7383`, B4 `.6406` and B5
`.5938`. The per-tile audit reported zero outer-three-pixel edge hits across
the normal walk and all Sniper runtime sheets. A forced-row image harness also
sampled all 48 A5 and B5 facings: every source rectangle stayed in bounds and
each of the three atlas pages covered local rows 0–15 exactly once.
Twelve-heading actual-game-size contact sheets verified that both final-tier
foundations stay fixed while their weapon rigs turn. Live local-page reload
was blocked by the in-app browser's URL policy on the final pass, so no browser
claim is made here.

All five suites remain at the documented checkout baseline: 103/3 core,
178/30 content, 70/1 Longshot, 45/0 beam and two Sandbox failures. Twenty-eight
obsolete/automatic preview outputs (`sniper_a0`, the old `*_over_a0` sheets and
Blender `.blend1` backups) were removed; all are generated artifacts and can be
recreated from the authoritative scripts.

**2026-08-04 — readable normal-enemy and complete Arcane-Sniper models, plus
adaptive native-resolution rendering with no gameplay change.**

Presentation only. No stat, price, path, range, timing, footprint, collision,
hit radius, muzzle position or logical coordinate changed.

The authoritative Blender sources were cleaned at the silhouette scale the
game actually displays. `enemy_normal.py` now has a broader connected torso,
larger head/lens, sturdier articulated limbs and red core/cargo windows visible
from every one of its eight facings. `tower_sniper.py` enlarges the A1/A2/B1/B2
tier marks, locks overlays to both reload rigs, clarifies A3 through B5, and
removes A5's misleading baked stack rings. Twenty sheets now cover all 27 legal
Sniper builds; A5's five tally rings are drawn from the live stack tracker.
`make_preview.py` also covers B5. Four-angle previews, inspectable `.blend`
outputs, the normal walk/death sheets and every Sniper body/overlay sheet were
regenerated with Blender 4.4.3. `ASSET_VERSION` is 9.

Rendered bodies get a restrained cool separation rim. The normal enemy also
recovers the built-in renderer's visible hit flash and slow-state tint through
optional, save/restored sprite `filter`/shadow styling in `visual-models.js`.
These fields are documented in `MODEL_SKINS_GUIDE.md`; unsupported canvas
filters simply fall back to the rim. The death sheet remains generated but is
still intentionally not wired into runtime timing.

`resizeCanvasBackingStore()` now follows the canvas's displayed CSS size times
device pixel ratio, using one uniform scale clamped from the original 1280×720
floor through native 4K (3840×2160). All draw, world, UI and input coordinates
remain 1280×720. Resize restores the context after either backing dimension
changes, and Sandbox CSS no longer lets intrinsic backing dimensions control
layout. Browser checks measured 1920×1080 and 3840×2160 backing stores, clean
console output, and readable live B5/enemy models.

All five suites were run before and after. Both sides measured 103/3 core,
178/30 content, 70/1 Longshot, 45/0 beam, and two Sandbox failures. The failure
groups are the checkout's existing B5/timing and stale fixture drift; this pass
added none.

**2026-08-03 — the first rendered art: a Blender sprite pipeline, animated
directional sprite sheets, and a canvas that actually fills the window.**

Presentation only. No rule, stat, distance, reward or hit box moved, and the
game is byte-for-byte the same simulation with `js/skins/draw-pack.js`
deleted.

**A 3D-to-sprite pipeline in `tools/blender/`.** `td_scene.py` is an offline
art tool — it is never loaded by the game, adds no build step, and the game
still opens by double-clicking `index.html`. Its camera is *derived from this
codebase, not chosen*: `Visuals3Q.GROUND_SQUASH` of 0.56 fixes the camera
elevation at `asin(0.56)` = 34.06°, `LIGHT_X/LIGHT_Y` fix the key light at
upper-left, and the `(reach, reach × 0.7)` shadow offset with its `0.32`
per-unit-lift term fixes the sun elevation at 68°. Orthographic, because the
game maps world to screen linearly and a perspective render would disagree at
the board edges. Set once, so a model rendered a year from now still matches
the ellipses `Visuals3Q` draws around it. `enemy_normal.py` is the first
model, built from primitives — at `Enemy.RADIUS_PX` = 11 a sculpted mesh and a
stretched cube are the same handful of pixels, so the effort belongs in the
silhouette. Four things bit hard enough to be worth naming: Blender's default
AgX view transform destroys a specified palette (use Standard); `metallic`
above ~0.2 renders black without an environment to reflect; parenting via
`matrix_parent_inverse` reads a stale `matrix_world` in a build script and
tears animated limbs off; and the camera must rise `0.36` of its frame along
its own up-axis. That projects world origin to `0.86` of tile height, leaves
ground margin for feet and shrine anchors, and avoids the decapitation caused
by aiming the camera straight at z = 0.

**`VisualModels.registerSpriteSheet`.** A sibling to `registerSprite` for
animated, directional skins: one PNG, normally one row per facing and one
column per frame. `directionRows` may page a taller direction set horizontally;
page `d / directionRows` owns another block of frame columns while row
`d % directionRows` stays inside the declared height. This is how the 48-way
A5/B5 sheets fit in three 16-row bands without changing their visible rows.
22 enemy types × 8 directions × 8 frames is 1408 files as loose frames and 44
as sheets. Row choice undoes the ground squash before taking an angle — a 45°
screen heading is a 61° world one, and skipping that picks the wrong row on
every diagonal. The registry still holds no per-subject state, so a one-shot
animation needs a caller-supplied `frame` function.

**Assets are loose PNGs, which bends "everything is drawn procedurally".**
That constraint's own note anticipated this ("probably inline SVG or base64
data URIs"). `fetch` and XHR genuinely are blocked over `file://`; an
`Image()` src is not, and the game was verified loading and animating sheets
from a bare folder with no server. Nothing reads pixels back, so canvas
tainting is moot — there is no `toDataURL` or `getImageData` anywhere. The
release form is the same sheets base64-encoded into a `.js` file, which needs
no code change because `source` is passed straight to `Image()`. **This is the
owner's constraint and his to settle.**

**The canvas fills the window.** It was `max-width/max-height: 100%`, which
can only ever *shrink* an element below its intrinsic size — so on any display
wider than 1280 the game sat at 1280×720 in dead space. Now sized to the
letterboxed box with `min()`. The element is sized rather than `object-fit`
used, deliberately: `toCanvasPos` divides by `getBoundingClientRect().width`,
and letterboxing inside a larger element would put every click off by the
bar's height. `UNIT_LENGTH` is untouched, so the world is still 1280×720 and
every distance is still u.l.

**Health bars follow the art, via a measurements registry.** The bar hung at
`bodyY - radius - 12`, which is the crown of the *built-in* circle — with a
sprite four times that tall it sat in the creature's chest. `VisualModels` now
carries per-model measurements beside the renderers (`registerMetric` /
`metric`), a sprite sheet publishes its own `topY`, and `Enemy.draw` asks for
it with the old expression as the fallback. Measurements only: the hit box,
the claim distance and the hover ring still come from `radiusPx`, which is the
entire reason those are separate numbers. The `contentTop` fraction it needs
is **measured, not computed** — `render_sheet` prints it from the rendered
alpha, because animation moves the model after the geometry is authored and
every figure derived from `ortho_scale` and body height was wrong.

**Rendering at display resolution.** With the canvas stretched to fill the
window, a 1280-wide backing store on a 2560-wide display was being doubled and
everything went soft. The backing store now follows the element's CSS size
times `devicePixelRatio`, with one uniform total scale clamped from 1× through
3× (1280×720 through native 4K). Capping the total scale, rather than DPR
alone, also bounds a DPR-1 5K or 8K display. Every drawing call still uses the
same 1280×720 logical world. Input is unchanged because `toCanvasPos` divides
by `getBoundingClientRect()` in CSS pixels. Assigning either canvas dimension
resets the 2D context, so `resizeCanvasBackingStore()` restores its transform
and smoothing after the final assignment; it runs in `init()` and on window
resize. The sandbox canvas has an explicit 16:9 CSS size so its enlarged
intrinsic backing store can never drive layout.

**The sniper is rendered as LAYERS, because 27 towers is not a thing.**
`crosspath.js` caps the other path at 2 once either reaches 3, which still
leaves 27 legal (A, B) combinations — and it would multiply again at A4, which
is player-aimed (`aimRad`) and needs 48 yaw steps. The two paths were designed
never to touch the same part of the model: the graft takes eye, arm, spine and
legs; the rapture occupies skin, coat, free hand and the air. So a tower is a
BODY sheet plus an OVERLAY sheet, and 20 reusable sheets cover all 27 states.
`draw-pack.js` reads `tower.core.purchased` and composites. One asymmetry
worth knowing: B3–B5 change the body itself (he offers, floats, burns), so
those will be rendered as bodies with A1/A2 as overlays instead — legal
precisely because crosspath guarantees A ≤ 2 whenever B ≥ 3. That inversion is
why the compositor chooses which sheet is the body rather than assuming.

The tree is complete. A3/A4 have body sheets plus B1/B2 overlays; A5 is a
one-piece machine body; B3/B4 have animated bodies plus A1/A2 overlays; and B5
is a one-piece rapture body. A5's five stack rings are deliberately drawn live
from `killStacks` instead of baked into the PNG, so the art never claims stacks
the tower has not earned. None of this feeds a rule or hit box.

**The walk is driven by distance, not by a clock.** A fixed-rate loop plays at
its own speed whatever the enemy is doing, so the feet and the ground disagree
and the body looks like a sticker being dragged along the road. Advancing the
cycle by `enemy.progress` ties them together, and every speed case then comes
out right for nothing: a `fast` covers ground quicker so its legs move
quicker, a slowed enemy's legs drag, a stopped one stops mid-step. The stride
constant follows from the model's hip height and swing angle, but the honest
test is whether the feet skate on screen, so it is tuned in `draw-pack.js`
rather than derived anywhere. The authored samples now sweep the support sole
back in even increments, pin one support foot to z=0 in every frame and lift
the recovery foot. Runtime grounding uses the camera's invariant 0.86 world
pivot instead of chasing the visually lowest foot, and a small contact ellipse
joins that point to the existing cast shadow.

**The sniper turns to face its target, in 48 steps.** `LongshotTower.update`
already wrote `this.aim` every time it picked a target, so the facing cost
nothing but sprites to point with; `core.aimRad` wins once A4 grants
`coneShape`, because that one is the player's decision rather than a
consequence. The worst mismatch between a snapped row and the desired angle is
3.75° at 48 facings; below about four degrees the long barrel stops reading as
a snapping cut-out. The procedural effects repeat this exact row snap.

**The generic Blender bodies contain no baked base; the custom renderer owns
one ground pad.** The first model included a stone plinth while the fallback
Longshot body also painted `Visuals3Q.platform`, producing a doubled platform.
Removing both was wrong in the other direction: a successful custom `:body`
return skips the fallback branch entirely, so the rendered actor hovered over
an unmarked map coordinate. `drawSniperGround` now paints one flat faction pad
and the shared down-right shadow before the decoded body. It does not move the
Blender origin or change the gameplay footprint. A5 and B5 additionally carry
authored map-fixed foundations as part of their silhouettes; those are siege
hardware on top of the one runtime ground contract, not a second generic pad.

**Render quality.** Three changes, in order of how much they mattered: every
box is bevelled (a cube lit by a directional key has three flat faces and no
edge highlight at all, which is most of what makes primitive-built models read
as programmer art); tiles are supersampled 2× and averaged down, with colour
premultiplied by alpha before averaging or every edge picks up a dark fringe
from the transparent pixels' black; and ambient occlusion is on, without which
every crevice is lit as brightly as the faces around it. The renderer also
audits the outer three pixels of every facing/frame tile independently; one
clipped pose can hide inside a plausible aggregate content box.

**`sandbox.html` loads the art pack too**, so the sandbox is checking the
models the player actually sees rather than the built-in bodies.

**The caster holds his rifle.** The first pose put a rod in world space near a
figure who was not gripping it — it read as a man being skewered by a stick.
The weapon now hangs off a `shoulder` empty with both hands on it, his eye
behind the scope, a braced stance and a bipod, so the hold cannot drift. The
hat came down from wider-than-his-shoulders to a modest brim; it had been
sized to carry the silhouette at 20 px and had overcorrected into a mushroom.

**Tiers 1 and 2 are colour, not geometry.** A1/A2/B1/B2 change nothing about
the model. The body renders once and each tier is a thin emissive ACCENT layer
composited over it — six sheets total. The accents keep the same mounting rule
the later tiers use: the graft lights the TOP of the weapon (scope, rail), the
rapture lights the UNDERSIDE (the groove along the barrel), so an A2 B2 shows
both colours and neither lands on the other's metal.

**The shot leaves the end of the barrel.** It used to be born 1 u.l. from the
tower's centre, which with a rifle this long is inside his coat.
`projectile.muzzleOffsetUl` (36) lives in the tower CONFIG rather than the art
pack, because the simulation needs it and simulation never reads back from the
presentation registry. **It does not extend reach**: the adapter subtracts the
same distance from `maxTravelPx`, so the far end of a shot is exactly where it
always was — starting 36 u.l. closer and travelling 36 u.l. less is the same
line, and `range-filter.js` still measures targeting from the tower's centre.
If the rifle is re-modelled, `tower_sniper.py` prints `MUZZLE_WORLD`; that is
the number to bring back to the config.

The bolt is drawn LIFTED to barrel height while its real position stays on the
ground — the same split the engine already uses for enemies, where `pos` is
the feet and `visualBodyY` is where the body is painted. The bullet must stay
on the flat plane it does its hit tests on; only the picture rises.
`PierceBullet` gained a `tint` field so the shot and its impact can carry the
path's colour. Cosmetic only: nothing in `update()`, `currentDamage()`, the
claim or the hit test reads it, and an untinted shot behaves identically.

**A3, A4 and the four crosspaths.** A3 is the first real graft: the forward
arm is gone, twin rails run from the shoulder socket into the handguard with
an arc between them, a three-stage coil stack is bolted up his spine, and a
clamp holds his skull still because the rig decides how he stands now. A4
takes the legs — what is left of him is socketed into a gimbal yoke and the
weapon is a rail cannon lying flat on the mount, his head still up at the
breech. Both bake their teal into the body, so there is no separate A accent
above tier 2; by then the graft *is* the model.

`crosspath.lockThreshold` is 3, so buying A3 caps B at 2 forever and the only
crosspaths these two reach are A3B1, A3B2, A4B1 and A4B2. Path B lights a
groove under the barrel, and that groove is somewhere completely different on
a coil rifle or a rail cannon than on the original weapon — so each body
carries its own B accents rather than sharing one sheet. On A4 there is no
forearm left to carve, so the rapture takes the mount instead.

**Sheet groups, and why the camera moves per tier.** A body and the accents
over it must share a camera or they will not line up — but the A0–A2 rifle
already ran off the edge of the old tile and a rail cannon would not have
fitted at all. Each group now renders at its own `ortho_scale` (the world
height one tile spans) and `draw-pack.js` draws it at a size proportional to
that same number, via one shared `PX_PER_WORLD`. That is what keeps the man
the same size on screen at A3 as he was at A2 even though his tile covers more
world. Change `PX_PER_WORLD` and every tier rescales together, which is the
only way this stays consistent. Ordinary groups use 256 px source tiles; A5
uses 512 and B5 384 so their larger final silhouettes survive a 3x canvas
backing without enlargement. Those two page 48 facings into three horizontal
blocks of 16 direction rows. All body/accent placement uses the shared 0.86
projected-world-origin pivot, never unrelated alpha bottoms.

`projectile.muzzleOffsetUlByGraft` follows the same fact: the weapon gets
longer as it grafts, so the muzzle moves (36 → 48 → 54 u.l.). Still taken
straight back off `maxTravelPx`, so reach is unchanged at every tier.

**A5 — the Meridian Lance, and nothing left of him.** A4 still had his head at
the breech; A5 is what the rig finishes, which was the owner's call and it
changes what the model has to do. With no figure to read against, the only
thing carrying the tier is scale and menace: a braced siege mount on three
faceted, caged anchor pylons, a lance floating free inside six magnetic
collars, and an aperture the size of the old man's whole body. The foundation
counter-yaws under the aiming carriage, so its ring and pylons stay bolted to
the same map-facing positions instead of orbiting with every direction row.
The breech block deliberately echoes A4's torso socket — same collar, same
proportions, nobody inside. The tally spar is the kill-stack counter, and the
one part of the model that moves with the fight.

**A5 has no crosspath variant**, by the owner's decision: there is nothing
human left for the rapture to mark, so it looks the same whatever B did. One
sheet, and `draw-pack.js` skips the B accent entirely at that tier.

**A4 and A5 fire a lance, not a bolt.** From A4 the weapon is a rail cannon
and the shot is drawn as a tapered beam whose width tracks what it still hits
for — wide where it started, narrow at the head, in proportion to
`currentDamage() / baseDamage`. That makes pierce falloff (js/systems/pierce.js)
visible: a player can watch a shot run out of power through a crowd without
reading a number. Drawn as a quad rather than a stroke, because a stroke
cannot change width along its length. `PierceBullet.style` carries it and is
cosmetic in exactly the way `tint` is.

**B3, B4 and their four crosspaths — the rapture is the mirror of the graft.**
Where path A bolts the enemy's hardware onto him, path B bolts nothing on: it
is cloth, bone, chain and things burning that should not be. B3 (Communion)
loses the hat, wears a mantle, carries a bone censer on a chain and a
four-chamber cylinder of rune slugs, and the forward hand is cut open —
that is how the cylinder gets loaded. B4 (Cathedral) grows the mantle into a
housing: an arch standing over him with a rune window, a bell on a bracket,
and a barrel of carved bone split by molten violet. B3/B4's body hierarchy is
volumetric and jointed rather than built from broad cards. Their offering
reload now moves the head, hand and cylinder inside the upper-body rig while
the boots remain planted. B4's cathedral lives directly under the aim root,
separate from the organic reload: its splayed feet, tapered faceted posts,
capitals, projecting ribs and bell stay fixed through all four frames.

The layering rule inverts cleanly. Whichever path went past tier 2 bakes its
colour into the body and the OTHER path becomes the overlay — so A3–A5 carry
teal with B1/B2 painted on, and B3/B4 carry violet with A1/A2 painted on.
`crosspath.lockThreshold` of 3 guarantees the two branches can never both be
taken, which is what lets one group name identify a body. The four crosspaths
here are A1B3, A2B3, A1B4, A2B4. A4+B2 is the one flattened-layer depth
holdout: its magenta geometry crosses both behind and around opaque A4 parts,
so the compositor redraws the A4 body at restrained opacity after the accent.
That restores the foreground teal read but cannot be exact without a separate
Blender-authored depth/holdout mask.

**A camera: zoom and pan, and it is presentation only.** The world is still
exactly 1280×720 of flat coordinates and every distance is still u.l. — this
only decides which part of it the canvas looks at. `update()`, targeting,
placement and pathing do not know it exists, and at zoom 1 with no pan the
transform is the identity, so a run that never touches it behaves exactly as
before.

It goes INSIDE the world save/restore that already existed for the
earthquake, so the HUD is untouched and the shake composes on top (a kick at
3× zoom moves 3× as far on screen, which is right — it is a camera kick, not
a screen effect).

**TWO COORDINATE SPACES, AND THIS IS THE WHOLE RISK IN IT.** `mouse` stays
SCREEN space, because nearly all of its readers are interface hover tests and
they were all correct already; `worldMouse` is the same cursor through the
camera and only the handful of map readers use it (`enemyAt`, `recruitAt`,
`whyCannotBuild`, the cone-aim angle, and the build/aim previews — which are
drawn inside the world layer and so must emit world coordinates while their
GUARDS stay screen). In `onClick` the seam is marked explicitly: everything
above it is chrome reading `p`, everything below is map reading `w`. Crossing
that line in either direction is the bug this change could most easily
introduce.

Controls: wheel zooms about the CURSOR (anchoring to the cursor rather than
the centre is the difference between zooming in on what you are looking at
and having to chase it), middle-drag pans, WASD/arrows pan, `+`/`-` zoom,
`0` resets. Pan keys are tracked as a held set and integrated per frame
rather than acted on per keydown — a key repeat rate belongs to the operating
system and panning at it arrives as a stutter with a pause at the front. Pan
speed is divided by zoom so the map moves at a constant rate ON SCREEN;
without that, panning at 4× flies across the board exactly when the player is
looking closely. The camera integrates on REAL elapsed time outside the
fixed-step loop and unscaled by `gameSpeed`, so it feels identical at 1× and
3× and keeps working while paused.

Zoom floor is 1: the map is authored to fill the canvas, so zooming out only
adds empty bars. `clampCamera` keeps the view inside the board, which at zoom
1 pins it dead centre — that is what makes "never zoomed" identical to "no
camera at all".

**The shot was not leaving the barrel, and the reason was foreshortening.**
The muzzle offset is the barrel's length in the WORLD, but the board is drawn
obliquely — a barrel pointing up or down the screen projects to
GROUND_SQUASH (0.56) of its length while one pointing sideways does not. A
fixed distance along the aim therefore hit the muzzle only when the tower
fired east or west, and landed up to 44 % past it firing north or south. It
got worse the longer the weapon grew, which is why it showed up once A5 and
B4 existed. `LongshotTower.muzzleOffsetPx` divides by
`hypot(cos a, sin a / squash)`, which is 1 sideways and 1/squash vertically.
Verified ×1.00 / ×1.45 / ×1.79 at 0°, 45°, 90°.

The second half was the barrel HEIGHT: one constant for every tier ran A4's
beam through its own mount. It is per-tier now (`muzzleHeightUlByGraft`: 33
shouldered, 19 on A4's yoke, 24 on A5's lance) and rides on the shot as
`liftUl`. Presentation only — the shot's real position stays on the flat
plane it does its hit tests on.

**B5 — Rapture, and deliberately A5's opposite.** A5 finished the job and
what is left is a machine. B5 does not remove him at all, and that is the
horror: feet off the ground, four arms, the face gone inside its own glare,
the coat frayed into tatters rather than hemmed, and one arm charred through
at the elbow — that is where the permanent max-hp loss went. The four
restraints are not holding him up. They are chains: closed octagonal obelisks
with stepped feet, alternating tapered faces, brass ribs, caged cores, pointed
crowns and inboard clevises. Two joined solid segments run from each real axle
to the floating body. The entire shrine foundation counter-yaws beneath the
aiming captive, so it remains fixed to the map instead of turning like four
flat cards when the weapon tracks.

**The ability is a three-second ritual now, and the stun dropped to 7.** At
the owner's request, and it changes what the ability IS: it was an instant
button and it is now a commitment. `performAction("ability")` only ARMS it —
the strongest enemy at that moment becomes the locked target, and the ground
circle follows that SAME enemy throughout the ritual. It never retargets to a
later or stronger arrival. If the locked enemy dies or leaks, the ritual holds
its last valid position and still resolves there. The tower cannot fire while
channelling, and `resolveChannel` pays the cost — stun and permanent max-hp —
on RESOLUTION rather than on the press, so a channel is not yet a wound.

Total lockout is unchanged at 10 s. What moved is when it is paid: three
seconds of visible ritual you can watch, then seven of exhaustion, instead of
ten flat afterwards.

Drawn as circles ON THE GROUND at the locked target from the first frame —
proper ellipses squashed by GROUND_SQUASH, because they lie on the board rather
than face the camera, and getting that wrong is the single most common way a
magic circle reads as a sticker. The circle and its descending column move
with the original target, while a ring closes IN on the caster. `b5-strike` is
emitted by resolveChannel at the instant the damage lands, so what the player
sees and what the simulation did are one event rather than two that agree.

**The fourth shot is a path B mechanic, not A5's.** `guaranteedReloadShotCrit`
is B5, and A5 can never hold it — buying A5 caps B at 2. It is drawn as a
separate covenant round — diamond penetrator, split violet rails, orbiting
seal fragments and forked discharge — rather than as a larger ordinary bolt.
Every actual empowered collision emits one compact, presentation-only
`arcane-empowered-hit`: a directional entry slash at barrel height, broken
seal, white body flash, shards and a grounding ring. It stays violet even on a
teal crosspath because the crit comes from the covenant, not from the rig.
Neither the projectile skin nor the impact is read by damage, reload or timing.
A5's own lance went from 1.85× to 2.6×, because at 1.85 the tier that costs
13 900 and takes the man's whole body looked like a slightly thicker A4.

**The rapture does not charge, and it does not reload. It pays.** Both of
these were wrong on the first pass and the owner caught them together.

The first was a straight BUG: `drawCharge` only skipped the base group, so a
B3 or B4 tower — which can only carry A0–A2 — was being handed path A's teal
coil stages and muzzle bloom. A violet, cloth-and-bone tower was winding up
like a rail gun. Path B now routes to `drawRapture` and never reaches A's
code at all.

The second was a design failure that the bug was hiding. B3/B4's reload
originally tipped the weapon up and spun the cylinder — a bolt cycle with
extra steps, which is path A's motion wearing path B's clothes. The whole
point of the rapture is that nothing about it is mechanical: he does not
service a weapon, he gives it something. The four frames are an upper-body
offering now — his boots remain planted while the head bows, the opened hand
crosses the breech, the cylinder turns because HE turns it, and he withdraws
without fully recovering inside the beat. The `figure` empty is an explicit
animation boundary, but its ground-contact transform is keyed unchanged; the
forward arm has its own pivot so it can leave the handguard. B4's cathedral is
outside that boundary, so its posts and bell never inherit the organic pose.

The charge is a different IDEA, not a recolour. The graft spins up: stage
after stage, hardware accumulating. The rapture has no hardware, so nothing
accumulates — what builds is pressure inside a man. Light gathers at the
wound in his hand and in the chambers, sigils lift off him and fade upward
(rising and escaping, where A's lightning arcs between fixed points because
it is conducting), B4's bone fissures pour rather than glow, and at the top it
leaves the muzzle as a bloom — let go rather than aimed. Squared ramp instead
of cubed, so it swells instead of snapping.

The general rule this leaves behind: when the two paths need the same KIND of
feedback, that is the moment to check they are not being given the same
MOTION. Same information, opposite bodies.

**The reload runs on a different clock from every other animation.** From B3
the tower fires four shots and stops for a beat, and `js/systems/reload.js`
makes that beat deliberately independent of fire rate. So B3/B4's frames are
driven by the `ReloadTracker`'s own timer rather than by the firing cycle
everything else uses: buy attack speed and the four shots rattle off faster
while the pause stays exactly as long, and the animation says so.

Shots-remaining is drawn as **pips**, procedurally, read straight off the live
tracker so it cannot disagree with the simulation — plus a bar counting the
beat out while reloading, without which the tower just stops and reads as
broken rather than busy. Pips rather than modelled chambers because the count
changes every shot: baking four states into the sheet would multiply an axis
already 48 facings deep, and pips read at 50 px where a turned chamber does
not.

**Health bars came off the sprites and moved into the hover panel.** Every
enemy used to wear a bar permanently. At one or two bodies that is fine; at
swarm density — thirty specks at 0.55 scale, each with a 26 px MINIMUM-width
bar over it — the bars overlap into a solid ribbon and the only thing on
screen is the bars, not the enemies they belong to. The information is rarely
wanted in bulk either: a player reads one enemy's health while deciding about
that enemy, not thirty at once.

So `Enemy.draw` now takes `showBars` as an OPT-IN (with `hideBars` still
winning over it, so no existing caller is surprised) and the live render loop
passes neither. The readout lives in `drawEnemyHover`, where the figure and
the bar are ONE panel sharing a border rather than a floating label plus a bar
pinned to the sprite's crown — reading an enemy used to mean looking at two
places and pairing them mentally. Shields keep a second bar in the same panel,
for the same reason they keep a separate figure in the label: two pools that
empty in sequence read wrongly as one.

Bosses are unaffected — they already have their own bar across the top of the
screen, which is the right place for the one enemy the whole board is about.

**Animation, and the one number that drives all of it.** Every tier's
animation is indexed off how far through its firing cycle the tower is —
`fireCooldown` counted against `effectiveFireRate()` — rather than off a
clock. That makes animation speed dynamic with attack speed by construction,
with no constant to keep in step, and it picks up A5's kill stacks for free
because those are a live multiplier on the rate: a tower mid-massacre visibly
winds up faster.

*A0–A2 and B1–B2* share a four-frame bolt cycle baked into the body sheet
(rest → recoil/bolt lifting → bolt fully back → driven home). It occupies the
first 55% of the cycle and holds the aimed pose for the rest; a rifle still
cycling when it fires reads wrong. **Only the bolt, rear arm and a little
shoulder kick are keyed** — the barrel, scope and forward hand deliberately
hold still, because the emissive accent sheets are one frame composited over
every frame of the body, so anything they sit on must not move or the glow
slides off its metal. Four frames of a whole body would also have cost 4× a
sheet that is already 48 facings deep.

*A3, A4 and A5 charge instead*, and that is drawn **procedurally in canvas,
not baked**. Two reasons: lightning and a turning rune circle want to be
continuous and different every frame, which a short loop cannot be; and
frames multiply the facing axis, which is the expensive one. A3 lights its
coil stages in sequence with a muzzle bloom; A4 adds arcs that grow in number
rather than just brightness; A5 adds a rune circle that opens around the
barrel, turns, and flares at the top of the cycle. The charge is biased late
(cubed) — a linear ramp reads as a lamp on a dimmer rather than as something
building to a release.

The charge is positioned from authored model points, not from a generic
`muzzleOffsetUlByGraft` percentage. `SNIPER_EFFECT_ANCHORS` names each group's
real muzzle plus A3/A4 coil cylinders, A5 collars and rune, B3/B4 chambers and
fissures, and B5's face glare. `sniperSpriteBasis` repeats the sprite loader's
ground-unsquash and 48-row rounding before those Blender-local
`[forward, side, height]` points are projected. The picture and the canvas
effect therefore share the exact visible axes; continuous `tower.aim` no
longer leaves the glow up to 3.75° off the hardware.

**The fast shot tunnelled, and the swept test is the fix.** `PierceBullet`
moved its full step and then tested a circle around where it LANDED. That is
correct only while a tick's travel is small next to a body: at 562.5 u.l./s a
step is ~10 px and nothing is missed. The moment path A's rail tiers took the
speed to 14 000 a step became ~243 px, and the shot teleported clean over
22 px-wide enemies without ever testing them — it hit almost nothing, which
looked like the beam "not colliding". It now tests the whole SEGMENT travelled
this tick, which is what a straight-line shot always meant, and it is strictly
more correct at the old speed too (a fast enemy crossing between two samples
could previously slip through). Verified: a 243 px/tick shot through six
enemies spaced 40 px apart hits all six.

Hits are also applied IN ORDER ALONG THE SEGMENT now, not in array order.
Array order is spawn order, which is meaningless here — and over a long sweep
the falloff would otherwise charge the far body full damage and the near one
the remainder, which is backwards.

**A beam has to outlive its projectile.** Near-instant shots cross the board
in about seven frames, so the firing registered as a flash and read as a bug.
`PierceBullet.leaveRemnant` emits one `lance-remnant` effect ON DEATH — the
only moment the whole line is known, since where it stopped depends on how
much pierce survived the crowd — and it fades over about a fifth of a second.
Shots below A4 have no `style` and emit nothing.

`Effects.aoeImpact` grew an optional `extra` argument for this: not every mark
is a circle, and a beam needs a second endpoint that x/y/radius cannot
express. Two reserved keys, `life` and `particles: false` (a clean energy beam
should not throw debris).

**Smooth turning is not available from pre-rendered sprites** — that is the
one real cost of this pipeline, and worth stating plainly rather than working
around badly. A sprite is a picture from a fixed angle, so facing is always
quantised; the only lever is how fine. Worst-case error is 180/N degrees:
11.25 at 16, 7.5 at 24, **3.75 at 48**, 2.8 at 64. Below about four degrees it
stops reading as snapping, so 48 is where this landed; 64 costs a third more
memory for a difference nobody can point at. Rotating the sprite by the
leftover angle in canvas was considered and rejected: rotating a
three-quarter view in screen space tilts the man's vertical axis, so he leans.
It would be fine for A4 and A5, which are near-horizontal machines, and wrong
for every tier below them — a rule that applies to half the tiers is worse
than a bigger sheet. Sheets stay lazy (`registerSpriteSheet` does not create
its Image until the layer is first drawn), so a run only pays for tiers it
actually builds.

**A laser does not fly.** `projectile.speedUlpsByGraft` raises the shot from
562.5 u.l./s to 6 000 at A4 and 14 000 at A5. For scale: A5's range is 1500
u.l., which at the base speed is 2.7 SECONDS in the air — long enough to watch
it cross the board, which is not what a beam does. At 14 000 it is 0.107 s.
**This is a balance change, not only a visual one**: a shot that lands sooner
is one a fast enemy has less chance to walk out of. `predictedPosition` reads
the same number through `shotSpeedUlps()`, so lead and flight cannot drift
apart — with the old hardcoded `Bullet.BASE_SPEED_ULPS` the tower would have
aimed for a slow shot and fired a fast one, missing ahead of everything.

**The beam dims rather than narrows.** The first version showed pierce falloff
by tapering the beam toward the head, and it read as a long triangle — a cone,
which is a different weapon entirely. A laser's defining property is that it
does not converge. Width is now constant and the drain is carried by
brightness: a gradient from full intensity at the muzzle to whatever fraction
of the damage survives at the head. Same information, still a straight line. A
gradient rather than discrete steps because the shot knows how much damage is
left but not WHERE along the line each enemy took its bite.

**The build/Index icon is the model.** The old one was three violet strokes
standing in for a tower nobody had drawn; an icon that does not match what it
buys is a small lie the player has to unlearn. It cannot go through
`registerSpriteSheet` — the icon subject is `{cx, cy, size, type}`, with no
position, footprint or purchased tier — so it loads the body and tier-0 accent
by URL (cache serves them; it costs a decode, not a fetch) and blits row 0.
`ICON_FILL` is deliberately generous because the tile is sized to fit the
RIFLE, which sticks out sideways, so the man is only about half the tile wide.

**A cone tower still tracks, inside its arc.** Pointing A4 flat at `aimRad`
made it look switched off — it fires at things all over its cone and
acknowledged none of them. The player's chosen direction is the CENTRE of what
it covers, not the only thing it may look at, so the facing follows the
current target and is clamped to the edge of the arc instead of snapping back.

**48 facings, not 16 or 24.** The gap between facings shows up as the barrel
and shot disagreeing about where "forward" is; worst error is 11.25° at 16,
7.5° at 24 and 3.75° at 48. The final value is the first one below the roughly
four-degree threshold where this long weapon stops reading as a snap. Ordinary
256 px sheets keep 48 direction rows. A5's 512 px and B5's 384 px tiles would
make impractically tall images in that layout, so each uses three horizontal
atlas pages of 16 rows. A state that fails to draw immediately after a reload
may still be decoding; the loader remains lazy.

WATCH OUT WHEN TESTING: the browser serves stale `<script src>` files hard.
A run that shows old behaviour after an edit is usually cache, not code —
hard-refresh before believing a failure.

**`ASSET_VERSION` at the top of `draw-pack.js` — bump it whenever a sheet is
re-rendered.** A cached sheet is not merely stale, it is the WRONG SHAPE: when
the body sheet went from one frame to four its width went 256 → 1024, and the
cached 256-wide image made every frame past the first read off the end of it
and draw nothing. That looks exactly like a broken animation and is not — it
is last week's file. It cost two false diagnoses before the version query went
in. There is no server here to set cache headers, so the query string is the
whole mechanism.

NOT VERIFIED: `tests/run.js` was not run — no Node on the machine this was
done on. The changes are presentation-only *except* the muzzle offset, which
moves where a bullet is born and compensates `maxTravelPx` to match; that one
deserves the suite's attention when Node is available.

**2026-08-01 — a scrolling enemy index, real map previews, right-click to
deselect, and the Warbringer and Rifleman brought up to the Siphon and Sniper's
price band.**

Eight requests from the owner, in one pass.

**The enemy index scrolls, and its rows are twice the size.** The roster list
was 26-pixel rows sized so all twenty-one types fitted on screen at once. That
fitted, but it made the screen a directory: the sprite was a nine-pixel speck
and the row had space for a name and two numbers. Rows are now 50 px with ten
in view — the owner's figure — and the list scrolls under the wheel. Ten is the
*unit of the layout*, not a consequence of it: `ENEMY_LIST_H` is derived from
`ENEMY_VISIBLE_ROWS × (ENEMY_ROW_H + gap)`, so retuning the row height moves the
viewport and the scroll clamp together. The extra height buys the sprite at a
size you can identify, the badge line, and the speed beside the health, so the
list now answers "what is this and how fast is it coming" without the detail
panel. `Codex.onWheel` is scoped to the viewport rectangle, so the wheel does
nothing while the cursor is over the detail panel, and `onClick` tests the
viewport *before* the rows — without that, a click above a scrolled list would
land on whichever row was sitting off the top of it.

**The route cards are the actual map now.** They used to draw the polyline in
the difficulty band's colour on a flat dark swatch, which meant every map looked
like every other map in a different tint and none of them looked like the thing
you were about to play — terrain, road width and theme, everything that makes a
route recognisable, was absent. `drawMapThumbnail` renders the whole 1280×720
battlefield into the card through the same three calls the play screen makes in
the same order: the theme's background, `Maps.drawEnvironment`, then the road.
`drawRoad()` was split into `drawRoadOn(routeList, map)` for this — **one
function paints both**, which is the only honest way to promise the preview is
the map, and it means a theme retune or a change to the road's five strokes
shows up on the cards without anyone remembering to update them. The scale is
uniform and the preview box is built 16:9 to make that possible; a non-16:9 box
would force either letterboxing or a squashed map, and neither is "looks exactly
like the map we're playing in". The card layout is what that costs — a 16:9
render at the card's width is 196 px of a 240 px card, so the blurb and the four
stats moved *onto* the render as translucent bands, the same arrangement the
in-game HUD has with the battlefield. Towers, enemies and the old start/end dots
are deliberately absent: the first are run state and there is no run yet, and the
dots were interface the battlefield itself never shows.

**Right-click deselects.** It clears the armed slot, the inspected tower and a
pending aim click together, because "selected" is one idea to the player even
though it is three fields here. It deliberately does *not* open the pause menu
when there is nothing to cancel, which is where it parts company with Escape: a
menu is a place you go, a right-click is a dismissal, and one that could put a
modal on screen would be a trap on a button people click by reflex.

**Both recruit tiers call at 45 s.** B4 was 40 and B5 shortened it to 30. B5 now
buys a bigger, harder squad rather than a more frequent one.

**The Tyrant's roar is a wall and a court.** The shield goes 200 → **1000**: at
200 against a 5000 HP body the roar announced a wall and then did not put one
up — two seconds of a finished board's fire. And the summon gains four rows
behind the running mob it always called: 2 Hives, 3 Shieldbearers, 3 Healers and
2 Colossi, taking it from 600 HP across thirty bodies to **2780 across forty**.
That changes its *shape*, not just its size — it used to be a rush you outlast
and it is now a formation you take apart in the right order, and the
Shieldbearers stacking onto the strongest body on the road means the roar's 1000
is not the last shield the player has to chew through. It is the one moment in
the campaign that asks whether they learnt the support types.

**The Tyrant acts less often and leaps far harder.** Both intervals go 8 → 12 s
(9 after the roar's 0.75 multiplier). Slowing the rhythm is what buys the
individual blows room to be heavy: the leap is now damage 30 → **80**, radius
90 → **120 u.l.**, jump 50 → **90 u.l.**, stun 2 → **3 s** and reach 150 → **220
u.l.**, which makes it the heavier of the two moves. That is the right way
round — the aimed shot picks your best tower, the leap takes the whole corner.
The wind-up grew with it (1.1 → 1.5 s), and that is not optional: a blow this
size has to be visible coming, and the seconds it spends crouching are seconds
it is not walking.

**The Warbringer and the Rifleman gained HP on every tier and were repriced to
the Siphon and Sniper's band.** Two changes that had to happen together.

The Warbringer had *no* health tier at all, which is a strange gap on the one
tower whose job is to stand in the road: its 150 was the same at A5 as the
moment it was placed. Every tier on both towers now carries an `hp` delta —
Warbringer to 575 (A) / 700 (B), Rifleman to 380 (A) / 505 (B). The Smasher
needed the plumbing built: `maxHp` is now derived in `recalcStats()` like every
other stat, which is what makes `previewUpgrade`'s set-flag-recalculate-diff
report the right number and keeps purchase order from mattering.

**A health tier now grants its delta rather than healing to the new maximum.**
That rule was right while the Rifleman's B2 was the only tier that moved the
ceiling — one full heal on one tier is a perk. With HP on all twenty tiers it
would have quietly turned every upgrade into a full repair, so a tower under
fire could be topped up for the price of the next tier. That is a far bigger
change than the health itself and nobody asked for it.

On price: the Siphon and the Sniper cost roughly **$70–$140 for every point of
DPS a finished path produces** (Sniper A is $20 250 for 300 DPS, Siphon A is
$33 800 for 250 ramped). The Rifleman was selling its 66.7 DPS path A for
$3 000 — $45 — and the Warbringer a finished path for $2 525. Both now land in
the band:

| Path | Was | Now | Finished DPS | $ / DPS |
|---|---:|---:|---:|---:|
| Rifleman A | $3 000 | **$6 700** | 66.7 | 100 |
| Rifleman B | $2 850 | **$7 500** | ~75 with recruits and defence pierce | 100 |
| Warbringer A | $2 525 | **$5 200** | 13 × ~4 bodies = ~52 | 100 |
| Warbringer B | $2 675 | **$7 000** | 13.6 × ~4 = ~54, plus the 65% slow, the blast and the quake | ~130 |

The Warbringer is priced against its **effective** output because its damage is
area damage — the swing lands on every body in the zone at once, and four is a
fair count for a wave walking a road. **Both build prices are untouched**
($300 and $700): `STARTING_CASH` is 600 precisely so the opening buys two
Riflemen, and that pair is a documented invariant of the first two waves.
Tactical tiers pay a premium on top of their damage delta, per the owner's
instruction — the Rifleman's B3 (camo) and B4 (defence pierce *and* recruits),
the Warbringer's A4 (120° arc → full circle), B3 (the slow granted), B4 (blast
on kill) and B5 (the only map-wide effect in the game).

**The Automaton Rifleman is now just the Rifleman.** Cosmetic only, and the
same rule the reskin followed: `Soldier.ID` is a persistence format and the
catalogue resolves the constructor by the global name `Soldier`, so neither
moved. `DISPLAY_NAME` is the one string that is purely cosmetic, so it is the
one string that changed.

**Not done, and deliberately: no playtest.** The owner asked to run it himself.
The changes were verified in a real browser against the running `index.html` —
every screen draws, the wheel scrolls end to end through the DOM and is inert
over the detail panel, right-click clears the selection in play and is inert
while paused, the six route cards are exactly 16:9 and sample to a median colour
difference of 12 against a live render of the same map, and the price/HP/boss
tables above were read back off live instances. **The Node test suites were not
run: there is no Node on this machine.** They should be run before this ships.

**2026-07-31 — merged the v0.4.12 branch: kill bounties, two new enemies, a
rebuilt enemy index, three-quarter actors, and the rescaled wave spine.**

The owner asked for sixteen numbered changes from a parallel v0.4.12 branch to
be brought into this one. The branches had diverged: v0.4.12 answered "the game
is too easy" by **rescaling the schedule**, while this one answered it by
**adding Easy/Normal/Hard**, and each had presentation work the other had never
seen. So this was a merge with real decisions in it, not a copy. What follows is
what was taken, what was kept, and the two places the owner had to choose.

**The economy is now bounties, and `CASH_PER_DAMAGE` is gone.** Every type has
an authored `bounty` pricing its whole threat — speed, armour, shields, revives,
abilities — not its hit points. `Enemy.bountyOf` scales that with a wave's
health override, so a tougher body is still worth more, but only when it is
actually killed. Paid once, in the death sweep, on the final death: a Revenant's
first life pays nothing, shields and heals inflate nothing, and Hive brood is
`noBounty` and worth $0. The Siphon's A3 charge income survives as the one
deliberate exception. Damage still flows upward for counters, lifesteal and
charge — it simply stops being money.

The wallet opens at **$600**, and $5000 arrives through play: `waveProgression-
Reward` pays $148 on waves 1–2 and $147 on 3–34, and `waveEscalatingReward` adds
$50 on wave 1 rising by $5 a wave to $215 on wave 34. `waveReward()` sums those
with the old HP-based clear bonus. Note for anyone reading the other branch's
notes: **this branch never held the $5600 opening wallet** that one shed, so the
$5000 is money ADDED to the schedule here rather than money moved out of the
opening. Both branches land on the same lifetime purse, which is what matters.

**Damage counters were lying, twice.** `Enemy.takeDamage` returns 0 for $0 brood
so the Siphon cannot farm charge off a Hive — and `TowerScore` was reading that
same return, so every point of brood damage vanished from tower totals.
`lastDamageTaken` now records what a blow physically absorbed (shields and
restored health included, overkill excluded) and the scoreboard reads that while
the reward mechanics keep the old value. Pierce bullets read it too. Separately,
the Arcane Sniper's B5 was calling `takeDamage` straight from its adapter and
bypassing the scorer entirely; it now goes through `TowerScore.apply` on both
manual and automatic casts.

**Two new enemies.** The **Colossus** is 550 HP, $250, 17.5 u.l./s, oversized,
and deliberately has no shield, armour, defence, revive or ability at all — a
wall with nothing clever about it. Wave 29 gains one, escorted by two 120 HP
Shieldbearers whose scaled bounties replace exactly the $300 taken off the
Colossus. The **Fractal Slime** is one type with per-instance tiers T0–T5,
health `4^tier`, and a halved bounty ladder from $0.50 to $512. On death T1–T5
split into four of the next tier down, once only; the death sweep collects the
children and appends them AFTER the parent is paid and removed, which is what
stops cleanup eating the new generation or declaring the wave clear early. They
are spaced `18 + 8 × childTier` u.l. apart with fresh lane offsets and
deterministic 0.5–1.0 s stuns so they do not land as one puddle. A full T3 is 85
bodies, 256 HP and $128. Wave 25 gains one. Every tier carries
`aoeDamageReduction: 0.5`, and `takeDamage` now takes a `damageKind` so only
attacks tagged `"aoe"` — the Warbringer's wedge, its B4 chain, the Sniper's B5 —
are halved. The Sniper's ordinary piercing line is deliberately NOT area damage
and keeps full value.

**The enemy index was rebuilt** as a compact left column (skin, name, HP,
bounty, all twenty-one on one screen) beside a detail panel that derives base
and effective HP, bounty, speed, crossing time, armour, defence, AoE reduction,
size, visibility, wave appearances and a data-driven behaviour description.
`Enemy.draw(ctx, { hideBars: true })` gives the portraits their skin without a
health bar. **Kept from this branch:** the panel still walks all three
difficulties, because five enemies are only reachable in Normal and Hard and a
guide that hid them would be lying about its own roster. The HP and tier
CEILINGS stay Easy-only, though — the panel prints Easy's wave list beside them,
and a Hard-derived figure next to an Easy wave list is two campaigns reported as
one.

**Presentation: actors yes, terrain no** — the first of the owner's two choices.
v0.4.12 replaced the battlefield with BTD6-style grass and packed-earth roads,
which would have deleted this branch's `Maps.ENVIRONMENTS`: six authored sci-fi
facilities with per-map palettes, four deck/hazard zones and nine machinery
models each, plus route decorations. The owner chose to keep them. So the
three-quarter camera came across for ACTORS only — ground shadows, lifted
bodies, depth sorting by ground Y, the new Warbringer/Sniper/Siphon/Rifleman
silhouettes, projectile shadows and trails — and the terrain hooks fall back to
the authored environments. `enemyAt` had to follow the bodies up: it measures to
`visualBodyY()` now, or the cursor picks the wrong one of two overlapping
enemies.

`Effects.aoeImpact` adds a bounded impact layer (72 max, cleared by `reset()`)
for Warbringer swings, per-target contacts, B4 bursts and the B5's violet ring,
fissures, shards and energy pillar. It sits beside — not instead of — this
branch's earthquake, which keeps its camera kick and floor cracks, and beside
the Path A staged forge-slam.

`js/visual-models.js` is a registry any of that can be replaced through, by
category and id, with `registerSprite` for PNG/WebP/SVG packs;
`MODEL_SKINS_GUIDE.md` documents the ids and `js/skins/example-pack.js` is a
disabled template.

**`js/systems/summon-contact.js`** replaces this branch's inline recruit-contact
pool with a shared rule every future friendly summon inherits: a summon commits
its remaining HP, and if the strike kills it only loses what was physically
absorbed — 35 HP against a 1 HP enemy leaves 34 and walks on. A survivor
consumes the whole commitment, and a revived enemy counts as a survivor.
Recruits move at 40 u.l./s, B4 reaches 100 and B5 now 125, and both wear new
three-quarter clockwork infantry models (brass at B4, steel and cyan at B5) with
independently replaceable model ids.

**`MAX FIELD · A2 / B5 + AUTO`** in the purple debug panel and the Sandbox
sidebar rebuilds every placed tower to exactly A2/B5 — ignoring cost, crosspath
locks, the global B5 gate and the Siphon's healing condition — restores max HP,
fires every real AUTO ability once and leaves it armed. The Warbringer's
Earthquake moved onto `AutoAbility.attach/handle/isOn` so its AUTO survives that
first cast. `debug-cash.js` suppresses its floating panel when the Sandbox
sidebar exists, so the command lives in one place per page.

**The wave spine was rescaled** — the owner's second choice, and the larger one.
This branch's Easy was the v0.4.6 spine at 738 bodies and 11 706 HP; v0.4.12 had
roughly doubled it. The owner chose to adopt the rescale, so `EASY_WAVES` is now
797 bodies and 23 782 authored HP (25 969 effective), the Tyrant is 5000 rather
than 2500, and the five formerly unscheduled types appear in waves 24–35.
**Normal and Hard were NOT retuned** and still layer their additions on top, so
they are currently a smaller step up from Easy than they were designed to be.
That is a known, deliberate debt and it is flagged in the comment above
`NORMAL_WAVE_ADDITIONS`.

Authored totals, all verified live in the browser against the running build:

| Quantity | Value |
|---|---:|
| Enemy types | 21 |
| Scheduled bodies | 797 |
| Scheduled HP / effective | 23 782 / 25 969 |
| Scheduled kill bounties | $23 503 |
| HP-based clear bonuses | $2 596 |
| Starting cash | $600 |
| Redistributed opening cash | $5 000 |
| Rising wave allowance | $4 505 |
| Single-route purse | **$36 204** |

**What was deliberately NOT taken.** v0.4.12 had also removed the gunner from
the shipping build bar; that was not among the sixteen requested changes, so the
build bar is untouched here. The grass terrain is not here either, per the
choice above. Both branches had independently dropped the gunner from the
Sandbox roster already, which is why that fixture failure disappeared.

**Verification:** `run.js` 106/0 and `sandbox.smoke.js` 148/148 — both were
failing before. `content.test.js` 192/16, and the sixteen were confirmed
identical to the v0.4.12 branch's own sixteen by diffing the failure lists.
Longshot 71/0 and beam 45/0 unchanged. Driven live in a browser through the real
`index.html`: the command deck, the sci-fi routes, the ten-second Start pause,
`$600` with "Enemy bounties paid on kill", a T3 slime dividing into 85 bodies for
$128, a Colossus beside two Shieldbearers, both towers taken to exact A2/B5 by
the debug button, and the rebuilt index — with zero console errors. A pre-merge
snapshot is in `TD_0.4.11_premerge_backup.tgz`.

**2026-07-31 — a run opens on a ten-second pause with a Start button, and a
beaten wave is followed five seconds later instead of three.**

Two pacing corrections in one instruction, both about a moment the player was
not being given.

**`WAVE_CLEAR_DELAY = 5`.** *"Once all the enemies of a wave have been killed,
if not on auto skip, leave a 5 seconds delay until the next wave."* The board
clear used to share `WAVE_CALL_DELAY` with the Send button, and they are not the
same event: pressing Send is the player saying they are ready, while clearing
the board is the game deciding for them, and the pause afterwards is the only
one a winning player gets. "If not on auto skip" needed no branch — auto-send
calls in at three, `callNextWave` only ever moves a wave closer, and three beats
five — which is a fair check on that `Math.min` having been the right shape.

**`RUN_START_DELAY = 10`, and the Send button becomes Start.** *"When starting a
run, do not send the first wave immediately, either wait 10 seconds, or the user
can press a start button manually."* `restartGame()` used to spawn wave 1's first
enemy itself, so a run began with a body already walking and a player still
reading the board. Wave 1 is now handed to the ordinary scheduler, which is what
lets the opening inherit the readout, the button, auto-send and the pause key
rather than becoming a fifth screen state. Two guards carry it: `betweenWaves()`
lost the `waveIndex > 0` that existed only because the opening used to have no
break in it, and the board-clear trigger gained `!beforeFirstWave()` — without
that one, an empty road at t=0 reads as a wave just beaten and the ten seconds
silently become five.

Pressing Start is instant, deliberately unlike a mid-run call: the three seconds
that stop a wave landing on a distracted player are three seconds of nothing at
the start of a run.

The sandbox opts out (a workbench is not paced), and so does `boot(mapId)` in the
test harness — same trade as `pinWaveBreak`, with four tests taking the real path
through the chooser to cover what it skips.

**2026-07-31 — The title screen is now a decorated sci-fi command deck.**

The chooser's faint grid was not enough to connect the main menu to the newly
model-filled maps. `drawMenuBackdrop` now builds a complete command room from
Canvas shapes: coloured wall/floor panels, recessed bays, luminous circuit
trunks, industrial hazard markings, a large ley reactor and a deep-space relay
with a holographic tactical screen. A framed centre terminal keeps the title
and navigation legible over the richer room.

The four existing hit rectangles are unchanged, but `drawMenuButton` now paints
them as numbered illuminated controls with mechanical brackets, per-action
accent colours, shadows and stronger hover states. The coin readout became an
armoury-credit status panel. A focused content test verifies the command deck
draws once and all four controls use the dedicated renderer without changing
screen state.

**2026-07-31 — The six maps are now distinct, model-filled sci-fi facilities.**

The earlier motif pass was too faint and left the battlefields reading as
mostly blank gray canvases. Each map now owns a strong per-map palette, four
large deck/hazard zones and nine substantial top-down machinery models. Rune
Circuit is a cyan command deck, Mana Coil a violet capacitor foundry, Sigil
Lattice a green research array, Null Meridian a red-violet containment site,
Shifting Ley a blue phase lab, and Twin Confluence an amber transit nexus.

`Maps.drawEnvironment` overscans the floor for camera shake, adds panel seams,
bevels, hazard markings, circuit trunks and layered pseudo-3D machines before
the route is drawn. `drawRoad` now consumes the same theme for a dark casing,
coloured surface, luminous edge and segmented centre guide. All environment
data remains presentation-only; a focused test renders every map, validates
its palette/zones/model count and proves drawing does not mutate route data.

**2026-07-30 — Warbringer impacts now move and mark the ground; every map has
its own procedural scenery.**

The earthquake now calls the presentation-only `Effects.earthquake` hook on a
successful cast. For 0.75 s `beginWorld` offsets the battlefield with two
irregular frequencies while the HUD remains fixed; a source-centered break and
twenty scattered fissures stay for 2.4 s. Ground, world and screen effects were
split into explicit draw layers so cracks sit under units, particles follow the
camera, and banners remain readable. Failed/cooldown casts start nothing, and
the simulation never reads an effect value.

Path A gained a longer **cosmetic** 0.48 s overhead wind-up with three trailing
hammer poses. Damage timing is untouched: progress still comes from cooldown
and the hit still lands at zero. A successful Path A swing captures its real
aim/range/arc/full-circle geometry and leaves orange-edged cracks clipped to
that AoE for 1.6 s; stored geometry prevents them rotating after impact.

All six maps now carry at least five background decorations in their map data,
with a different motif for each route. `Maps.drawDecorations` paints them under
the road through the same authored scale. They do not participate in route
analysis, placement or targeting. Three focused content checks cover the
Path A frames/cracks, quake shake/fissure lifetime and all-map rendering. The
suite measures 86/6, **187/16**, 71/0 and 45/0; the Sandbox reaches the same
inherited layout failure as before.

**2026-07-30 — Easy remains the original campaign; Normal and Hard add denser,
tougher full-roster schedules, selected before each run and runnable in
Sandbox.**

The owner's request was deliberately schedule-focused, not a new economy or a
route rebalance. `EASY_WAVES` is therefore the old 35-wave array unchanged.
`DIFFICULTIES` derives Normal and Hard from it with explicit count, health,
spacing and lead multipliers plus authored support groups. Normal is 851 bodies
and 22,369 effective HP; Hard is 962 and 30,911, versus Easy's 738 and 13,498.
All five enemies that were previously limited to Sandbox/Index — Aether Wisp,
Shieldbearer, Healer, Vanguard and Camo Heavy — now appear in both higher
tiers. Camo Heavy is confined to all-camo waves so it cannot reveal an
otherwise untargetable Warbringer companion.

PLAY now presents EASY / NORMAL / HARD above the route cards, with keyboard
shortcuts E / N / H. The active tier appears in the HUD, pause and result
screens; Restart preserves it. Sandbox gained the same registry-backed picker
and can reset/run any schedule without clearing the tower test board. The Index
now scans all three schedules, so former Sandbox-only cards show their real
Normal/Hard appearances.

The schedules are made harder with both more bodies and more effective HP, not
HP inflation alone: tighter spacing and repeated shield/heal/flight pressure
change the tactical load while still paying the ordinary authored bounty.
Measured totals and roster/purity invariants are covered in `tests/run.js`;
four focused Sandbox checks cover its picker and schedule switching. After the
change the five commands measure 86/6, 184/16, 71/0, 45/0, and all four new
Sandbox checks pass before that harness reaches its inherited layout failure.

**2026-07-31 — a recruit's contact is a POOL, not one shot: it now costs what
each body is worth to kill, so 40 HP stops 40 HP of swarm.**

The owner: *"when a recruit (40 HP) faces a swarm of 40 enemies (40 HP total), it
should be able to stop it entirely because of its HP. The recruit dies as soon as
the first enemy of the swarm touches it however."* Both halves were true. Contact
had been written that morning as "spend the whole remaining health on the first
enemy to reach me", so a 40 HP recruit paid 40 to kill a 1 HP runner — 39 points
of overkill, which `Enemy.takeDamage` clamps away unpaid — and the swarm walked
over the corpse. A block that cannot be divided is a block whose HP number means
nothing.

`SoldierRecruit.takeContactDamage` now walks **every** enemy touching it while it
still has health, and charges `contactCostFor(enemy)` for each: the raw damage
that just kills it, `armor + remainingHealth / (1 - defense%)`, which is
`Mitigation.mitigate` inverted because the pool is spent before mitigation takes
its cut. Capped at what is left, so **the old behaviour survives against anything
it cannot afford** — a recruit that meets a brute still empties itself into it and
still does 35 through 5 armor.

Two details worth keeping: the cost is exact and the floating-point margin is
applied to the *blow* rather than the pool (overkill is free, and charging the
margin would compound until the fortieth body survived on a billionth of a hit
point); and `touched` now really does fill up, which is what the once-per-enemy
rule was always protecting. Two tests: the owner's 40-vs-40 case exactly, and a
recruit keeping the change after an armoured kill.

**2026-07-30 — Rifleman path B: A1/A2 feed the automatic rate, B4's pierce moves
from armor to defence, B4 +2 damage, B5 to 20 damage, recruits to 30 s.**

Five corrections in one instruction, all on the Automaton Rifleman.

**A1 and A2 now grant +0.25 to the AUTOMATIC rate.** The owner found the hole:
those tiers buy attack speed as burst *shape* (`shots`/`spacing`/`cooldown`) and
B3 throws the burst away, so a B-path Rifleman got nothing at all for
crosspathing into them. Only those two tiers carry it — A3's `locksPath` makes
A3+ and B3 mutually exclusive, so a `fireRate` on A3–A5 would be unreachable.

**They are now the ONLY attack speed path B can buy**, which was not true when
they were added: B5 also carried +3 shots a second for a few hours the same day
and the owner took it straight back out. So the automatic rate is 2.5/s the
whole way up path B, and 3.0/s crosspathed into A1+A2.

**B4's pierce moved from FLAT ARMOR to FLAT DEFENCE, 6 → 10 points.** His words
and the code's use opposite vocabularies (his "armor" is the percentage, his
"blindage" the flat subtraction), so: 10 percentage points off `defense`, and
**nothing pierces flat armor any more**. The `armorPierce` parameter was removed
throughout — `Mitigation`, `Enemy.takeDamage`, `TowerScore.apply`, `Bullet` —
rather than left as a dead argument.

**The zero clamp was explicitly requested and it matters**: without it 10 points
against a 0-defence enemy is −10, which is a 10% damage *bonus* against every
unarmoured enemy in the game. Tested at zero defence, at exactly-equal defence,
and against an enemy with no stats at all.

**A consequence, reported not fixed: the brute counter moved a tier.** B4's flat
pierce used to zero a brute's 5 armor. Now nothing does, so a B4 Rifleman's 5
damage does literally nothing to a brute and path B's answer is B5's raw 20.

**B4 +2 damage; B5 +15 instead of +5**, taking the rifle to a flat **20** (1 + 1
+ 1 + 2 + 15) — the owner's figure, not a derivation. **B5 also drops the recruit
cooldown to 30 s**; B4 keeps 40, so the cooldown became a per-instance value
resolved by `recalcStats` rather than a constant read at the call site.

**B5's attack speed was added and removed within the hour**, on the owner's
correction. With it, path B ended at 110 DPS against path A's 66.7 and dominated
outright; without it path B ends at **20 damage @ 2.5/s = 50 DPS** (3.0/s and 60
crosspathed into A1+A2). So **path A wins on the tower again** — 66.7 against 50
— and path B wins on camo, pierce, range, HP and four recruits. That is the
balance the two-pass A4/A5 retune was aiming at, restored by deleting one field.

**Verified against the real running game, not just reasoned about** — this time
the preview pane did reload from disk, so every figure below is measured on the
shipping code: the rate ladder (2.5 → 2.75 → 3.0 with A1/A2, and 2.5 / 3.0 at
full B) with pure A untouched at 8.33/s burst; the damage ladder to 20; recruit
cooldowns 40 at B4 and 30 at B5; every mitigation case including the clamp;
real bullets landing 18 a shot on a real Armored enemy (20 through 20% defence
with 10 points pierced); and the panel, hover card and codex all rendering the
new numbers. The B5 attack-speed removal was measured the same way — the pane
had gone back to serving a cached snapshot by then, so it was checked by
deleting the field in the running game and re-reading the whole ladder.
**The Node suite still has not been run — there is still no Node here.**
Roughly a dozen test assertions were updated and two tests rewritten, all
checked against those live measurements before being written down.

**2026-07-30 — Selective v0.4.10.0 merge: Rifleman, flying Aether Wisp,
auto-ability switches, and the complete map pool only.**

v0.4.9 remains the base. `js/soldier.js` was overwritten with the newer
$300 Rifleman (automatic B3, recruits at B4, B5 rifle/recruit boost and the
retuned A path). The sandbox-only `flying` type, fail-closed flight targeting,
flight visuals and Index badge were merged without changing the 35-wave
schedule. `js/systems/auto-ability.js` was added and wired only to Rifleman
recruits and the Arcane Sniper B5 nuke; switches are off by default.

The price change exposed one base bug in `js/meta.js`: `STARTING_CASH` is a
top-level `const`, so it is not a `window` property and the loadout guard was
silently using its old $20 fallback. It now reads the lexical $600 constant
directly; otherwise a $300 Rifleman could be mistaken for unaffordable.

`js/maps.js` now contains the four existing authored maps plus deterministic
Shifting Ley and dual-entrance Twin Confluence. `game.js` normalizes maps to
one or more paths, mirrors each scheduled beat across Twin Confluence's two
routes, preserves route identity for spawned descendants, checks placement
against every road, and draws/previews all routes.

Deliberately **not imported**: v0.4.10.0's extra towers, tower registry,
RunEconomy/economy retune, cash-per-damage changes, loadout expansion, or any
other roster/gameplay changes. This boundary is part of the requested merge,
not an omission.

Verification on the bundled Node runtime: core remains **83 pass / 7 inherited
failures**, exactly its pre-merge result; content is **184 / 13**, versus
168 / 13 before the merge; Longshot is **71 / 0**; Beam is **45 / 0**; and the
focused Soldier merge check passes. The sandbox smoke file still reaches its
pre-existing stale roster/placement failures and eventual layout crash, but
both new Aether Wisp picker/spawn checks pass before it. All 14 touched
JavaScript files pass `node --check`.

**2026-07-30 — B4's blast bug fixed, the blast now slows, the quake cooldown is
45 s, the Siphon gets its name back, and THE GUNNER IS DELETED.**

Five corrections in one instruction, the last of them large.

**The blast bug, and it was a real bug.** The owner: *"when the b4 warbringer
attacks and kills the enemy they don't explode, however they should be because
attacked enemies are slowed even if they die instantly."* `swing()` recorded
`wasSlowed` BEFORE the blow and applied its own slow AFTER it, so the only thing
that could ever have slowed a first-swing victim was the swing that had not
happened yet — a one-shot kill never burst. **The fix is the ordering**: slow,
then damage, then burst. The `wasSlowed` guard is gone and would be dead code if
it stayed (B4 requires B3, B3 grants the slow). The old prose in the Content
section defended this as "very conditional... do not loosen without being
asked"; that note was wrong and has been rewritten rather than left standing.

**The blast now applies the tower's slow to everything it damages**, reversing
this file's older rule that a burst was "a consequence of a blow that already
landed, not a second swing". A chain running down a column now leaves the whole
column slowed.

**Earthquake cooldown 20 → 45 s**, the owner's figure replacing the one this
file picked. 8 s of effect against 45 is ~18% uptime rather than 40%.

**"Mana Fountain" → "Siphon"**, undoing that half of the reskin. `DISPLAY_NAME`
and the config's `displayName` only; the id (`siphon`) and constructor
(`BeamTower`) never moved, so the round trip cost no save data.

### The gunner is deleted

Removed from `CATALOGUE` in js/meta.js, which is the whole deletion as far as
the game is concerned: BUILD_SLOTS, the starting kit, the armoury, the index and
the sandbox roster all derive from that array. There is no way to place one. An
existing save with `"gunner"` in `owned`/`equipped` drops it silently, which is
what `sanitise` has always done with unknown ids.

**Every build-slot index shifted down by one.** The Warbringer is slot 1 now and
the fifth slot is empty. The alternative was a permanently blank first slot —
a dead hotkey and a dead patch of build bar kept out of nostalgia.

**`js/tower.js` IS STILL LOADED, and the banner at the top of it lists exactly
why**: `Smasher`/`Soldier` take `FOOTPRINT_RADIUS_UL` and `containsPoint` from
it. That is one constant and one four-line function shared so two tower types
cannot disagree about their own size or hit box. A new file whose entire
contents are `11.25` and a distance check is churn, not progress.

**The map difficulty yardstick moved to the Automaton Rifleman**
(`Maps.REFERENCE_TOWER`), and **every route's score is bit-identical** — the
Rifleman is 100 u.l. with the same footprint, so the two numbers that go into
the arithmetic are the same two numbers. Verified against all four routes:
rune-circuit 0.826339, mana-coil 0.565583, sigil-lattice 0.886382,
null-meridian 1.060908, before and after. The 100 u.l. reference the whole
distance system is anchored to therefore survives the deletion intact.

**The starting kit is now the Warbringer and the Automaton Rifleman**, and the
economy invariant still holds with room to spare: `STARTING_CASH` is $600
against a $15 Rifleman. What it no longer buys is "six gunners exactly" — the
opening is now Riflemen, which is what the Rifleman was always for.

### What this did to the tests, and what is NOT verified

**85 `h.place(...)` calls became `h.placeGunner(...)`.** A new harness helper
constructs a `Tower` directly and drops it on the board through the game's own
`addTower`, because a large part of this suite measures the REFERENCE TOWER's
physics — target claiming, u.l. invariance, bullet flight, throughput per unit
of DPS — and those tests are still worth having and still true. What they can no
longer prove is that the placement UI works for this tower, and the UI no longer
offers it, so there is nothing left to prove there. `h.slotOf(ctor)` was added
and `placeSmasher` now resolves by constructor: **slot indices must not be typed
in any more.**

Two call sites that passed an explicit slot were caught by that rename and put
back by hand (the Tyrant's highest-DPS test, and `placeSoldierBeside`).

**Three tests were rewritten because this turn inverted what they assert**: "an
unslowed kill does not burst" became "a kill on the very first swing still
bursts" (it is the regression guard for the bug above), "the blast itself
applies no slow" became "the blast slows what it damages", and the build-bar
roster now reads Warbringer/Arcane Sniper/Siphon/Automaton Rifleman/null.

**NOT RUN, and this time not fully verified either.** Still no Node. Worse, the
browser I have been verifying against serves a cached snapshot of this folder
and would not reload from disk, so the checks had to be done by loading the new
implementations into the running game by hand. What that DID establish: the
instant-kill burst now fires (a never-slowed victim killed on the first swing
bursts, neighbour 50 → 13, one blast marker), the blast applies the slow (a body
outside the wedge takes 15 and comes away at 40% for 2.5 s), and the map scores
are bit-identical after the yardstick swap.

**What is NOT verified at all: the gunner's removal from the catalogue.** The
game was never booted with that change — no build bar, no armoury, no index, no
sandbox, no starting kit, no save migration. It is a data deletion with derived
consumers and I believe it is correct, but nobody has watched it run. **Boot the
game before trusting it**, and expect the test suite to need another pass on top
of the 85 mechanical renames.

**2026-07-30 — The Warbringer's path B: range on B2/B4/B5, a chaining blast,
and an earthquake on B5.**

Four things in one instruction, all on branch B. The full spec and the
reasoning are in "Path B, rebuilt 2026-07-30" under the Content section; this
entry is what moved and why.

**Range: B2 +15 u.l., B4 +10, B5 +15.** Path B granted none before. Full B is
now 71.25 u.l. against 31.25, and A2 + full B crosspaths to 83.75.

**Written as a SECOND, ADDITIVE column** (`rangeBonusUl`) rather than folded
into the existing absolute one, because "+15" cannot be expressed as an
absolute-max: a tower already holding A2's 43.75 would have got 2.5 u.l. out of
it. Path A is untouched and still absolute. This is the detail most likely to
be "tidied" into one column by a future session, so it has a test that walks
B1→B5 a tier at a time and another that pins path A at 62.5.

**A consequence, flagged rather than fixed:** at B4 the wedge is 56.25 u.l. and
the blast is 18.75, so the blast radius is now entirely inside the swing and the
burst no longer reaches anything the swing missed on its own. The chain below is
what gives it a job again. Nobody asked for the radius to grow and it did not.

**Blast damage 3 → 15, at every tier, and it CHAINS**: anything that dies to a
burst bursts in turn. **A body may burst at most once**, tracked in a local list
and driven by a queue, so the cascade the old `explode()` comment refused to
build is bounded by the size of the board — worst case, every enemy on the map
explodes once. A forty-body crowd is run through it in a test to pin that it
terminates.

**B5 grants the earthquake**: the machine jumps, every enemy on the map stops
moving for 3 s, and then moves 60% slower for 5 s. No radius, no damage, no
cash cost. It goes through the same `panelActions`/`performAction` ability
contract the Arcane Sniper's nuke uses, so the panel button, the hover card and
the sandbox sidebar needed no work.

**Two decisions the spec did not make, both flagged in the code:**

- **The 20 s cooldown is mine, not the owner's.** A map-wide freeze with no
  gate is a button that ends the campaign. A cooldown was chosen over a cash
  cost or self-damage because it keeps the ability about timing, which is what
  path B is about. `Smasher.QUAKE_COOLDOWN_SECONDS` is the single line to
  change if he names a figure.
- **The stun is MOVEMENT only** — a stunned Tyrant still aims and shoots. The
  spec says "causing enemies to stop moving", and an attack lockout is a much
  bigger promise than those words carry.

**The stun and the slow are applied together**, with the slow's duration
covering the stun (3 + 5 = 8 s). A stunned enemy is already at zero speed, so
what the player sees is exactly the specified sequence; the alternative was a
scheduler holding a pending slow, which is a second kind of timed global state
for no observable difference.

**`Enemy.stunTimer` is a new field**, deliberately distinct from `rooted`
(permanent, from a revive), `windUpTimer` (the enemy's own doing) and
`slowMultiplier` (a fraction, not all of it). Longest wins, matching both
`applySlow` and `TowerHealth.stun`.

**Six existing tests were rewritten and eleven added.** The rewrites were forced
by the range change: `IN_BLAST` and `BEYOND` were chosen to sit outside a
31.25 u.l. wedge and a B4 Warbringer's is 56.25, so "out of the swing, inside
the blast" is no longer a reachable position. They now assert what the blast
actually does — it lands on top of the swing, and the chain is what reaches past
the wedge — off a separate ladder of marks (`CHAIN_1`…`CHAIN_CONTROL`) measured
against the real path geometry. The bare-smasher fixture guard is untouched and
still passes, because a Warbringer with no upgrades is exactly what it was.

**NOT RUN: the Node suite, again — there is still no Node on this machine.**
Every number above was verified against the real running game in a browser
instead: the range ladder tier by tier and crosspathed, the chain through a real
swing (five bodies burst, the last two outside the wedge, a control untouched),
a survivor refusing to pass the chain on, a forty-body crowd terminating at
exactly 41 bursts, the quake freezing four spread-out bodies including the boss
for exactly 3 s and then leaving them at 20 u.l./s for 5 more, the cooldown
gating a second press and recovering, a latecomer not being caught, the boss
still winding up and hitting for 45 while stunned, and the panel button
appearing only at B5. Every test written here was checked against those
measurements before being written down, but the suite itself is unproven — run
all five before trusting it.

**2026-07-30 — Shields pay nothing, ever; four new enemy types, none of them in
a wave.**

Asked for as one instruction with five parts: *"let's add some more enemies but
don't add them to any waves, just to the index and of course to the sandbox mod
so we can test them. 1st make it so that shield gives 0 money, ever."* Then a
Shieldbearer, a Healer, a fast boss and a heavy camo.

**A shield gives $0.** `Enemy.takeDamage` now returns only the part of a blow
that landed on HEALTH, and `Enemy.bounty()` is `maxHealth` rather than
`maxRemainingHealth()`. The shield itself is unchanged — it soaks first, spills
through, breaks the same way — only its *worth* moved. Done at that one door
because the return value has always meant "what this hit was worth to the
player" (it is why overkill is clamped out of it), which is the same door
`noBounty` already came through, so cash, the Siphon's lifesteal, its charge
meter and every tower's damage counter were all covered by one edit rather than
by an audit. **A Siphon chewing a shield therefore earns no lifesteal and no
charges either.** That follows from the principle and was not separately asked
for; if it is wrong, the fix is a second return value, not a special case.

**What it costs: exactly 1 364 HP of the schedule, so $4 092 — a 10% pay cut**
on a $42 443 purse, concentrated on the waves carrying Bulwarks. Measured
against the real `WAVES`, not estimated. The schedule and the prices were **not**
adjusted to compensate, because nobody asked and because compensating would
have quietly undone the change.

**`waveEffectiveHealth` was deliberately NOT changed.** It measures what the
player must remove, which is still 13 498 and still the owner's target, and the
clear bounty is still a tenth of it. It is simply no longer a purse, and the
economy section now spells out the three different numbers that used to be one.

**Healed HP pays nothing either**, by the same mechanism (`healedHealth` on the
instance, spent first when a blow lands). Without it the Healer below would be
an income tap rather than a tax. A REVIVE still pays in full — a second life is
scheduled and priced, so `tryRevive` clears the healed pool to say so.

**The four types, none scheduled.** The owner wanted them reachable before
anything is built around them, so they are in the index and the sandbox and in
no wave. That cost one rule: *"every type must be scheduled"* was half of a
test, and the half that said "every wave is claimed by a type" is kept while the
other half became an explicit list of the unscheduled ids. Their index cards
say "Sandbox only — no wave" rather than a bare "Waves ".

- **Shieldbearer** — 60 HP, ×0.45. Every 10 s, +20 shield to the ten strongest
  bodies on the map, **stacking**, as asked. Since a shield now pays nothing,
  everything it hands out is work done for free: the same shape as the Hive,
  where the body is ordinary and what it *produces* is the cost.
- **Healer** — 200 HP, ×0.4. Every 8 s, 15 HP/s for 4 s to the three enemies
  missing the most health. The heal lives on the TARGET and ticks in its own
  `update`, so it outlives the Healer — killing it stops the next pulse, not
  the one already running.
- **Vanguard**, the fast boss — 750 HP, ×3.5 for the first 400 u.l. and ×1.75
  after, plus 100 shield every 7 s that **refreshes rather than stacks**. The
  opposite threat to the Tyrant: that one is a wall you grind while it silences
  your board, this one is a body you have very few seconds to remove, and the
  non-stacking shield makes it a burst problem rather than a sustained one. The
  name is a placeholder like the Tyrant's.
- **Camo Heavy** — 20 HP, ×0.65, camo, **5 flat armor behind 20% defense**. The
  owner said "20% armor and 5 blindage"; in this codebase `defense` is the
  percentage and `armor` is the flat subtraction, so that is how it was written.
  Health and speed were not specified and were chosen to read as "heavy".

**Two new mechanic blocks rather than two special cases** — `support`
(shield/heal other enemies on a timer, read by `supportAllies`, called from the
main loop between the brood append and the tower step) and `sprint` (faster
over an opening stretch of ROAD, not for an opening span of time). `sprint` is
two lines and still got a block, because the alternative was
`if (typeId === "boss_fast")` inside `currentSpeedUlps`, which is the exact
branch this whole arrangement exists to prevent. The fast boss's self-shield is
`support` with `pick: "self"`, not a third mechanism.

**The index's enemy grid needed a layout pass.** Three rows is fixed and the
columns follow from the roster size, so eighteen types took the card from 238 px
to 197. The card is now width-adaptive (smaller sprite, tighter text column,
shorter labels) and the stat value's room is **measured against the label**
rather than assumed from a fixed 118 px — that assumption was already wider than
the whole value column, so every stat on every card would have clipped. The
behaviour rows were re-measured against real canvas metrics rather than
eyeballed; if a future type makes one longer, measure it again.

**NOT RUN: the Node suite. There is no Node on this machine** — the same
hazard this document has recorded twice before, and the reason for the warning
under "How to run and test". Every mechanic and every number above was instead
verified against the **real running game in a browser**, driving the real
`update()`, `takeDamage`, `supportAllies` and `Codex` from the console: shield
and healed-HP payouts, the ten-strongest pick and its stacking, the three-most-
wounded pick and the exact 60 HP restored, the sprint boundary at 400 u.l. in
both directions and under a slow, the non-stacking refresh, the heavy camo's
mitigation, the main-loop hook, and the index building and drawing with all
eighteen types. Tests were written for all of it and are **believed correct but
unproven** — run all five suites before trusting them.

**2026-07-30 — Renamed all towers to match robot fantasy/magic theme. No
mechanic or stat changes.**

Smasher → **Warbringer**, Longshot → **Arcane Sniper**, Siphon → **Mana
Fountain**, Soldier → **Automaton Rifleman**. Each tower's `draw()`,
`drawIcon()` and (where it had one) its projectile were redrawn to match. The
full mapping, and the rule about which of a tower's three names may move, is in
the new "Tower names" section above the Current values table.

**Why the ids and constructors did not follow.** `Type.ID` is written to
localStorage by `MetaProgress`, so renaming one un-owns that tower for every
existing player; the catalogue also finds each constructor by its global name
(`global: "Smasher"`) because meta.js loads before the tower files. So the
files are still `js/smasher.js` and `js/soldier.js`, the tests still say
`h.placeSmasher`, and only `DISPLAY_NAME` moved. That keeps the rename free of
risk and keeps this document checkable against the source.

**The gunner was left exactly as it was**, at the owner's instruction: "delete
this tower, but it stays in code as a placeholder for now". It keeps its name
and its old artwork, which now makes it visibly the odd one out — the correct
signal for a unit on its way out. Nothing was deleted; it is still in
`BUILD_SLOTS`, still a starter, and still the 100 u.l. reference tower the
whole distance system is anchored to. Actually removing it is a mechanics
change and was not made.

**Nothing simulated changed.** No cost, damage, range, fire rate, footprint,
cooldown, HP, upgrade, flag or targeting rule was touched, and
`Smasher.swingProgress()` — the one animation input the simulation shares — is
byte-identical, so damage still lands on exactly the frame it always did. Three
cosmetic fields were added (`Smasher.slam`, `Smasher.weight`,
`BeamTower.healGlow`), each written by the thing that causes it, aged in code
that already existed for the purpose, and read only by `draw()`. Everything
else the new artwork reacts to is derived from stats that were already there.

**Six test assertions were updated, all of them name literals** — the build-bar
roster in run.js, the placed-tower names in run.js and content.test.js, two
armoury bar snapshots, the codex lookup for the Siphon, and two in
sandbox.smoke.js. Every suite is back at the counts recorded under "How to run
and test": 89/1, 159/6, 71/0, 45/0, and the sandbox smoke passing. The seven
pre-existing failures are untouched and unrelated.

**Two places where the brief and the code disagreed, resolved in the code's
favour** and flagged rather than fixed by moving a mechanic: the brief put the
Arcane Sniper's camo detection on path B (it is A1) and the Warbringer's speed
scaling on path A (it is path B). The visuals key off the resolved stat or flag
rather than off a branch letter, so both read correctly either way — and
crosspathed towers now draw honestly, which the old branch-tint-only artwork
did not.

**Not touched, and worth knowing:** `README.txt` is player-facing and still
uses the old names throughout. It was out of scope here; it will need a pass
before anyone reads it as documentation of the shipping game.

**2026-07-30 — Economy revamp: a real starting stake, $3 per damage, and towers
repriced to match.**

Asked for, as an exact list of values: `STARTING_CASH` 20 → **600**,
`Tower.COST` 15 → **100**, `CASH_PER_DAMAGE` 1 → **3**, `Smasher.COST`
200 → **700**, Longshot `baseCost` 75 → **900**. The Siphon's $800 was named in
the request and confirmed unchanged; the Soldier's $15 was not in the request and
was left alone. Upgrade costs, the wave schedule and the meta-coin catalogue were
explicitly out of scope and none of them moved.

**Why, in the owner's terms:** the old stake bought exactly one gunner, and the
whole opening was earning the second one. That made the first two minutes a
single decision repeated. $600 buys six gunners, so the opening is a *board* —
where do these go — and the game starts at the question it is actually about.
Tripling damage income keeps that board fundable: a five-figure purse is what
lets mid-game towers be a real mid-run purchase rather than a thing you read
about on the index screen.

**The invariant was checked and holds.** `STARTING_CASH` ($600) exceeds the
cheapest tower. Note the cheapest tower is the **$15 Soldier**, not the $100
gunner — the request described the gunner as the cheapest, and it is not, though
the invariant holds either way and by a wider margin than before.

**Two figures in the request did not survive contact with the arithmetic**, and
this file records the measured ones rather than the stated ones:

1. *"full-run income (~$13,500)"* — 13 498 is the schedule's effective **HP**,
   which was the purse only while damage paid $1. At $3 the purse is
   **~$42 443** (40 494 damage income + 1 349 bounties + 600 stake), verified by
   driving the real harness. The $3 rate was chosen for a ~13 500 target and
   overshoots it roughly threefold; $1 per damage is what produces ~$13 500.
2. *"full upgrade trees remain a multi-run goal"* — they do not, on two counts.
   A single run's ~$42 400 now funds a complete tree outright (Longshot full A
   $20 250, full B $28 575; Siphon full A $33 800, full B $17 900) where the old
   ~$14 900 purse funded none of them. And upgrades were never a multi-run goal
   mechanically: per-run cash does not persist, `MetaProgress` saves only coins,
   owned types and the loadout, so the only multi-run currency is coins and the
   only thing they buy is tower ownership.

Both are flagged rather than silently corrected by moving a number the owner
pinned. If the intent was a ~$13 500 purse with trees out of reach, the change
is `CASH_PER_DAMAGE` back toward 1 (or upgrade prices up); that is a decision,
not a typo, so it is left to him.

**Three knock-on inconsistencies the revamp created and did NOT fix**, each
recorded where someone would trip over it:

- **The beam's `baseGoldPerDamage` is still 1** and its comment still claims to
  match `CASH_PER_DAMAGE`. Base income is fine (the loop pays it at
  `CASH_PER_DAMAGE`), but the A3 charge *bonus* is derived from it, so that
  mechanic now pays a third of its intended proportional bonus. Noted in
  `beam.config.js`'s neighbourhood via `tests/beam.test.js` and
  `tests/sandbox.smoke.js`.
- **The Longshot's upgrade pricing model is off its peg.** Its tiers are priced
  at "the gunner's rate of $15 per DPS" and the gunner is now $100 per DPS, so
  upgrades are ~6× cheap relative to the towers they sit on. Explained in the
  cost comment in `long-range-dps.config.js`.
- **The wave clear bounty is a tenth of HP, not of cash**, so it did not scale.
  It was a 10% raise on the old purse and is ~3% of the new one.

**The suite was run — the first time since v0.4.6.** This file had been asking
for that since v0.4.7 shipped untested. Results and the pre-existing failures it
exposed are in "How to run and test" above; the economy work itself is green.
Test expectations were updated to the new values, never the reverse. One
genuinely stale test figure was also corrected: `tests/run.js`'s "first gunner
earns the second in ~26 s" had been asserting a 22–30 s window against an actual
20.3 s since the 2026-07-27 map rescale, so it was failing before this change
touched anything; its premise (a stake that buys one gunner) is gone, and it is
now a rate check rather than a pinned figure. `tests/harness.js`'s `meter()` also
had `CASH_PER_DAMAGE = 1` baked into it — it recovers damage from a cash delta —
and now divides by the constant instead.

**2026-07-29 (v0.4.7) — The Soldier: a burst-fire starter unit, flat armor
pierce, and units that are not towers.**

Asked for: a fifth tower called the Soldier — $15, the game's primary starter
unit and the intended replacement for the gunner once the gunner is removed —
with a full stat table, two five-tier paths under the existing crosspath rule,
and a B5 that calls in temporary walking recruits. The gunner stays; no
existing tower, enemy or economy value moves. See **The Soldier** above for the
full design; this entry is the *why* behind the decisions that were not simply
transcribed from the table.

**It is written like the Smasher, not like the Longshot.** The owner's paths
are absolute per-tier values, which `recalcStats()`-plus-flags handles
directly; a config-driven `ConfiguredTower` would have meant translating his
table into deltas and keeping that translation honest forever, for no gain. It
plugs into the existing `buyUpgrade`/`panelActions`/`performAction` contract,
so the panel, the hover cards, the codex and the armoury picked it up with no
changes to any of them.

**The burst cycle is measured from one burst's START to the next.** That single
choice is what makes the owner's own DPS figures come out (`3 × 1 / 1.2 = 2.5`,
`5 × 3 / 0.7 = 21.4`) and it makes shot spacing a *shape* rather than a cost.
Measuring from the last shot instead would have made every price in the A table
wrong by the width of a burst. `attacksPerSecond()` is `shots / cooldown`
accordingly, so the panel's Damage, Attack speed and DPS rows still multiply
out — which is the whole contract of `js/systems/tower-stats.js`.

**Retargeting is per shot, and a shot with nothing to hit is lost rather than
cancelling the burst.** The spec said both "remaining shots immediately
retarget" and "those shots are lost", which only reconcile if each shot decides
for itself. Abandoning the remainder would have made a Soldier standing over a
thinning wave measurably worse than its own DPS row.

**Flat armor pierce (B4) is a new global mechanic, because there was none.**
The game had percentage *defense* pierce and nothing that touched *armor*, so
`Mitigation.mitigate` grew a fourth argument that reduces armor only, clamped
at zero so pierce can never become a damage bonus. It threads through
`Enemy.takeDamage` → `TowerScore.apply` → `Bullet` as trailing optional
arguments, so **every existing call site passes nothing and behaves exactly as
before** — a test asserts a gunner's bullet still carries zero. It rides on the
bullet rather than being read off the owner at impact, for the same reason
`damage` does: a shot is fixed when it is fired. It deliberately does not
change the *claim*, which has always reserved raw damage.

**Recruits live on the tower, and that was the interesting call.** The obvious
shape — a global `recruits` array beside `enemies` and `bullets` — would have
meant a new run-scoped list for `restartGame()` to reset, a new draw pass, and
a new thing every future session has to remember. Hanging them off the Soldier
means clearing `towers` clears them and nothing new can be forgotten. The
honest cost is stated rather than hidden: recruits go with the tower that
called them, unlike a bullet already in flight. And because `Targeting.pick`
duck-types a shooter, a recruit got all six targeting modes and the camo rule
by spelling five fields the way a tower spells them.

**Two spec gaps, both flagged rather than quietly filled.** *Contact damage*
was not specified at all, so it is derived — the recruit's own shot damage, 3,
charged once per enemy, which makes 12 HP mean "four bodies walk over me".
Once-per-enemy rather than per-frame matters: per-frame would tie a recruit's
life to the frame rate. *Camo inheritance* was not specified either; armor
pierce was explicitly carved out and camo was not, and B5 requires B3, so
recruits inherit detection — a blind recruit would be useless on exactly the
waves its parent was upgraded for. Both are one constant and one boolean if the
owner wants them the other way.

**The meta-progression loop's premise changed, so it was re-measured.** The
Soldier is a starter and its B3 is camo detection — until now the *reason* a
fresh profile could not win was that the starter bar had none. `tools/measure-
starter-kit.js` was written for that question. The loop survives, for a better
reason than before: detection moves the wall from wave 19 to wave 28 on the two
easier routes, but the $415 costs you the board that earns it, so the starter
kit still loses on all four routes under every policy scripted. The table is
under Meta progression. **A method note worth keeping**: the first draft of
that tool reported "no change" confidently and wrongly, because a greedy
builder that spends every $15 immediately never accumulates $200 — it measured
building and called it upgrading. Its policies now have an explicit saving
phase and it prints how many Soldiers actually reached B3.

**Slot five is used, so the bar is full.** It had been held empty across
several change logs specifically so the bar would not change shape when a fifth
type arrived, and it did not. A sixth type is now a real decision about
geometry and hotkeys rather than a drop-in, and the roster test in
`tests/run.js` is where that will surface. On a *fresh* profile the Soldier
lands in the third slot rather than the fifth, because `defaultLoadout`
compacts rather than leaving holes — that rule predates the Soldier and a bar
with two gaps in the middle would be worse.

Tests: twelve new cases in `tests/content.test.js` covering the stat tables,
burst timing measured shot by shot, per-shot retargeting, crosspathing, the
A5+B1+B2 endpoint, armor pierce against a brute, the recruit lifecycle, panel
vocabulary, and one asserting nothing on the existing towers moved. Four
roster-pinning tests were updated for the fifth slot, and `sandbox.smoke.js`
now walks the Soldier's panel with recruits out — its tallest case. All five
suites pass: 78 / 151 / 71 / 45 / smoke.

**2026-07-29 (v0.4.7) — Waves arrive three seconds after you earn them, three
new enemies behind the midboss, mixed waves, and a boss bar for the midboss.**

Asked for, in one go: a 3 s timer before the next wave whenever the skip button
is pressed, the last wave's enemies are all killed, or the 90 s runs out; an HP
bar at the top of the screen for the midboss; two more waves; three new enemy
types (a shield worth twice its health that doubles its speed when broken; one
that dies, stops moving and heals to full once; a 150 HP slow spawner that
seeds five normals every few seconds, **those** carrying a shield equal to
their life and paying no money); a harder, steeper, more chaotic schedule with
mixed-type waves — while remembering that these 35 waves are the EASY tier, the
introduction to the game. And a boss at wave 35, **deliberately not built
yet**. Then, on review: the lane offsets scaled up and made to look actually
random.

**The Hive was misread first time round** and is worth recording as a mistake
rather than quietly fixing: the first pass gave the *Hive* the shield and the
empty bounty. It is the BROOD that carries both. The owner's correction: "it's
the spawns that have a shield and give nothing, not the hive."

**The 3 s call.** `WAVE_CALL_DELAY = 3`, and one function, `callNextWave()`,
which every trigger routes through: the Send button, the auto-send toggle, and
the new board-clear check in `update()`. It uses `Math.min`, so a call may only
ever bring the next wave CLOSER — with two seconds left, clicking Send must not
push it back out to three. The 90 s ceiling still fires on its own.

Worth being explicit, because it reverses the shape of a decision made earlier
the same day: on a board that is killing everything, almost every break is now
three seconds rather than ninety. The long break is now a floor under a board
that is *losing* — with something still walking you get as long as you need —
rather than a standing pause. Measured consequence: a winning run takes about
730 s of wall clock instead of about 3100 s.

**Mixed waves.** A wave may carry `groups: [...]` instead of flat fields, each
group with its own count/interval/type/health and an optional `lead` (the pause
before its first body). `waveGroups()` is the one place the two forms are
reconciled and the flat form IS the single-group case, so nothing else reads
`wave.count` directly. Half the schedule stays single-type on purpose: a wave
of one type is a question with one answer, and those are what teach the game.

**Camo waves are never mixed**, and that is a rule about the Smasher, not about
tidiness — its swing damages what it physically reaches, so one visible enemy
in a camo wave would let a detectionless Smasher clear it as collateral and the
whole buy-detection check would evaporate. A test pins it.

**Three new types, and not one branch on a type id between them.** `shielded`
(Bulwark), `revenant` and `hive`, added as three DATA blocks on the type —
`shield`, `revive`, `spawns` — each read by one method that asks whether the
enemy has one. That is the same arrangement `angry`'s `attack` block already
had, and the founding rule of `enemy.js` survives three more mechanics intact.
Tests pin the exact membership of each list.

Two decisions inside that are load-bearing:

- **A shield is a RATIO of the enemy's own health**, not a flat number, so a
  wave scaling the type with a `health` override scales its shield in step.
  `unclaimedHealth()` and `Targeting.score` both count it (or towers would
  write a full-health Bulwark off as dead on arrival); a LEAK does not, because
  a shield is armour worn, not mass thrown at the base.
- **A shield and an empty bounty can come from the SPAWN rather than the type.**
  The Hive's hatchlings are ordinary normals wearing both, which is a fact
  about how they were born — on the `normal` row it would have shielded every
  normal in the campaign. The `Enemy` constructor's fourth argument carries
  them, and a test asserts a scheduled normal is still unshielded and still
  pays.
- **`noBounty` is enforced in `Enemy.takeDamage`'s return value**, the one door
  every damage source already comes through. So a hatchling pays no cash, no
  lifesteal and no beam charges without any of those systems learning about it.

**The Revenant roots where it falls, and that cannot soft-lock a run** — it
revives exactly where something shot it, so a tower already covers that spot.
Written down in full under Content, because the instinct to "fix" it with a
decay timer would delete the mechanic to protect against a case the player
already controls.

**Lane offsets stopped looking like a waveform.** They came from a
low-discrepancy sequence (multiples of the golden ratio), which is *designed*
never to cluster — so a wave of enemies wove down the road in a visible sine
pattern. The owner: "they just look like a wave, not random at all, which is
very unnatural." It is a 32-bit integer hash of the spawn index now: still a
pure function of the index, still bit-identical on every engine, still
reproducible run to run — it simply flips sides on a coin (49% vs 76%) and lets
479 consecutive pairs land on top of each other instead of zero. Mean amplitude
is unchanged, so the balance figures stay comparable. `LANE_SPREAD_UL` went 4 →
7 with it, which does mean full-size sprites now overhang the road; that is
accepted, and the note in `enemy.js` says why the fix would be a wider road.

**The schedule: 33 waves and 4308 HP → 35 waves and 13 498 effective**, the
owner's figure, reached in two passes on the same day (7776, then the turn-up
to 13 500 with three or four types in almost every wave from 12 on). Waves 1–10
are byte-identical and pinned; the v0.4.4 twenty-wave spine still OPENS its
waves in its original order, with a test that also asserts none of them was
made weaker.

**Finishing a wave now pays a tenth of it**, ~$1350 across the run, derived
from `waveEffectiveHealth` rather than typed in per wave. Its own section
above.

**THE WAVE 35 BOSS was built**, to a full spec the owner gave a few hours after
asking for the slot to be left empty — and then **reworked the same day**,
because the first version was wrong in a way worth recording.

*First version:* 2500 HP, silencing three towers every 3.5 s and doing no
damage. The owner: *"right now the boss shoots an aoe wave way too often that
does no damages."* Correct — it read as a busy pulse that never hurt anything.

*Second version, the one that shipped:* it fights in **telegraphed beats**.
Every attack stops it dead for a second or so first, and the pool GROWS.

- **Aimed shot** (from the start, every 8 s): stops, picks the tower with the
  **highest DPS on the board** — not the nearest — and hits it for **45 and a
  2 s stun**. Two of those kill a gunner. Answered by depth, not by a bodyguard.
- **Leap** (unlocked by the roar, then it alternates): stops, **jumps 50 u.l.**,
  and lands with a shockwave that damages and stuns **every** tower within
  90 u.l. of where it landed.

It now attacks four times in 45 s instead of about twelve, and even at its
post-roar rate it is slower than the version it replaced. The roar still does
its four things (shield, speed, rhythm, twenty-one runners at 1.5×) and now also
unlocks the leap.

Machinery: `attacks` as a one-or-many pool beside the existing `attack`
(reconciled by `Enemy.attacksOf`, the same shape `groups` has with waves),
`windUpSeconds` enforced in `currentSpeedUlps`, `target: "highestDps"` reading
the universal `attackDamage × attacksPerSecond` contract, a `leap` block, and
stun support in `TowerHealth`. Its own section above, including the two traps
that section exists to keep closed.

**The clear bonus moved from "deployed" to "defeated."** The owner: *"the clear
bonus should come after defeating the wave, so basically at the start of the
countdown to the next wave if the wave was skipped."* It is now OWED on
deployment and PAID by whichever comes first of the board clearing, a skip, or
the next wave arriving — one latch, three doors, a test each. Its own section
above.

**Stop tuning by simulation.** The owner asked for the difficulty work to stop
being driven by campaign runs. The schedule numbers here are AUTHORED to a
stated total; `tools/simulate-campaign.js` remains for checking that a change
did not break something, not for retuning. The measured tables further up are
kept as history and marked stale.

**The one thing that had to be measured and reverted.** The first draft moved
the Brute introduction from wave 19 to 13. A gunner does literally nothing to a
Brute, so that wave is unanswerable until the player owns something that hits
for more than 5 — at 13 it killed a competent 30-tower board on `null-meridian`
outright. Brutes are back at 20 and the three new types are fitted around the
proven introduction order rather than through it.

**Measured in the browser against the real loop, all four routes.** No towers:
loss at wave 4. Gunners only: loss at 18–21 (13–18 on `null-meridian`). Twenty
gunners then Longshots, buying path A as affordable: WIN on rune-circuit (43
base HP left), mana-coil (94) and sigil-lattice (23), loss on `null-meridian`.
The same policy on the v0.4.6 schedule at v0.4.6 pacing finishes on 43 / 94 /
21 and *also* loses on `null-meridian` — so 80% more effective HP and two more
waves left the survival margin almost exactly where it was. That is the economy
doing its job (income is $1 per point of damage, so a heavier schedule funds
the towers that answer it), and it is the right outcome for the easy tier: the
turn-up buys more to DO, not a thinner margin. Re-measured after the Hive
correction and the lane-offset rewrite: unchanged, 43 / 94 / 23.

**The boss bar** is a `showHealthBanner` flag on the type, not a check for the
midboss, and bars stack rather than overlap. Wave 35's boss will cost one line
in `Enemy.TYPES` when the owner has designed it. A test asserts exactly one
type carries the flag today, so the day a second one does, somebody meant it.


**2026-07-29 (v0.4.6) — Auto-send waves, and a way out of a finished run.**

Asked for: "add an auto skip wave button that when turned on, doesnt require
user input to start sending the next wave"; and "when winning/losing a game,
add a button to return to the main menu instead of just having the restart or
choose new map button".

**Auto-send is routed through `skipNextWave()`** rather than given its own way
of poking the countdown, so the automatic path and the button are one path — it
inherits the "only ever ends a break" guard, and cannot compress the interval
*within* a wave. Its toggle went in the bottom-right beside the speed control
rather than beside the skip, for a reason worth remembering: with auto-send on
a break lasts one frame, so a toggle drawn only during breaks could be switched
on and never switched off. Anything that turns a thing on has to stay reachable
to turn it back off.

**That move surfaced a real bug that was already shipped.** A permanently live
button over the map is a permanently dead patch of map, and nothing told the
build preview about it — so the preview drew a green "build here" circle under
the cursor and the click pressed the button instead. True of the speed toggle
from the day it was added. `overInterfaceChrome()` is now the one list of
click-swallowing rectangles, and `drawBuildPreview` asks it. **Add any new
play-screen button to that function.** It is kept out of `whyCannotBuild`
deliberately: that answers a question about the world in u.l., not about
pixels.

**The run-over overlay had no exit.** It offered "restart" and "choose another
route", both of which start another run — so the armoury, where the coins that
same overlay had just awarded are spent, was unreachable without reloading the
page. Main menu goes on its own row below the other two, because those two are
"play again" and this one is not, and Escape now leaves a *finished* run (it
still only ever cancels in a live one).

**2026-07-29 (v0.4.6) — Pacing controls, AoE that hits what it lands on, DPS on
the preview cards, and the test suite green again.**

Asked for, in the owner's words: "aoe units do not hit camos, even if in their
range whilst the tower is attacking another unit"; "add 2x, and 3x game speed
(applies to everything), must be changeable by the user mid game, little button
in one of the corners"; "delay between waves is too short (5 seconds), must
allow user to skip wave, or wait 90 seconds"; "when previewing upgrades, also
show dps change (Ex 3 --> 5 dps)".

**The AoE bug was one line in the wrong place.** `Smasher.prototype.covers`
checked `Targeting.sees` — so a swing already landing on a visible enemy passed
straight through a camo standing in the middle of the wedge. That contradicted
the rule the rest of the game already followed and this document already stated:
camo blocks TARGETING, not incidental damage, which is why a `PierceBullet`, the
B4 blast and the Longshot's B5 all hit whatever they physically reach. The check
moved to where the *choice* is made: `facingTarget` still refuses to aim at an
undetected camo, and `update()` will not spend a swing unless something visible
is in the zone (`sightedIn`). **The camo waves are unaffected**, and not by luck
— a wave names exactly one type, so waves 13/16/26 put nothing visible on the
board for a detectionless smasher to swing at. There is a test asserting exactly
that, next to the one asserting the bug is fixed.

**Game speed is applied in exactly one place**: how much time `frame()` hands
the fixed-step accumulator. At 3× the loop runs three times as many 1/60 s
steps, so "applies to everything" is true by construction rather than by audit
— every system that reads `dt` advances with it because none of them can tell
the difference. The step itself is never scaled: a 3× `dt` would change
collision and cooldown outcomes, and speed has to stay a pacing control rather
than a difficulty setting. Two tests pin both halves.

**The break went 5 s → 90 s, with a skip.** Five seconds is a countdown you
watch, not a decision you make — too short to walk the board, read a panel or
compare two upgrades on their hover cards, which is where this game is actually
played. Lengthening it costs nothing because income is per point of damage and
never per second, so idle time earns exactly nothing and the break cannot be
farmed. 90 is a ceiling rather than a wait: `skipNextWave()` ends it whenever
the player is ready.

**The DPS row answers the question the other two rows do not.** "+6 dmg" on a
slow tower and "+0.4 atk/s" on a fast one can be the same purchase, and the only
way to see that was to multiply in your head, twice, before deciding. It is
derived by the same definition `TowerStats.dps` uses for the panel, so the card
and the panel underneath it can never disagree.

**The test suite had 118 failures before any of this, and now has none.** One
line caused 110 of them: `MetaProgress.constructorOf` resolved tower
constructors off `window`, and the Node harness hands the vm a stub `window`
that is not the context's global — so every build slot came back empty and most
of the suite quietly degraded to "the tower was not in the bar". The browser was
always fine, which is precisely the divergence the harness exists to catch. The
rest were stale rather than broken: fixtures that no longer fit the swing after
`UNIT_LENGTH` was retuned, a stat row added without updating its expectation,
and a beam cost table that disagreed with the config (and with this document).
See "How to run and test" — the counts there are now measured, not remembered.

**2026-07-29 (v0.4.6) — Towers can die, an enemy that kills them, and a meta
economy between runs.**

Asked for, in the owner's words: range visible only when clicking a tower; "an
angry enemy that periodically attacks tower near him for 20 damage or sum";
"when a tower hit 0 hp it dies"; the Longshot's "B5 ability should kill him
after 5 or so use but right now he reach 0/0 HP and doesn't die"; the Siphon's
"B5 price should be next or under the requirement of 5000 healing done"; a
store tab and an inventory tab on the main menu; and meta coins kept between
runs, awarded on how far the run got.

**Three of those were one bug.** Tower HP existed on exactly two of the four
towers and nothing watched it, so B5 burning its last 300 max HP left a tower
at 0/0 that kept firing. `js/systems/tower-health.js` gives all four types one
contract and makes `maxHp <= 0` part of the death test — which is the 0/0 case
by name. B5 now kills the Longshot on the **fifth** use, exactly as its config
always intended, and the main loop sweeps the corpse off the board. Measured,
not assumed: 1450 max HP, 300 a press.

**The Angry enemy is DATA, not a special case.** It carries an `attack` block
and `Enemy.attackTowers` asks "does this enemy have an attack". `enemy.js`'s
founding rule — nothing branches on which type an enemy is — survives intact,
and a test pins that exactly one type has that block so a second cannot appear
by accident.

**The Siphon's B5 was 60 000 against a 5000-healing gate**, twelve times the
gate and fifteen times a whole run's purse: the tier unlocked with a green
light and then stayed unbuyable forever, which is worse than being locked. It
is now 5000 — the price IS the gate — and the two are documented as a pair.

**Meta progression took "save/load" off the out-of-scope list**, narrowly:
three fields, no run state. The interesting decision was what a fresh profile
owns. Gunner and Smasher, with the Longshot at 40 coins — because a first run
loses (no camo detection) somewhere around wave 17–30 and pays 30–56, so the
run that teaches you what you are missing also pays for it. That a fresh
profile cannot win is the loop, not a bug.

**One hole this opened, and closed.** With the player editing the build bar,
"STARTING_CASH must exceed the cheapest tower" stopped being guaranteed by
`BUILD_SLOTS` being a constant — you could unequip the gunner and be left with
the $800 Siphon and a $20 stake, which is the original no-tower/no-cash
deadlock with an extra step. `MetaProgress.unequip` now refuses it, and
`sanitise()` repairs a hand-edited save that contains one.

**Measured in the browser again** (no Node on the machine, same as v0.4.5):
the schedule went to 33 waves / 4308 HP with two Angry waves, and the balance
table in Balance math was re-run on all four routes. Spam still loses,
diversifying still wins, and the winning runs now lose 3–18 towers on the way.
The five Node suites are still unrun — see "How to run and test".

**2026-07-28 (v0.4.5) — Six new enemy types, and enemies stop walking in
single file.**

Asked for, in the owner's words: a type that "comes in big swarms of low hp
enemies"; for all enemies to be "a bit dispatch left and right on the track"
rather than on one line; a type with "normal health and like 20% armor"; "a
slow big enemy that has lots of health and like 5 blindage"; "camo normals and
camo fasts"; and "an early midboss with like 250hp and 10% armor".

**Percent vs flat was the one piece of translation.** The ask says "20% armor"
and "5 blindage" — two different things, and this codebase already had both:
`defense` is the percentage, `armor` is the flat subtraction. So `armored`
carries `defense: 20`, `brute` carries `armor: 5`, and the midboss carries
`defense: 10`. That mapping matters because flat armor has **no damage floor**
(a deliberate, documented decision in `js/systems/mitigation.js`), which makes
the brute a hard counter to the gunner and the beam rather than merely a
tougher target. Left as-is: it is the armor system doing the job it was
written for, and the schedule is built around it.

**Camo needed enforcing on two towers that had never met one.** `RangeFilter`
has checked `isCamo` against `stats.seesCamo` since v0.3.5, but only the
config-driven towers (Longshot, beam) go through it — the gunner and the
smasher pick targets through `js/targeting.js`, which knew nothing about camo
because no enemy was camouflaged. Both now carry `seesCamo = false` and the
rule lives in one new function, `Targeting.sees`, called from `pick()` and
from `Smasher.covers`. Deliberately *not* added to the smasher's B4 blast or
to `PierceBullet`: those are collateral from a hit that already landed, not a
choice of target.

**Lane offsets are a world position, not a drawing trick.** Each enemy carries
a signed offset and `Enemy.positionAt` pushes it perpendicular to the road
(new: `GamePath.tangentAt`). Two constraints shaped it. It is in **u.l., not
pixels**, because towers measure range to the offset position and a
pixel-fixed offset would break the "changing UNIT_LENGTH" test. And it is
**deterministic** — the golden-ratio sequence in `Enemy.laneOffsetFor`, reset
by `restartGame()` — because `Math.random()` in the simulation would turn
every pinned balance figure in the suite into a coin toss.

**`sizeScale` per type reversed an explicit prohibition in `enemy.js`.** That
comment forbade per-type radii because the frost ring (15 px) and hover ring
(20 px) were hand-tuned constants that only cleared each other at one body
size. The fix was to derive both from `radiusPx()` (+4 and +9), which holds
the 5 px clearance at *any* size and reproduces 15 and 20 exactly at the
original radius of 11. The three original types stay at scale 1, so nothing
about them moved.

**The schedule went from 20 waves / 3094 HP to 31 / 3984**, weaving the new
types in and giving three of them a wave that is a *check* rather than filler
(midboss at 9, camo at 11/15/24, brutes at 16/25). The index's Enemies tab was
re-laid out as a three-across grid — nine full-width cards did not fit a 720 px
screen — and the sandbox got an enemy-type dropdown, built from `Enemy.TYPES`,
so the new types can actually be looked at.

**The schedule was rebuilt twice, from measurements.** The first attempt
reordered the campaign freely; driven through the real loop in a browser it
lost on every route, because the first swarm landed at wave 5 with three
towers on the board and because $375 of camo detection could not be afforded
alongside enough gunners. The shipped version instead *interleaves* the new
waves into the v0.4.4 twenty, keeps the early camo waves small enough to leak,
and leans on the plain $75 Longshot as the brute answer. Measured result: spam
loses on all four routes, diversifying wins on all four. The table is in
Balance math.

**NOT VERIFIED BY THE NODE SUITES.** The machine this was written on has no
Node, so none of the five suites could be run — everything above was measured
in the browser instead. The pinned *opening* figures in `tests/run.js` are at
genuine risk of being one or two off from the lane offsets; see the end of
Balance math for which and why. `tools/simulate-campaign.js` is stale.

**2026-07-28 (v0.4.4) — The index: a field guide to towers, upgrades and
enemies, from the title menu.**

Asked for: an index on the start menu with two tabs, Towers and Enemies,
listing everything, with clickable upgrades that preview what they do.

**The design rule: derived, never written.** `js/codex.js` contains no stat,
price, description or wave list of its own. The Towers tab constructs a real
instance of each build-bar tower and reads `statLines()` (minus the lifetime
totals — a specimen has no history, and the rows are sliced off by count via
`TowerStats.totals`, not matched by label). The upgrade tree is built by
WALKING each path on a throwaway instance: each tier's price, effects line
and preview card are recorded from the same `panelActions()` the in-game
panel draws, with the instance standing at the tier below — so clicking A3
in the index shows the identical measured before → after card the in-game
hover shows when A3 is the next purchase, drawn by the same renderer
(`drawCardBox`, split out of `drawHoverCard`). The Enemies tab reads
`Enemy.TYPES`, draws each type's REAL sprite via its own `draw()`, and
derives wave appearances and the late-campaign health ceiling from `WAVES`.
Tests pin that the three appearance lists tile the schedule exactly.

**Previewing is not buying.** The walker advances instances through
`purchase()` / `applyUpgrade()`, deliberately BELOW `buyUpgrade` — that
function is the economy (the Smasher's `performAction` spends the real
global cash, which is exactly why the codex must not go through it). It
stops at any action carrying a `reason`, so the Siphon's healing-gated B5 is
shown with its refusal and never applied; one-per-game global state stays
untouched, and a test pins that opening the index changes nothing — cash,
towers, death denial.

**Building it found a real bug in the Siphon's panel actions.** A tier
refused by the unlock gate set its `refusal` into the tooltip and its
`detail`, but the action's `reason` field only ever reported crosspath — so
B5's action claimed nothing was wrong while its own button said "needs 5000
HP healed". The walker trusted `reason` and marched into the gate
(harmlessly — `BeamTower.purchase` re-checks it — but the model lied).
`reason` now carries whichever rule refuses the tier.

The menu gained the Index button between PLAY and Sandbox, renumbering the
hotkeys top-to-bottom: Enter/1 play, 2/I index, 3/S sandbox. The `← Menu`
back button was extracted into `drawBackButton()`, shared with the chooser.

Suite: 62 + 115 + 68 + 45 + both smoke tests, all passing, plus a browser
pass over both tabs, the A3 preview card and the gated B5.

**2026-07-28 (v0.4.3) — The exit became an Escape menu.**

Reported, revising the same day's v0.4.2: put the way out behind Escape as a
pause menu rather than a button sitting in normal gameplay.

**Right call, and the reason is worth keeping.** The `Menu` button cost HUD
space every second of a run to be used once at the end of it, and it lived
one stray click from ending a twenty-wave game — which is why v0.4.2 had to
bolt a confirmation onto it. Escape needs no confirmation step, because
opening the menu and choosing to leave are already two deliberate acts. The
button, its rectangle, its hover state and the whole "leave this run?" dialog
are gone; a test now asserts `exitButtonRect` does not exist, so it cannot
quietly come back.

**Escape had a job already, so it cancels first and pauses second.** A slot
armed, a tower inspected or a tower aiming all still clear on Escape; only
with nothing to cancel does the menu open. The other order would hand a
player trying to drop a half-placed tower a menu instead.

`overChrome()` went with the button — with nothing but the build bar left in
that row it was an indirection around `slotAt`, so both call sites went back
to calling it directly.

The pause menu shows the run's state (route, wave, towers, kills, base) and
offers Resume and Back to main menu. It freezes the simulation, for the same
reason the confirmation did: a menu that let enemies keep walking would charge
the player for opening it. In the sandbox, Escape opens the same menu and
"Back to main menu" leaves for `index.html` through the unchanged `leaveRun`
seam.

Suite: 62 + 110 + 68 + 45 + both smoke tests, all passing. The four pause
tests replace the four exit-button ones.

**2026-07-28 (v0.4.2) — A way back out of a run.**

Reported: an exit button was wanted during a game and in the sandbox, to get
back to the menu. Both existed as one-way doors before this — once a run
started, the only exits were losing, winning, or reloading the page.

**A `Menu` button in the build bar's row**, right of the slots. Placed there
rather than over the map for two reasons that are already rules here: the
inspection panel is clamped above `BAR_Y` so it can never cover it, and the
map is where the player clicks to build so a button there would compete with
placement. The 24 px gap from the last slot is what stops a fumbled build
click reaching it.

**It confirms, and freezes the board while it does.** Abandoning a twenty-wave
run to one stray click is not a thing that should be possible, and if the
simulation kept running behind the question then asking it would cost the
player a leak. Escape cancels — the safe answer, the way round every other
Escape in this game works — and Enter commits. `M` opens it, matching the key
the loss and victory overlays already use.

**`leaveRun()` is a seam rather than a call to `openMenu()`**, because the
sandbox is a separate page: it overrides the global to navigate to
`index.html`, the same wrapping discipline the rest of `js/sandbox/sandbox.js`
follows. The sandbox sidebar gained a direct `← Back to main menu` button too,
without a confirmation, since a sandbox board has nothing to lose.

`overChrome()` was extracted while doing this: the build preview and the enemy
hover both suppressed themselves over the build bar with their own copy of the
same check, and the new button needed adding to both.

Also fixed a cosmetic leftover it made obvious: the sandbox announced
"Wave 1 / 20" on load while its own status line said every wave was deployed,
because `startRun()` runs before the sandbox's hooks are installed and the
banner survived the cleanup.

Suite: 62 + 110 + 68 + 45 + both smoke tests. The sandbox smoke test earned
itself again — it failed the moment the sidebar gained a button its stub DOM
did not have, which is exactly the wiring mistake it exists to catch.

**2026-07-28 (v0.4.1) — All four towers are in the actual game, and there is a
title menu.**

Reported: "the siphon and longshot towers from sandbox are not accessible into
the index.html", plus a request for a start menu leading to either the routes
or the sandbox.

**Two of the four towers were sandbox-only.** Both were finished, priced,
upgrade-treed and covered by 113 tests between them — and invisible to anyone
who opened `index.html`. The fix is a build-bar entry plus `index.html`
loading the same tower/systems block `sandbox.html` already did. **No tower
code changed.** `js/systems/pierce.js` in particular stopped being optional:
the comment in `js/bullet.js` said index.html "has no piercing tower and never
constructs one", which is no longer true.

**The two script lists must now stay identical.** The sandbox's whole promise
is that what you learn there is true in the shipping game, and that stops
being so the moment the pages load different code.

**The economy had to move, or the Siphon would have shipped unbuyable.**
Income is $1 per damage, so total scheduled HP is the run's entire purse: at
the v0.4.0 schedule's 454 HP, an $800 tower could never be afforded, and a
permanently-greyed slot is not "accessible" in any sense worth having. The
schedule is now **twenty waves, 3094 HP**, with waves 11–20 using the `health`
override the merge left in place rather than new enemy types — the roster
stays the three the owner approved. `tools/simulate-campaign.js` gained a
"mixed" policy that saves for the expensive towers, and it now wins on all
four routes **with all four tower types on the board**, which is the check
that the towers are genuinely reachable rather than merely listed.

Writing that policy surfaced the trap a player will also hit: **spending every
$15 on another gunner means the balance never climbs to $800.** Reaching the
dearest tower requires deliberately saving. That is a real design question
(the run is winnable with gunners alone), left as the owner's call rather than
"fixed" by discounting a tower whose whole upgrade tree is priced off its base.

**A second, larger open question, unchanged and now more visible:** the
Longshot's and Siphon's UPGRADE trees are priced for an economy tens of
thousands of gold deep (full beam path A is $33,800). A 3094 HP run pays
~$3,100, so early upgrades are reachable and late ones are not. The prices are
internally consistent and correctly ordered; their absolute scale still
assumes an economy that does not exist. Do not rescale them unasked.

**The menu** (`screen === "menu"`, `drawMenu`) — PLAY, or into the sandbox;
Escape and a `← Menu` button come back from the chooser. `drawMenuBackdrop`
paints a full sci-fi command deck with panelled bays, a ley reactor, comms
console, hologram, cables and hazard markings; `drawMenuButton` owns the four
numbered terminal controls. This is menu-only presentation and does not reuse
map collision/content. Its strap line counts waves, routes and towers rather
than stating them, because it said "Ten waves" for exactly as long as it took
to add ten more.

**It also caught a real bug in the shipping game.** `update()` skipped
simulation on a *list* of screens (`screen === "select"`), so adding the menu
left waves spawning and enemies walking behind the title screen. It now tests
`screen !== "play"`, which makes any future screen inert by default. Pinned.

Test movement: `run.js` 56 → 58 (the roster is pinned by name and by contract;
all four types are placed, inspected and fought through the real click path;
the purse-vs-price check), `content.test.js` 107 → 110 (the menu's buttons,
hotkeys and Back). `tests/harness.js` presses PLAY before choosing a route, so
`boot(null)` still means "stop on the chooser" and no existing test changed
meaning. Suites: 58 + 110 + 68 + 45 + both smoke tests, all passing, plus a
browser pass over the menu, the four-tower bar, the Siphon's panel and its
beam draining an enemy.

**2026-07-28 (v0.4.0) — The game became a game: ten waves, a victory state,
and an effects layer.**

Asked for, in full: "make the game 1000x better", with no further direction.
Everything here is the most conservative reading of that — completing what
already exists rather than inventing a direction, which "The big open
question" still forbids. No new enemy types, no new towers, no new menus.

**The problem, in one line: the shipped game could not be won or lost.** The
two-wave schedule contained 52 HP against a 100 HP base, so the loss overlay
was unreachable outside tests; there was no victory state at all, so clearing
wave 2 just left the board sitting there; and a run's whole income was $52,
so the $200 smasher in the build bar was a decoration. Every mechanic worked
and nothing was at stake.

**Ten waves over the existing roster** (`WAVES` in game.js, 454 total HP).
The scheduler already had everything needed except the type pass-through —
`Enemy` took a `typeId` nobody sent it; `spawnEnemy` now forwards the wave's
`type`. Waves 1–2 are the original opening, byte-identical, deep-equal
pinned: the starting-stake decision is tuned against them. The schedule was
tuned by simulation, not by feel — new `tools/simulate-campaign.js` plays it
through the real loop under scripted policies, and the design targets it
verifies are: an undefended base always falls (waves 6–9, so losing is now
real), greedy honest gunner-building wins on every route, four gunners
scrape through only on the easy routes, and a winning run banks enough that
the smasher is a genuine mid-run purchase for the first time.

**Victory** (`victory`, `allWavesDeployed`, `drawVictory` via the shared
`drawRunOverlay`). The one design constraint that mattered: tests and the
sandbox disable spawning with `waveIndex = WAVES.length`, so "deployed
everything" must not be derived from `waveIndex`. `allWavesDeployed` is set
in exactly one place — the scheduler naturally exhausting itself — and the
manual idiom is pinned as a non-victory. Loss is checked before victory so a
final enemy that empties the board while zeroing the base reads as defeat.
Both overlays now also report the run: wave reached (`reachedWave`, which
credits a break-time loss to the wave that caused it) and `runKills`, counted
in the same end-of-life sweep that charges leaks.

**Effects** (`js/effects.js`; its own section above): death bursts, bounty
popups, base-hit pulse, wave banners, and a derived-not-stored muzzle flash
on the gunner. Strictly one-way — the simulation tells, never asks — which is
what let every suite keep its pinned outcomes with effects running.

**Test movement.** `run.js` 55 → 56: the waves group re-pins the full
schedule and the typed spawn, the victory test is new, and the opening
balance snapshots (`additional gunners…`, content's `defend()`) now slice
`WAVES` to the original two waves — measuring the opening is their point, and
against the full campaign two gunners are simply dead everywhere, which
discriminates nothing. Balance-math figures in this file were also corrected:
they still described the pre-v0.3.5 3 HP normals (47 HP total, base ending
71/88/96) when the tests had pinned 4 HP normals (52 HP, 66/83) for a day.

Suites after: 56 + 107 + 68 + 45 + both smoke tests, all passing, plus a
browser pass over the chooser, the banner, kills, leaks and both overlays.

**2026-07-28 (later) — One vocabulary across all four towers, and a hover card
that explains an upgrade in full.**

Reported: inconsistencies between towers, "hit speed and firerate" being the
example. It was worse than the example. The same quantity had four names and
two units — gunner `Cooldown 1.00 s`, smasher `Hit speed 4.00 s`, Longshot
`Fire rate 0.50/s`, beam folded into `AD 1 x 10/s` — so no two towers could be
compared and no reader could tell which way round "hit speed" ran (it was
seconds per swing; "fire rate" was swings per second).

**`js/systems/tower-stats.js` is the fix, and it is a contract, not a rename.**
Every tower answers `attackDamage()` and `attacksPerSecond()`; every shared row
is built from those two, so the damage, the rate and the DPS on screen always
multiply out. Towers still store their rate however their own model wants — the
smasher keeps seconds between swings, its upgrade table is written that way —
and that one function is the conversion point, the same arrangement `ul()` has
for distances. See the "One vocabulary" section for the full rule.

What that shook out, all of it real rather than cosmetic:

- **The smasher printed metres.** `Range 31.25 m`, `On kill 3 in 18.75 m`, in a
  game that has been in u.l. since 2026-07-26. Those were the last two.
- **The Longshot refunded nothing for its upgrades.** `sellValue` reads
  `totalSpent`; the smasher grew `cost` instead, the beam grew `totalSpent`,
  and the Longshot grew neither — so a fully upgraded Longshot sold for $38.
  Every tower now carries both, meaning the same thing.
- **The beam counted no kills**, because it called `takeDamage` directly to
  pass its defense pierce. `TowerScore.apply` takes that argument now and the
  beam goes through it like everything else. The Longshot had no kill counter
  at all; it does now, incremented where it already detected its own kills.
- **The Longshot and the beam ignored the targeting mode.** Both sorted by path
  progress inline, so they were stuck on "first" while the gunner and smasher
  had six modes and a button. Both now sort through
  `Targeting.comparator(tower)` — the same scoring and tie-break `pick()` uses
  — and get the cycle button for free.
- **The sandbox sidebar threw on a Smasher**, reading `t.core.purchased` on a
  tower that has upgrades but no config runtime.
- The dead `Tower.prototype._oldFindTarget` is gone.

**The `Target` stat row was removed from every tower.** The cycle button
directly beneath it already reads `Target: first`. That is the same duplication
the map labels were deleted for, and removing it bought back the row of height
the next part needed.

**The hover card.** Three lines on a button is enough to choose between two
upgrades and not enough to understand either: `+5 pierce, pierce falloff` never
says what pierce falloff IS, what the range would BECOME, or that tier 3 shuts
the other path for the rest of the run. Hovering any button in the panel — an
upgrade, an ability, a passive readout, the targeting cycle — now opens a card
beside it with every stat the tier moves before and after, a sentence per
ability, and the crosspath warning.

Its numbers are **measured, not read off the table**: `previewNextTier`
resolves the config twice and diffs, so a printed "+100 range" is the gain on
*this* tower with everything it already owns, and a flag that overrides a stat
outright (cone shape, infinite pierce → `∞`) shows up even though the table has
no number for it. Its prose is **per mechanic, not per tier**: one sentence per
flag name, with every number in it interpolated from that mechanic's resolved
parameters — so B4 raising B3's execute cap makes the same ability read 60%
instead of 40% with nothing to edit.

Writing it found a third bug: **a tier can grant a flag three ways** —
`grants`, `mechanics`, or a `flags` object — and the descriptions read only two
of them. The beam's B1 grants camo detection through `flags`, so its button
said "+150 HP" and nothing else. `UpgradeEffects.grantsOf` is now the one place
that union is taken, matching what `StatResolver` already did.

Polish that came with it: `fireRate` deltas read `+0.25 atk/s` rather than a
nameless `+0.25 /s`; the smasher's rate change reads in the same unit
(`+0.08 atk/s`) instead of `-1.0 s`, a different quantity in the opposite
direction; `ad` deltas read `dmg`, because the row above the button says
Damage on every tower; the smasher's range delta names itself
(`+6.25 u.l. range`); and the re-aim, ability and passive buttons gained the
third line the upgrade buttons already had.

**Headroom, recorded because it is now tight:** the tallest panel — a 5-2
Siphon — uses 608 of the 614 px between the canvas top and the build bar. A row
added to every tower's stat block will overflow. `tests/sandbox.smoke.js` walks
six builds of all three upgradeable towers and fails if any panel stops
fitting.

**Verification note.** This machine has no Node, so the suite could not be run
here. Instead the real game and the real sandbox were booted in a browser and
driven through their own entry points: all four towers placed and fought
through `update()`, all 74 upgrade/ability/passive buttons across every tier of
every upgradeable tower checked for a three-line label and a card, every card
laid out and measured against its box (645 drawn lines, none overflowing), and
every panel height checked against the build bar. **Run the five suites before
trusting the counts above** — they were counted from the files, not from a run.

**2026-07-28 — Upgrade buttons say what an upgrade DOES, before you buy it.**

Reported: "upgrade descriptions do not show prior to purchase." True on every
upgradeable tower — the button named the tier and quoted the price and stopped
there, so the only way to find out what $850 bought was to spend it.

**The description is derived, never written.** `js/systems/upgrade-effects.js`
turns a tier's own `deltas`/`statDeltas` and its `grants`/`mechanics` into a
sentence: "+15 dmg, +100 u.l. range, +5 pierce, pierce falloff". A prose
description sitting beside those numbers would be a second source of truth,
and it would go stale the first time someone retuned a number and forgot the
sentence. The Smasher reaches the same place by a different route — it DIFFS a
stat snapshot either side of a hypothetical purchase, because its upgrades set
absolute values rather than offsets, so only the tower can say what changes.

Writing the formatter immediately caught a real bug: `critChance` and
`critDamage` are stored as percentage POINTS, so scaling them "into a
percentage" printed **+2000% crit** for B3's 20-point bump. Pinned.

**The layout had to change to fit it.** A description is a sentence, and a
sentence does not fit a half-width button — at two columns it clipped to
"+5 dmg, +50 u.l. ra…", which is worse than showing nothing because it looks
like information. So when any action carries a description the buttons go
**full width, one per row**, the panel widens to 268, and the description
**wraps** over two lines via a new `wrapText` (which falls back to `fitText`'s
ellipsis on the last line rather than overflowing). Buttons without a
description keep the old two-column grid.

While in there, every upgrade button was given the same three-line shape —
**which tier / what it costs / what it does** — so the Smasher, Longshot and
beam no longer each phrase it differently. The Smasher's label moved from
"A1  $150" to "Path A → A1" with the price on line 2; its tests now assert
`label` and `detail` separately, which is what they were really about.

Suite: 258 + both smoke tests, all passing.

**2026-07-28 — v0.3.5: the two branches fused.**

Two people had been building on the same base in parallel. This merge takes
the union, not one side. **The u.l. foundation is the base** — the global
`UNIT_LENGTH` / `ul()` rule was an explicit instruction and everything else
sits on top of it, so where a conflict was about *scale* the u.l. side won and
the other side's numbers were converted (×12.5, the factor that turns the old
metre figures into the 100 u.l. gunner yardstick). Where a conflict was about
*content or design*, it was judged on its merits and the other side won plenty
of them. Decision by decision:

| Conflict | Kept | Why |
|---|---|---|
| Distance units | u.l. (`UNIT_LENGTH` + `ul()`) | Explicit instruction; one conversion point. Their maps/smasher were ported ×12.5 |
| Who fixes the scale | Adapted from theirs | Their "the reference map defines the scale" idea survives as `AUTHORED_AT_PX_PER_UL` + a *derived* `Maps.referenceLengthUl()`, rather than a second declared constant that could disagree with the first |
| The name `Targeting` | Theirs | Their `Targeting` (which enemy to shoot) is the one a reader expects. Mine became `RangeFilter` (is it within reach) — two different questions that were sharing a name |
| Enemy health | Theirs | A wave now says how many and how often, never how tough. `Enemy.TYPES` is the only place toughness is written down. Stock normals went 3 HP → 4 |
| Enemy roster, timed slows, hover | Theirs | I had none of it |
| Armor / defense / knockback | Mine | They had none of it; folded into their `Enemy` |
| Score tracking | Theirs | `TowerScore` is shared and counts kills as well as damage; my per-tower `damageDealt` was a strictly smaller thing |
| Upgrade panel | Mine, enriched by theirs | One generic `panelActions`/`performAction` UI rather than bespoke Smasher buttons — but the buttons now carry their richer payload (`branch`, `upgradeId`, `effects`, `reason`), exposed as the `L.upgrades` view. Their bespoke drawing went; none of their *rules* did |
| Targeting cycle button | Theirs | Ported as a first-class `L.targeting` row in `inspectionLayout`, so every tower with a `targeting` field gets it without opting in |
| `update()` return value | Theirs | Returns damage landed; the beam's charge bonus goes through `worldContext.addGold` instead of being smuggled out through the return |
| Maps, the chooser, the smasher | Theirs | I had one hardcoded road and one tower type |
| Loss screen | Theirs | Restart *and* "choose another route", plus the `M` key |
| Everything beam/Longshot | Mine | They had none of it |

**What broke in the merge and what it cost.** Their tests were written against
pixel coordinates on their road (`placeSmasher(600, 500)`, `spawnAt(960)`).
The u.l. rescale and the map refit moved that road, so ~20 of them were
testing nothing. They are now anchored on `SMASH_AT` / `IN_ZONE` / `IN_BLAST`
/ `BEYOND` — distances *along* the road, derived from the game's own clearance
rule and the smasher's own swing and blast radii. A future map edit cannot
silently invalidate them again.

The `js/systems/targeting.js` file could not be deleted (the sandbox refuses),
so it is a MOVED notice that defines nothing. Delete it by hand.

**Test suite: 250 tests, all passing** — `run.js` 54, `content.test.js` 100,
`long-range-dps.test.js` 54, `beam.test.js` 42, plus both smoke tests.

**2026-07-27 (latest 9) — Death denial rewinds time on screen; overlay draw order fixed.**

**The knockback is animated.** Instead of teleporting, the board FREEZES and
every enemy is dragged back along the route it walked over 1.4 s, easing in
and out like a tape being spun back -- with a violet wash, a trail from each
enemy to where it stood when time turned, and a clock hand running
anticlockwise. `DeathDenial` owns the whole thing (`isRewinding`,
`updateRewind`, `drawRewind`); `update()` in game.js advances only the rewind
while it runs, so nothing moves, fires or spawns. The freeze IS the effect --
"you did not kill anything, you took time back" reads as nothing at all if
the enemies simply jump.

One thing that had to move for it: enemies are un-leaked at the START of the
rewind rather than at the end. The game loop filters leaked enemies out at the
end of the same step, so the one that just reached the base -- the one most
worth rescuing -- would have been gone before the animation could touch it.

**Debug shapes were being drawn over the interface.** New `worldOverlays` hook
in game.js: functions pushed there draw after the map and before any UI, and
the sandbox registers its u.l. overlay through it instead of painting after
the whole frame. A range circle wider than the screen no longer scribbles
across the panel.

**Three copies of the same numbers were stacked around each tower** -- the
inspection panel drew "range"/"footprint" labels on the map, the sandbox
overlay drew its own, and the panel printed both as rows. The map labels are
gone from `drawInspection` entirely, and the sandbox overlay now labels only
RANGE (the one figure you cannot eyeball). Shapes still show all three.

Two tests pin the ordering: that a registered overlay draws between the map
and the panel, and that `drawInspection` emits no map labels at all.

**2026-07-27 (latest 8) — B5's healing gate halved to 5 000 and POOLED across towers.**

Per tower the gate was close to unbuyable, and for a structural reason: only
one B5 may exist in a game, so a single tower had to reach the whole total on
its own while every other lifesteal tower's healing counted for nothing.

`js/systems/healing-ledger.js` is a shared per-run total that every tower's
lifesteal writes into, and the unlock condition reads. Threshold is now 5 000
(25 000 damage at B4's 20% ratio, spread across however many B towers are
defending). Cleared by `restartGame`, same as the death-denial slot.

Towers still keep their own `hpHealed` for the panel, which now shows both:
its own contribution and the pool the gate actually reads.

**2026-07-27 (latest 7) — Beam gold runaway capped, DPS stat fixed, B5 gated on healing.**

**The gold was not a bug, it was a feedback loop.** `perCharge` and
`capTotal` grow with the player's gold, and gold income is damage x
multiplier, so gold feeds itself. Simulated at a realistic 370 dps with one
charge from 100k: gold passes 1.3M in eight minutes and the bonus climbs past
20 per point of damage -- which is how 5000 damage produced 106k bonus gold.
The spec's formulas are unbounded; it damped them with
`baseGoldPerDamage = 1/200`, and that number had to become 1 for the tower to
earn at this game's rate, which removed the damping.

**The gold scaling now stops at 50 000** (`GoldPower.MAX_SCALING_GOLD`), five
tiers, so `perCharge` tops out at 1.0 and `capTotal` at x10. That is exactly
the state the spec works through as its own example, and it bounds the bonus
at `cap - 1` per point of damage: 5000 damage can now produce at most 45 000
bonus gold, which is the figure the owner expected. Above the ceiling, income
is linear in damage instead of compounding. **The AD bonus is deliberately
left uncapped** -- it is already logarithmic and cannot run away.

**"DPS max" was reading a stat nothing uses.** It was resolved-AD x rate x
targets, ignoring the gold bonus, the ramp and the HP scaling -- so a fully
upgraded 5-2 showed a flat 200 however strong it had become.
`BeamTower.maxDps()` now multiplies in the effective AD (gold bonus
included), the ramp cap and the HP-scale bonus.

**B5 is gated on HP HEALED, not on the base's current HP** (10 000 either
way). Current HP is a level anything can move -- leaks take it, the sandbox
sets it -- so the upgrade blinked in and out of reach and a big base unlocked
it without the B path having been played. Healing done only ever goes up. The
tower now counts it (`hpHealed`, shown in the panel as "HP healed"), and
`DeathDenial` was narrowed to the one thing that is genuinely global: whether
the single slot is free.

At B4's 20% ratio the gate means 50 000 damage dealt through lifesteal.

**2026-07-27 (latest 6) — Charge decay is continuous; A5's passive is visible; two bugs found doing it.**

**Charge decay is now continuous at one charge per 3 s** (was a whole charge
dropped every 4 s). `ChargeMeter` treats the meter as one number -- whole
charges plus the fraction of the next -- and drains that, so the bar above the
tower visibly empties instead of sitting still and then jumping. It eats the
part-filled charge first rather than discarding it the instant decay starts,
which previously read as a bug.

**The panel showed the wrong AD, which is why A5 looked broken.** The row read
the resolved stat while damage used `effectiveAD()` including the gold bonus,
so a working passive appeared to do nothing. It now shows the effective value
with the bonus called out (`13 x 10/s (+15)`), and A5 additionally gets a
**passive readout rectangle** in the panel -- live AD bonus, gold tier,
per-charge gain and cap. Readouts are a new kind of panel entry (`readonly`):
drawn in gold, never highlighted on hover, and they consume a click without
doing anything so nothing gets built underneath them.

**"Gold made" is now "Bonus gold"** -- the base income is what any tower would
earn for that damage, so only the part the charge multiplier added says
anything about whether path A is paying for itself.

Two real bugs surfaced while testing this:

- **Charges could never accumulate.** Damage lands on ticks (10/s) but
  `update` runs at 60/s, so five frames in six dealt nothing -- and "dealt
  nothing" was being treated as "out of combat". Decay outran income and the
  meter never left zero. Out of combat now means **holding no target**, which
  is what it should always have meant. (The old stepped decay hid this by
  resetting its idle timer on any damage frame.)
- **A beam kept locks on enemies removed from play.** `updateLocks` only
  checked dead/leaked/in-range, so an enemy taken off the board any other way
  stayed locked -- the tower drained a ghost and counted itself in combat
  forever. It now also requires the target to still be in the live enemy list.

**2026-07-27 (latest 5) — Beam income bug fixed, cash display, charge bar.**

**The bug: a beam tower was outside the economy.** Its gold was gated on the
A3 charge mechanic, so a beam WITHOUT A3 earned literally nothing while a
gunner beside it earned a gold per point of damage. And `baseGoldPerDamage`
was the spec's suggested 1/200 — 200x stingier than every other damage source
in this game — so even WITH A3 it read as ~8 gold for 1500 damage. Both
fixed: the beam now earns at `CASH_PER_DAMAGE`'s rate like everything else,
and A3's charge multiplier applies on top of that rather than being the only
source. 1459 damage at 2 charges is now 2918 gold, not 8.

`baseGoldPerDamage` is still the number to move if path A self-funds too
easily — it is a §10 tune-in-playtest parameter — but 1/200 was not a tuning
choice, it made the tower unable to participate in the economy at all.

**Cash is displayed to one decimal.** Lifesteal ratios, charge multipliers and
mitigation all produce fractions, so the HUD was showing
"$8.454662500000001". The stored value keeps full precision; only the readout
is rounded, and whole numbers print without a pointless ".0".

**A3's charges are now visible on the tower** — a bar above it filling toward
the next charge, with the count beside it. The bar shows a FRACTION rather
than raw damage because each threshold is 65% larger than the last, so a
damage number tells you nothing about how close the next charge is.

**2026-07-27 (latest 4) — Sandbox: gold and base HP are settable.**

Neither could be tested before. The beam tower's A5 reads the player's gold
live, and its B5 needs 10 000 base HP to unlock, so both had to be reachable
directly rather than by playing toward them.

The sandbox's infinite-cash top-up is now a toggle rather than unconditional,
because it fought the new control: a value you set was overwritten on the very
next frame. Setting gold by hand switches the top-up off automatically; the
checkbox turns it back on. Presets jump straight to the A5 tier boundaries
(0, 10k, 50k, 100k, 200k, 400k, 800k) and to the numbers around B5's gate
(1, 100, 1k, 10k, 20k). Setting base HP above zero also clears a lost run,
which otherwise leaves the board frozen behind a healthy base.

The sidebar readout shows both live, and deliberately does not write back into
the input boxes -- refreshing them eight times a second would fight anyone
typing into them.

**2026-07-27 (latest 3) — tower_beam, plus three global systems it needed.**

**Written against a Phaser + TypeScript spec, implemented in this project's
own idiom.** The spec's engine choice conflicts head-on with two hard
constraints — no toolchain, must run from `file://` — so Phaser and TS were
not introduced. Everything else in the spec is engine-agnostic, and its §8
architecture (config-driven, keyed mechanic modules, content separated from
logic) is what this codebase already does, so the substance went in unchanged.
**If the Phaser/TS target is real rather than habitual, this is the decision
to revisit, and it is a rewrite of the whole project rather than of this
tower.**

**Three global systems, because they affect everything, not just this tower:**

- **Armor and defense** (`js/systems/mitigation.js`). Two separate stats on
  every enemy: `armor` (flat, per hit) then `defense` (percent, capped 99),
  in that order. Applied inside `Enemy.takeDamage`, which is the single door
  every damage source in the game already goes through, so none of them can
  forget it. **There is deliberately NO damage floor** — an enemy with armor
  >= the incoming hit takes exactly zero, which is what makes armor the hard
  counter to a 1-damage 10-per-second weapon. A `Math.max(1, ...)` anywhere
  in that path deletes the mechanic; a test asserts the zero.
- **Base HP is a free counter.** No upper clamp, and the HUD drops the
  `/ max` denominator once it goes above its starting value. Without this the
  B path's lifesteal cannot reach the 10 000 the B5 requires, making that
  upgrade permanently unbuyable.
- **Continuous-beam weapons.** No projectile: damage lands on a tick at
  `attackRate` Hz, one visual beam per locked target, thickness following
  that target's ramp. Towers may now RETURN gold from `update()` (a beam has
  no bullet to be paid through) and receive a small world context — live
  gold, and a way to heal the base.

**The tower.** Two paths, ten tiers, all numbers in `js/towers/beam.config.js`
and all behaviour in keyed modules: `ramp_per_target`, `def_pierce`,
`charge_to_gold`, `hp_scaling`, `gold_to_power`, `slow`, `lifesteal`,
`death_denial`. Target selection keeps existing locks and only fills free
slots — never re-sorting, because the ramp is per target and re-picking every
tick would quietly delete the tower's damage.

`ConfiguredTower` no longer insists on Longshot's mechanics existing, so it
now loads any config. `StatResolver` accepts the spec's `statDeltas`/`flags`/
`mechanics` vocabulary alongside the existing `deltas`/`grants`.

**Sell value is now half of everything spent** (base + every upgrade), which
is a global economy rule and applies to all towers.

**Three things in the spec worth a decision:**

1. **The 2-5 build's AD.** The table says 5; the per-tier deltas sum to 4
   (base 1 + A2 +1 + B4 +1 + B5 +1). Implemented as the deltas say, and
   pinned by a test that names the discrepancy. A tier needs another +1 if 5
   was meant.
2. **The 2-5 range comes to 125, not 100** — the spec flags this itself.
   Implemented as 125.
3. **`baseGoldPerDamage` at 1/200 is 200x stingier than this game's economy**,
   which already pays $1 per point of damage from every source. As written,
   A3's gold is a rounding error next to the standard payout. The number is
   already listed as a tune-in-playtest parameter; it needs to move a long
   way, or the host economy does.

Defaults taken for the rest of §10: `LOG_COEF` 5, ramp resets when a target
leaves range (same as death), A5's AD bonus fractional rather than floored,
1 u.l. = the existing `UNIT_LENGTH` (the sniper's 250 u.l. is the same scale
the spec cites). Tower HP is stored and displayed but does nothing yet, since
nothing damages towers.

**2026-07-27 (latest 2) — Pierce is a real travelling projectile; the map fills the canvas again.**

**Pierce was still wrong, and the previous "fix" was wrong in a different
way.** It applied the falloff sequence to a list of enemies picked at the
moment of impact, which behaved like a strange area effect: the shot could
"hit" enemies nowhere near its flight path. Now `PierceBullet`
(`js/bullet.js`) is a genuine projectile — fired along a fixed heading,
steered by nothing, and when it touches an enemy it deals its current damage,
spends one point of pierce, steps one place down the falloff curve, and
**carries on along the same line**. It dies when pierce runs out, when
falloff drives its damage to zero, or when it has flown as far as the tower
can shoot.

So "infinite pierce" means the shot keeps going — in a crowd the whole line
*behind the first enemy hit* takes damage, and an enemy standing off that
line takes none. Which enemies are on the line is a property of where they
are standing, not of the tower. At A5's 500 damage the sequence runs
500 → 474 → 449 → 426 … and dies on the 64th enemy, which is the effective
cap the spec describes. Tests pin the projectile count at pierce 0, 6 and
infinite, and pin the line behaviour directly (four enemies through at pierce
3, the whole line at infinite, an off-line enemy never touched, damage
strictly descending).

Two consequences worth knowing:

- **Shots are led.** A straight-line projectile fired at where an enemy *is*
  would miss, because the enemy walks several of its own widths during the
  flight. `LongshotTower.predictedPosition` walks the target forward along
  the path (not along a straight-line velocity guess, which would aim into
  the scenery on a corner) and the shot is fired there.
- **Pierce now rewards placement.** A tower beside the road shoots across it
  and hits one or two; a tower positioned to fire *along* a straight gets the
  whole queue. That is the interesting decision pierce is supposed to create,
  and it falls out of the geometry rather than being special-cased.
- **Claiming is partial for these shots.** A piercing projectile claims
  damage on the enemy it was aimed at, but not on the ones it happens to pass
  through, so two Longshots covering the same crowd can overlap on those.
  The claim invariant was defined for a homing bullet with one known target;
  this is the honest limit of it. Documented in `js/bullet.js` too.

`Bullet.update` now takes the enemy list as a second argument. The homing
`Bullet` ignores it; a straight-line shot needs it, because it has no target
to ask what it ran into.

**The map fills the playable rectangle again.** `AUTHORED_AT_PX_PER_UL` is
now kept equal to the default `UNIT_LENGTH` (both 1.04), which lands the
hand-drawn polyline back exactly where it was drawn for a 1280x720 canvas.
`UNIT_LENGTH` itself is unchanged at 1.04.

**This shifted the balance, and the numbers below moved.** The route is now
~1865 u.l. rather than 1250 while tower ranges stayed put, so a gunner covers
about **5.4% of the path instead of 8%**. Measured over the complete two-wave
run: 1 gunner → 2 killed / 11 leaked / 71 HP (unchanged), 2 gunners → 6
killed / 7 leaked / 88 HP (was 7/6/89), 3 gunners → 9 killed / 4 leaked / 96
HP (was 11/2/98). A lone gunner now takes ~26 s to earn the second rather
than ~19 s. If that is too harsh, the lever is tower range, not the map.

The test helpers now derive fixture coordinates from **both** constants
(`UNIT_LENGTH / AUTHORED_AT_PX_PER_UL`) read live from the game, so retuning
either can no longer invalidate every coordinate in the suites — which had
happened twice by this point.

**2026-07-27 (latest) — Pierce fired one bullet per target (fixed), scale tuned down a third, placing disarms the slot, per-tower damage counters.**

**The projectile bug.** `LongshotTower.update` spawned a `Bullet` for *every*
enemy a piercing shot passed through, so A5's infinite pierce looked like a
shotgun firing dozens of rounds at once. Nothing in the spec ever changes the
projectile count — pierce means one shot *carries on through* the enemies
behind the one it hits. Now one bullet is fired at the primary target and the
rest of the falloff sequence is applied to the enemies behind it at the
moment of impact, via `onHit`. `Bullet`'s `onHit` may now return extra damage,
which the bullet adds to what it reports so the game loop still pays out for
it. Pinned by tests at pierce 0, 6 and infinite.

Applying the follow-through on impact rather than sweeping a line along the
flight path is a simplification, and an honest one while projectile travel is
still undefined (section 7: hitscan vs travelling is a TODO).

**`UNIT_LENGTH` 1.552 → 1.04**, a 33% reduction, because the sniper's range
and footprint read as too large on screen. Worth knowing for next time: this
shrinks the **whole world** uniformly — map, road and both towers — because
the path is authored in u.l. too. It changes how much of the canvas the game
occupies (the map now spans ~900 px of the 1280 px canvas, leaving space on
the right), *not* how big any tower is relative to the map. A tower that
feels out of proportion to the route it guards is a stat to change, not this
constant.

Both test suites carried fixture coordinates in pixels, which this
invalidated wholesale. Rather than hand-patch them and re-break on the next
tune, `tests/run.js` and `tests/sandbox.smoke.js` now pass map coordinates
through a `w()` helper that scales them by the current `UNIT_LENGTH`.
Interface coordinates deliberately do not go through it. One test also
depended on an enemy one *pixel* from the end leaking within a single frame,
which stopped being true when a frame of movement shrank below a pixel — it
now spawns exactly at the end instead.

**Placing disarms the build slot**, at the owner's request — see the Build
bar section, which previously documented the opposite and now records the
reversal and its trade-off.

**Every tower counts the damage it has landed**, shown as the first row of
its panel (`Damage dealt`). Overkill is excluded, so the figure always agrees
with the cash that damage earned. Totals abbreviate past 10k (`12.3k`,
`4.2M`). Both tower types feed it through the same `onHit` callback, so a
future tower gets it by passing one.

**2026-07-27 (later) — The u.l. rescale made permanent, cone re-aim wired up, prices redone for crosspathing.**

**1. Everything is now authored against the 100 u.l. reference tower.** The
gunner IS that reference: its range is exactly 100 u.l. Every legacy distance
was multiplied by 12.5 (range 8 → 100, footprint 0.9 → 11.25, road 1.75 →
21.875, enemy 4 → 50 u.l./s, bullet 45 → 562.5 u.l./s, path 100 → 1250 u.l.)
and `UNIT_LENGTH` divided by the same, 19.4 → 1.552 — so **every distance in
pixels is unchanged** and the map plays exactly as before. The sandbox's
`SCALE` workaround is deleted; there is nothing left to reconcile. Longshot's
250 u.l. range is now 2.5 reference towers and a fifth of the map, instead of
2.5x the whole map.

One knock-on: Longshot's 20 u.l. footprint needs 48 px of clearance from the
road centre line, so it cannot sit as close to the road as a gunner. The
smoke test's placement moved from (700, 505) to (700, 545) for that reason.

**2. Cone re-aiming exists now (spec 5.6).** It was specified and implemented
in `ConfiguredTower.reaim()` but never reachable — nothing called it. It is
now a panel action that appears whenever a tower is in cone mode: clicking it
arms an aiming mode, and the next map click sets the direction. New
`aimingTower` global in game.js consumes that click *below* the panel buttons
and *above* building, so setting a direction can never also place a tower.
Escape cancels; selling or restarting clears it. A live preview cone follows
the cursor while aiming, since the 10 s cooldown makes the commitment real.

**3. Prices now account for crosspathing, which changed them a lot.** The
previous model priced each tier against a single-path progression and was
badly wrong, because the two paths push fire rate in opposite directions:

    B5 alone    fireRate 0.05  -> one shot per 20 s     ->  222 DPS
    B5 + A1     fireRate 0.30  -> one shot per 3.3 s    -> 1260 DPS
    B5 + A2     fireRate 0.30  + pierce                 -> 1903 DPS

Each tier is now priced on the **median** of its marginal DPS gain across
every legal crosspath state it can be bought in. Median, not mean, because
the spread is extreme — A1 gains 6 DPS on a bare tower and 1038 on a B5, a
165x range — and the mean would put A1 at $3050, unbuyable for the player it
is aimed at while still a bargain for the B5 player. New prices: base $75;
A $300/$500/$850/$3800/$13900; B $325/$375/$275/$3400/**$23300** (was $2750
under the single-path model).

The resulting builds price out sensibly: B5+A2 at $15.0/DPS (the gunner's
exact rate), A5+B2 at $21.0, an early A2+B2 at $24.8 — while stopping at pure
B5 with no crosspath is $124.8/DPS, which is the signal that pushes players
to crosspath.

**Still open, and it is a stats problem rather than a pricing one:** path B's
late tiers only function *because* you crosspath into A1. Dropping fireRate
to 0.05 makes pure-B nearly unusable, and no flat per-tier price can be right
when one upgrade swings 165x in value. Either B's fireRate penalties want
softening, or A1's +0.25 does — worth a decision before more towers copy this
shape.

**2026-07-27 — Upgrade/ability buttons in the inspection panel, and derived upgrade prices.**

**Panel.** `inspectionLayout()` now also places one rectangle per *tower
action*, two to a row (so the two upgrade paths sit side by side) with a lone
trailing action taking the full width (the ability). Panel widens 190 → 232
when a tower has actions. A tower opts in by defining `panelActions()` and
`performAction()` — `js/game.js` still knows nothing about upgrade paths or
abilities, it lays out whatever list it is handed, and the gunner (which
defines neither) gets the original panel byte-for-byte. Clicks route through
`runPanelAction()`, which sits *above* Sell in `onClick`'s ordering, and
which hands the tower a small context (`cash`/`spend`/`enemies`/`damage`) so
the economy stays in game.js rather than leaking into tower files.

**No text overlap, enforced not eyeballed.** New `fitText(ctx, text, maxWidth)`
clips with an ellipsis; every string the panel draws goes through it. Stat
rows measure the *value* first and give the label the remainder, so a long
label truncates instead of running under its own number. `tests/harness.js`'s
stub context gained a real `measureText` estimate — without it that code both
crashes and hides layout bugs from the suite. Four new tests in
`tests/run.js` pin the geometry (no overlap, inside the panel, above Sell,
below the last stat row) and the clipping.

**Prices.** `tools/price-upgrades.js` is a reproducible model: it computes
each tier's *effective* DPS — sustained rate through reload, average crit,
average execute over an enemy's life (0.55 × maxBonus, integrated), pierce
with real falloff at a 0.5 conditional discount, assumed 25 live kill-stacks
— and prices the gain at the gunner's $15/DPS plus a mild premium for deeper
tiers. Output is now in the config: base $75; A $95/$275/$700/$3800/$13900;
B $125/$125/$75/$1500/$2750. Both full builds land near $21/DPS, so neither
path is the value pick.

Two findings from that model worth knowing:

- **Path A is ~4× path B's DPS by the spec's own numbers**, hence ~4× the
  price. Not a modelling artefact — A5 pierces a line while B5 fires a single
  huge shot every 20 s. If that gap is not intended, it is the *stats* that
  need revisiting, not the prices.
- **The current economy cannot pay any of these.** Income is $1 per damage
  dealt and the whole two-wave schedule contains 47 HP, so a full run yields
  about $47 — less than the tower's base cost. The prices are internally
  consistent and correctly *ordered*; their absolute scale assumes an economy
  that does not exist yet. Still a section 7 open question, and the reason
  the sandbox runs on infinite cash.

Also fixed a modelling bug in that script before trusting it: the falloff
formula `(d0+20)×0.95ⁿ−20` is not scale-invariant, so normalising to d0 = 1
killed every shot on its second target and priced A3 as a *downgrade*.

**2026-07-27 — Sandbox mode; Longshot is now a real, placeable tower; a targeting bug fixed.**

`sandbox.html` replaces the old static Longshot bench with the **real game
running underneath**: the actual path, enemies walking to the base, towers
shooting, target claiming, leaks costing base HP, placement rules, selling.
`js/sandbox/sandbox.js` overrides exactly three things and nothing else —
cash (infinite), spawning (on demand; a checkbox hands control back to the
real wave scheduler), and the roster (every tower type in the build bar). It
hooks `update`/`draw`/`updateWaves`/`restartGame` by wrapping the globals;
**no line of js/game.js was changed for it**, and deleting the two sandbox
files removes it completely — the same discipline `js/debug-cash.js` follows.

`js/towers/longshot-adapter.js` is the new seam: `ConfiguredTower` knows
config resolution and nothing about this game; `js/game.js` expects a
specific tower-constructor shape and knows nothing about upgrade trees. The
adapter is the only place the two meet, so `js/systems/*` stayed generic and
the gunner stayed untouched. It fires real `Bullet`s (one per pierced enemy,
each carrying its own falloff-reduced damage, each claiming its damage), uses
"first" targeting like the gunner, and feeds kill-stacks.

`js/bullet.js` gained one optional constructor argument, `onHit`, so a tower
whose mechanics depend on its own kills can learn about them. Deliberately a
callback, not a `firedBy` tower reference — bullets still do not know what
shot them, so selling a tower still cannot cancel damage in flight.

**Bug fixed: `js/systems/targeting.js` was mixing u.l. and world space.** It
compared world-space distances directly against `stats.range`/`stats.deadzone`
in u.l. — the exact failure the u.l. system exists to prevent. Invisible in
the old static bench (nothing moved and nothing else was on screen); it would
have made every Longshot range wrong by a factor of `UNIT_LENGTH` the moment
it met a real enemy. Targeting is the collision layer, so it now converts the
radii through `ul()` itself, once per query. Two tests pin it, including one
that retunes `UNIT_LENGTH` mid-test.

**Known conflict, flagged not fudged: the gunner and Longshot were authored
in different u.l. regimes.** Gunner: range 8 u.l., footprint 0.9, on a 100
u.l. map. Longshot: range 250 u.l., footprint 20. Taken literally on the same
map, Longshot's range is 2.5x the whole map and its no-build radius (405 px)
exceeds the playable area — it is placeable *nowhere*. This is a ratio
between two authored numbers, so **changing `UNIT_LENGTH` cannot fix it**.
The sandbox works around it locally (`SCALE = 25` in `js/sandbox/sandbox.js`)
by re-expressing the legacy content in Longshot's regime — every pre-Longshot
u.l. number × 25, `UNIT_LENGTH` ÷ 25, so every *pixel* is identical and the
map/road/gunner look and behave exactly as they ship, while both towers now
coexist. **The shipped game is untouched and still has the conflict.**
Resolving it properly is a balance decision for the owner: either rescale the
legacy content permanently (the same ×25, applied to `js/tower.js`,
`js/enemy.js`, `js/bullet.js` and `PATH_POINTS_UL`), or re-author Longshot's
config downward. Do not pick one unprompted.

**2026-07-26 — Global distance system replaced: `Units`/`Units.m2px()` are gone, replaced by `UNIT_LENGTH`/`ul()`.**

Requested as infrastructure "every tower, projectile, enemy and map element
depends on" -- see "The core invariant: all distances are u.l., converted
once, at the edge" above for the full rule. In one line: `Units.calibrateFromPath`
(the path always being defined as exactly 100 m, whatever its pixel length)
is replaced by a single hand-tuned constant, `UNIT_LENGTH`, and a single
helper, `ul(value) = value * UNIT_LENGTH`.

Touched `js/units.js` (full rewrite), `js/game.js` (`PATH_POINTS` became
u.l.-authored `PATH_POINTS_UL`, converted via `ul()` once in `init()`;
`ROAD_WIDTH_M` → `ROAD_WIDTH_UL`; every `Units.m2px()` call → `ul()`; the
inspected-tower overlay now labels range/footprint with their u.l. values),
`js/tower.js`, `js/bullet.js`, `js/enemy.js` (constants and fields renamed
`*_M`/`*_MPS` → `*_UL`/`*_ULPS`), and Longshot's debug scene (`Units.m2px()` →
`ul()`; the scene now also exposes a live `UNIT_LENGTH` input, since its
canvas re-reads the constant every frame with nothing cached).

`UNIT_LENGTH` starts at 19.4, not the spec's example placeholder of 1 --
that's the value that makes this a drop-in replacement rather than a
re-tuning exercise; see the note in `js/units.js` and above. The path itself
is now u.l.-authored and converted via `ul()` too (not left as fixed pixel
geometry), which is what keeps crossing time invariant to `UNIT_LENGTH` --
verified by `tests/run.js`'s new "changing UNIT_LENGTH" group, which rebuilds
the whole game at half the constant and checks for byte-identical kill/leak/
base-HP outcomes over a 120 s run.

Two tests in that group replaced one old one
(`Units.pixelsPerMeter`/`Units.PATH_LENGTH_M` no longer exist); the
`inspected` panel's "8 m" label test was updated to "8 u.l."; the placement-
clearance test now reads `UNIT_LENGTH` instead of `Units.pixelsPerMeter`.
Every other test in the original suite passes unmodified -- `node
tests/run.js` is 42 tests now (was 40), all passing. Longshot's own 48 tests
and its scene smoke test are unaffected (its systems files never touched
`Units` directly) and still pass.

**2026-07-26 — Longshot: a second tower, a two-path upgrade tree, config-driven.**

Built against a fully-specified request (exact stat tables for every tier and
crosspath combination, exact formulas for pierce falloff/execute
scaling/damage resolution, with numeric verification points). See "The
Longshot tower" section above for the full design summary and the list of
section-7 placeholders left unfilled on purpose.

This removes "tower levels or upgrades" and "multiple tower types" from
Deliberately out of scope -- both were on that list as a guard against
speculative content, not as a permanent ban, and this was an explicit ask,
not a speculative addition. The gunner, `game.js`, and the original 40-test
suite are untouched; Longshot is a parallel system with its own config,
systems files, runtime, tests, and debug scene. `node tests/run.js` (40
tests) and `node tests/long-range-dps.test.js` (48 tests) both pass.

**2026-07-26 — Finite waves, 100 HP base, defeat and full restart.**

Replaced the endless two-second spawn timer with two data-driven waves: five
3 HP enemies at 0.8 s spacing, then a five-second break after the last spawn,
then eight 4 HP enemies at 1 s spacing. `Enemy` now accepts per-instance
starting health so wave strength does not require a second enemy type.

The base now loses each leak's remaining HP. At zero it clamps, freezes the
simulation, and shows a restart overlay; the button or R/Enter resets the
entire run through `restartGame()`. Remaining rather than maximum health makes
partial damage matter, and charging immediately before filtering guarantees
each leak is counted once.

The suite is now 40 tests, adding exact schedule, wave health, leak damage,
loss freeze, and clean-restart coverage. Balance notes were recalculated for
the finite 47 HP schedule. Since 47 is below the base's 100 HP, the current two
waves cannot cause defeat by themselves; the tested loss path is ready for
later waves or other damage.

**2026-07-26 — Test suite, selling towers, temporary debug cash panel.**

*Tests first, at the owner's request*, so changes stop being verified by
clicking around in a browser. `node tests/run.js` — 35 tests, under half a
second, no dependencies, no install. The harness boots the real game against a
stubbed canvas and drives it through real entry points, so it exercises the
same code the browser runs. It reads the script list out of `index.html` so it
cannot drift, and skips `js/debug-*.js`. This does not violate the
no-toolchain rule: the tests need Node, the game still needs nothing.

The suite immediately earned itself twice — it caught a test of mine that
depended on check order in `whyCannotBuild`, and it caught that clicking to
build under an open panel sells the tower instead (correct, and now pinned).

**Selling:** `SELL_REFUND_FRACTION = 0.5`, refund `Math.ceil(cost * 0.5)`, so a
$15 gunner returns $8. Sell button in the inspection panel, or Delete with a
tower selected. `inspectionLayout()` now owns the panel geometry so the button
is drawn exactly where it is clickable. Selling deliberately does not cancel
bullets already in the air, and `splice` keeps the claim ordering intact.

**Debug cash panel** (`js/debug-cash.js`) — the owner asked for it explicitly
and asked for it to be removed afterwards, so it is one self-contained file
plus one `<script>` line, loudly labelled, built in the DOM rather than on the
canvas so no debug code touches the render loop. See its own section above.
The only game change it forced was ignoring keys typed into text fields in
`onKeyDown`, which is worth keeping either way.

**2026-07-26 — Target claiming: towers no longer waste shots on a dying enemy.**
Reported by the owner: two gunners that saw the same enemy at the same moment
both shot it, so against a 1 HP enemy one bullet was pure waste and the second
gunner felt useless. Measured with two gunners mirrored across the road:
**4.00 shots per 3 HP kill, one shot in four thrown away.**

Fixed with in-flight damage claims. A `Bullet` reserves its damage on the
target when constructed and releases it when it lands or loses the target;
`Tower.findTarget()` ignores any enemy whose health is already fully claimed,
and a tower with nothing real to shoot at holds fire instead of firing anyway.
Now 3.00 shots per kill exactly — zero waste — verified both headlessly and in
the browser through the real `update()`.

Priority when two towers do contend goes to the one **earlier along the path**,
which is what the owner asked for and is also correct on its own terms: that
tower is the one whose window is about to close, since the enemy is walking
away from it and towards the other. Implemented by giving each tower a
`pathProgress` and keeping the `towers` array sorted by it, so the update loop
*is* the priority order rather than a second thing that could disagree with it.
`GamePath` gained `closestToPoint()` for this, with `distanceToPoint()`
rewritten as a view onto it so the two cannot disagree about the nearest point.

Note it deliberately does **not** stop two towers focusing a *healthy* enemy —
only the redundant killing blow is blocked.

**2026-07-26 — Economy resolved, build bar, tower inspection.**
Owner picked the starting-stake resolution: `STARTING_CASH = 20`,
`Tower.COST = 15`. Chosen tight on purpose — it buys one gunner, and since one
gunner cannot hold the line you have to earn the second (~18.7 s, verified by
simulating the real code, not by eyeballing a playtest).

Towers are now placed via a five-slot build bar at the bottom centre: arm a
slot, then click the map. `BUILD_SLOTS` holds tower *constructors* so the bar
is type-agnostic — the four empty slots are shape-preservation for later, not
a signal to add tower types. Clicking a placed tower opens a panel showing
damage, range, cooldown and DPS; cooldown and DPS are derived in
`statLines()` from the fields `update()` fires with, so they cannot go stale.

Two things were generalised rather than hardcoded while doing this, because
the alternative was exactly the magic-number bug this file already warns
about: `whyCannotBuild` now takes the tower type instead of assuming a gunner,
and tower-to-tower spacing is the *sum* of the two footprint radii instead of
`FOOTPRINT_RADIUS_UL * 2`. Both are no-ops today and both stay correct when a
second tower type with a different footprint arrives. Tower instances gained
`footprintRadiusUl` / `footprintPx` to support it, and the footprint now also
serves as the click-to-inspect hit box.

**2026-07-26 — Foundation complete.**
Path, enemies (3 HP, one per 2 s, 4 m/s), gunner towers (8 m range, 1 dmg,
1 shot/s), homing bullets, cash at $1 per damage dealt, placement rules
preventing building on the road or on another tower. Meters-based unit system
throughout. Ported from an earlier Godot 4 prototype to plain HTML/JS so the
game runs from a folder with no software installed.
