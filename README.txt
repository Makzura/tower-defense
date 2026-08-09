TOWER DEFENSE  --  v0.5.0
=========================

SWARM, HIVE, BRUTE AND LIVE SHIELDS (2026-08-05)
--------------------------------------------------

  Swarm, Hive and Brute now have full Blender-built directional models and
  grounded eight-frame walks. Swarm is a low six-legged scavenger-tick; Hive
  is a walking brood foundry with an armoured incubator, visible brood cells
  and rear hatch; Brute is a furnace-backed breach engine with overlapping
  armour and huge loaded arms. They are distinct models, not recoloured or
  enlarged versions of Normal.

  Normal, Swarm, Hive and Brute also have shielded variants. A real live
  shield wakes a few compact cyan projectors mounted on the same model, plus
  four thin separated field panels. The moment the shield breaks, the clean
  base model returns and the gold break pulse fades. The projector additions
  occupy only about 2-6% extra opaque area, so the shield is clear without
  turning the enemy into a glowing bubble.

  Their walks advance from distance travelled, using a measured stride for
  each rig, so the tiny tripod, heavy march and Hive chassis do not borrow
  Normal's foot timing or skate along the road. Every base/shield sheet passed
  the per-frame three-pixel edge audit. This is presentation only: enemy stats,
  sizes, paths, hit areas, spawn rules and timing are unchanged.

B5 IMPACT, TARGET LOCK AND STUN READABILITY (2026-08-05)
---------------------------------------------------------

  Arcane Sniper B5's guaranteed fourth round is now unmistakable: a separate
  diamond-headed covenant projectile with split violet rails, orbiting seal
  fragments and forked discharge. Every enemy it physically hits gets a brief,
  compact contact slash, broken seal, flash, shards and grounding ring. This is
  presentation only; damage, pierce, reload cadence, speed and timing are the
  same.

  B5's three-second ability now stays locked to the strongest enemy selected
  when casting starts. Its ritual circle follows that same moving enemy and
  never jumps to a later target; if the target dies or leaks, the strike keeps
  the last valid position.

  Stunned towers now stay visually silent as well as mechanically disabled.
  Directional towers hold their last facing, and the Siphon's live beams are
  hidden until it wakes without throwing away their stored locks or ramp.

THE ART PIPELINE, AND THE SNIPER'S WHOLE TREE (2026-08-04)

  Models are built by Blender scripts in tools/blender/ and rendered to
  sprite sheets in assets/. The scripts are the source; the .blend files
  under tools/blender/preview/ are throwaway output for looking at models
  up close. Regenerate everything with:

      blender --background --python tools/blender/tower_sniper.py
      blender --background --python tools/blender/enemy_normal.py
      blender --background --python tools/blender/enemy_swarm.py
      blender --background --python tools/blender/enemy_brute.py
      blender --background --python tools/blender/enemy_hive.py

  The normal enemy is a connected, stooped carrier now, with its red core and
  inspection windows recessed inside dark housings and cage bars instead of
  reading as bright panels pasted onto the outside. Its eight-frame walk
  plants one support sole in every frame. The runtime aligns the fixed Blender
  ground pivot, then adds contact occlusion between that planted foot and the
  existing down-right cast shadow, so the body no longer looks suspended over
  the road.

  Every legal Arcane Sniper build is represented. The rebuilt anatomy uses
  jointed, faceted forms that keep readable depth while turning. B3 and B4 now
  perform their offering reload with their boots planted; B4's cathedral is a
  separate grounded fixture, so its posts and bell do not follow the organic
  reload pose. A5's mount and B5's shrine foundations remain fixed to the map
  while their weapon or captive aims. B5's four restraints are closed,
  tapered obelisks with stepped feet, alternating faces, caged cores, clevises
  and two connected chain lengths -- real volume rather than flat cards.

  The custom Sniper renderer draws its own faction pad and cast shadow before
  the sprite; the fallback platform is inside the fallback body and otherwise
  would not run. Charge and ritual light use authored points for each model's
  muzzle, coils, chambers, fissures, rune and B5 face glare. Those points are
  projected through the same snapped direction row as the picture, so the
  effects stay attached to the hardware instead of following a slightly
  different continuous aim angle. None of this changes a hit box, muzzle
  simulation, timing, footprint, stat or other gameplay rule.

  The sniper sheets use 48 facings; the four rendered enemy rigs use 8. The A5 and
  B5 final bodies use 512 px and 384 px source tiles so they remain sharp at
  the game's maximum 3x backing scale. Their directions are paged horizontally
  as three 16-row bands; other sheets keep the ordinary row-per-facing layout,
  with one column per animation frame inside each page. The Blender camera's
  0.36-frame rise projects world origin to 86% of the tile height, and runtime
  placement uses that fixed pivot rather than whichever foot happens to make
  the lowest alpha pixel. Every rendered direction/frame tile is audited for a
  three-pixel edge gutter. The current runtime sheets were regenerated under
  ASSET_VERSION 12, and the enemy/Sniper render reported zero edge-gutter hits.

  js/skins/draw-pack.js composites the layers; nothing in it feeds the
  simulation, and deleting its <script> tag restores the built-in models. One
  honest layering limitation remains: A4+B2 needs a partial A4 body redraw to
  restore foreground depth after its underside accent. An exact solution would
  require a separate Blender depth/holdout mask. For four-angle close-up
  contact sheets and inspectable .blend files, run:

      blender --background --python tools/blender/make_preview.py

  Add -- --enemies-only to regenerate just the four enemy base/shield review
  pairs without spending time on every Sniper tier.

  AFTER RE-RENDERING A SHEET, BUMP ASSET_VERSION AT THE TOP OF
  draw-pack.js. Browsers cache these hard and a cached sheet is the wrong
  SHAPE, not merely stale -- it silently draws blank frames.

SHARPER DISPLAY, SAME GAME (2026-08-04)
---------------------------------------
The game still uses the same 1280 x 720 logical world, so placement, ranges,
hit boxes, paths, UI positions, timing and input mapping are unchanged. The
canvas now renders at the physical size of the displayed game and the screen's
pixel ratio, from the original 1280 x 720 floor through a 3840 x 2160 cap.
That makes large and high-density displays substantially sharper without
changing how the game plays.

MONEY NOW COMES FROM KILLS (2026-07-31)
----------------------------------------
Damage no longer pays. Every enemy carries a fixed bounty and pays it once,
when it finally dies. The bounty prices the whole threat -- speed, armour,
shields, revives, abilities -- not just its hit points, and it scales when a
wave sends a tougher version of a type.

  - Shields and healing never inflate a bounty. Chewing through a shell is
    work you do for free, exactly as before.
  - A Revenant pays only after its LAST life, not its first.
  - Creatures a Hive spawns are worth $0, and always were.
  - The Siphon's A3 charge income is untouched -- it is the one deliberate
    exception, and it is that tower's whole economy path.

You now start with $600 instead of a large opening wallet, and the rest of
your guaranteed money arrives as you play: every wave from 1 to 34 pays an
extra share on top of its clear bonus, plus a rising allowance that starts at
$50 and grows by $5 a wave to $215 on wave 34.

TWO NEW ENEMIES (2026-07-31)
-----------------------------
  COLOSSUS        550 HP, $250, very slow, very large, and completely plain --
                  no shield, no armour, no revive, no tricks. A wall you grind.
                  Wave 29 sends one with two Shieldbearers escorting it.

  FRACTAL SLIME   One enemy with six tiers. T0 is 1 HP, and each tier up is
                  four times the health: T5 is 1024. When a slime dies it
                  splits into FOUR of the next tier down, once. A full T3 is
                  85 bodies, 256 HP and $128. Wave 25 sends one T3.
                  Area attacks do half damage to them -- the Warbringer's
                  wedge and the Arcane Sniper's B5. Ordinary piercing shots
                  are unaffected. The Sandbox has a T0-T5 picker.

A REBUILT ENEMY INDEX (2026-07-31)
-----------------------------------
The Index's enemy tab is now a compact list -- appearance, name, HP and bounty,
every enemy on one screen -- with a full card beside it for whichever one you
click: base and effective HP, bounty, speed, armour, defence, size, visibility,
which waves send it, and what its abilities actually do.

TRUER DAMAGE COUNTERS (2026-07-31)
-----------------------------------
Tower scoreboards were quietly losing damage. Hits on Hive-spawned creatures
now count, damage absorbed by shields now counts, and the Arcane Sniper's B5
finally reports what it lands. Overkill still does not count -- hitting a 1 HP
enemy for 3 records 1.

RECRUITS SPEND ONLY WHAT THEY MUST (2026-07-31)
------------------------------------------------
A Rifleman recruit that body-blocks an enemy now loses only the health it took
to kill it. A 35 HP recruit that stops a 1 HP enemy keeps 34 and walks on to
the next one. If the enemy survives the collision, the recruit spends
everything as before. Recruits also walk slightly slower (40 u.l./s), B5's
reach is now 125, and both ranks have new upright mechanical models.

DEBUG: MAX FIELD (2026-07-31)
------------------------------
The purple debug panel and the Sandbox sidebar both have a
"MAX FIELD - A2 / B5 + AUTO" button. It takes every tower already on the board
to exactly A2/B5, ignoring cost, crosspath rules and every other gate, restores
their health, fires each real ability once and leaves it on AUTO.

REPLACEABLE ART (2026-07-31)
-----------------------------
Every tower, enemy, summon, projectile, map, effect and interface icon can now
be replaced by a skin pack without touching game code -- PNG, WebP or SVG.
See MODEL_SKINS_GUIDE.md and the ready-to-copy js/skins/example-pack.js.

SCI-FI COMMAND MENU (2026-07-31)
--------------------------------
The title screen now lives inside the same world as the maps. It is a complete
ley-line command deck with coloured wall panels, recessed machinery bays,
industrial floor markings, circuit trunks, a luminous reactor assembly and a
deep-space communications console with a holographic tactical display.

The title sits inside a framed central terminal. PLAY, Armoury, Index and
Sandbox use dedicated illuminated controls with numbered key plates, mechanical
corner brackets, accent colours and stronger hover feedback. The coin purse is
now an armoury-credit status panel. Button positions, clicks and keyboard
shortcuts are unchanged.

SCI-FI BATTLEFIELDS AND WARBRINGER IMPACTS (2026-07-31)
--------------------------------------------------------
The maps are now complete sci-fi environments rather than gray fields with a
few faint symbols. Each ley-line has its own floor colour, manufactured panel
grid, large inset decks, hazard bays, circuit trunks and luminous road
material. Nine substantial top-down models fill each battlefield: reactors,
power coils, pylons, terminals, tanks, server banks, antennae, ventilation
machinery, holograms and transit gates.

  RUNE CIRCUIT     Cyan command deck and reactor complex.
  MANA COIL        Violet capacitor foundry.
  SIGIL LATTICE    Green sensor and research array.
  NULL MERIDIAN    Red-violet containment facility.
  SHIFTING LEY     Blue phase laboratory.
  TWIN CONFLUENCE  Amber two-gate transit nexus.

The machinery remains scenery: it does not consume build space, change a
route, or alter map difficulty. Roads inherit each facility's palette and have
lit edges plus a segmented energy guide, keeping the paths readable against
the richer floor.

The Warbringer now makes its attacks look as heavy as they play:

  EARTHQUAKE  The battlefield shakes when B5 lands. A radial break opens
              beneath the Warbringer, smaller fissures split across the map,
              and all cracks heal after a short time. The HUD stays still so
              the controls remain readable.

  PATH A      Its hammer wind-up lasts long enough to read from above and
              shows three trailing overhead poses before impact. The landing
              fractures the floor inside the attack's real wedge or full
              circle, then fades without changing damage or timing.

The original runes, sigils, fractures and other small motifs remain as decals
inside the fuller environments.

THREE CAMPAIGN DIFFICULTIES (2026-07-30)
----------------------------------------
PLAY now opens a run chooser with EASY, NORMAL and HARD above the ley-lines.
Pick the schedule first, then the route. The difficulty is shown on the
in-run wave readout, pause screen and result screen, and Restart replays the
same route at the same difficulty.

  EASY    The original 35 waves exactly as they were: 738 scheduled bodies
          and 13 498 effective HP.

  NORMAL  35 denser waves, 851 scheduled bodies and 22 369 effective HP.
          Enemy spacing is tighter, bodies are tougher, and the full
          nineteen-enemy roster appears.

  HARD    35 relentless waves, 962 scheduled bodies and 30 911 effective HP.
          Support enemies repeat, wave gaps are shorter, and the late game
          layers the fastest boss and shield support into the finale.

The five enemies that used to be Sandbox/Index-only now enter Normal and Hard:
the flying Aether Wisp, Shieldbearer, Healer, Vanguard and Camo Heavy. Easy is
untouched. Sandbox has a schedule picker beside its wave toggle, so any of the
three full schedules can be run against a test board.

SELECTIVE v0.4.10 MERGE (2026-07-30)
------------------------------------
This folder remains v0.4.9. Only four pieces were brought across from
v0.4.10.0:

  AUTOMATON RIFLEMAN  Now costs $300. Path B becomes automatic at B3, calls
                      stop-to-shoot recruits at B4, and strengthens both the
                      rifle and recruits at B5. Path A has the newer damage
                      and cadence values.

  FLYING ENEMY        The Aether Wisp is available in the sandbox and Index,
                      and now appears in Normal and Hard campaigns. Ground-
                      only towers cannot target it.

  AUTO ABILITY        The Rifleman's recruit call and Arcane Sniper's B5 nuke
                      have an AUTO switch inside their ability buttons. It is
                      off by default and may be changed even during cooldown.

  MAPS                The four existing maps remain, with Shifting Ley and
                      two-entrance Twin Confluence added. Twin Confluence
                      mirrors each scheduled spawn onto both routes, which
                      meet at one base.

No v0.4.10.0 expansion towers, tower registry, or run-economy rebalance were
imported.

WHAT IS NEW IN v0.4.7
---------------------
Everything you asked for last time, in one go.

WAVES COME THREE SECONDS AFTER YOU EARN THEM. Three things now end a break:
the "Send next wave" button, the last enemy of the wave dying, or the ninety
seconds running out. The first two do not drop the wave on you instantly --
they put three seconds on the clock, enough to look up from whatever panel you
were reading. The ninety-second ceiling still fires on its own.

The practical effect: if your board is clearing its waves, you almost never
wait ninety seconds again. The long break has become a safety net for when you
are STRUGGLING -- with something still walking, you get as long as you need.
A full winning run now takes about twelve minutes instead of about fifty.

THE MIDBOSS HAS A HEALTH BAR ACROSS THE TOP OF THE SCREEN, with its name and
its remaining HP. Wave 35's boss will get the same bar when it exists.

THREE NEW ENEMIES, all of them AFTER the midboss -- the first eleven waves are
still the introduction and are completely unchanged.

  BULWARK (wave 15)   12 HP behind 24 of SHIELD -- twice its own health again.
                      The shield has its own blue bar above the green one and
                      a ring around the body. Break it and the thing DOUBLES
                      ITS SPEED: 45 u.l./s becomes 90, faster than a Fast.
                      The trick is to have the damage ready for the moment the
                      shell pops, not to have more of it.

  REVENANT (wave 21)  16 HP. Kill it and it gets straight back up at full
                      health -- once -- and then never moves again. It is not
                      a second run at your base; it is a body parked in your
                      towers' way, eating the shots meant for the wave behind
                      it. It wears a dashed ring once it has used its life up,
                      so you can see which ones are on their last.

  HIVE (wave 26)      150 HP, crawling at two fifths of a normal's pace,
                      dropping FIVE normals every seven seconds. The Hive
                      itself is an ordinary body and pays ordinarily -- the
                      cost is what comes OUT of it. Every hatchling carries a
                      shield equal to its own life and pays you NOTHING, so a
                      Hive left alive quietly adds forty points of free work
                      to the road every seven seconds, forever. How expensive
                      a Hive is depends entirely on how fast you kill it.
                      Also at waves 30 (three of them) and 33 (two).

WAVES MIX NOW. Wave 12 is eighteen Fast, then a beat, then twelve Swarm, then
another beat, then six tough normals. Most of the back half is like that. Some
waves are still one type on purpose -- every introduction is, so meeting a new
enemy is a question with one answer, and so are all three camo waves.

ENEMIES WALK LIKE A CROWD NOW, NOT LIKE A WAVE. The sideways scatter across
the road was picked by a "spread things out evenly" sequence, which is exactly
why it looked like a sine wave weaving down the road -- it could never let two
enemies bunch up. It is a proper scramble now, so bodies cluster and leave gaps
the way a crowd does, and the spread is close to twice as wide (4 -> 7). It is
still completely deterministic: the same run always plays out identically, so
nothing about the balance became a coin toss.

One consequence to expect: big sprites now hang over the edge of the road. An
enemy is already almost exactly as wide as the road is, so any visible scatter
overhangs -- the old setting did too, just less. If it bothers you, say so and
the honest fix is a wider road rather than a narrower scatter.

TWO MORE WAVES AND A LOT MORE HP. Thirty-five waves now, and 13 500 HP once
shields and second lives are counted -- up from 4308. Plus whatever the Hives
are allowed to add, which is up to you. The curve is much steeper at the back:
wave 34 alone is 1152 HP against the old finale's 540.

Almost every wave from 12 on now sends THREE OR FOUR types at once. The
exceptions are on purpose: the three camo waves (a Smasher would otherwise
sweep them up as collateral without ever buying detection) and the five waves
that introduce a new enemy, where one new problem at a time is the whole point.

FINISHING A WAVE PAYS. About a tenth of what the wave took to clear, roughly
$1350 across a run on top of the usual damage income. It arrives when the wave
is actually OVER, which means whichever of these happens first:
  - you kill the last enemy of the wave, or
  - you press "Send next wave", so the countdown to the next one has started, or
  - the ninety seconds run out and the next wave turns up anyway.
It is worked out from the wave itself, so if a wave is ever retuned its bonus
follows automatically. Wave 35 has no wave after it, so its bonus is paid for
clearing the board -- the same moment you win.

THE BOSS: THE TYRANT (wave 35)
------------------------------
2500 HP, the slowest thing in the game, and it walks in HALFWAY THROUGH wave 35
-- thirty normals go past first, then six seconds of nothing, then it. Eight
Angries and five Bulwarks arrive behind it while it is still crossing, so you
never get to fight it on its own.

IT FIGHTS IN BEATS, NOT ON A TICK. Every attack starts with it STOPPING DEAD
for about a second, with a golden ring closing in on it. That is your warning,
and it is also the trade: every second it spends aiming is a second it is not
advancing on your base.

  THE AIMED SHOT (from the start, every 8 seconds)
  It stops, looks at your whole board, and shoots THE TOWER WITH THE HIGHEST
  DPS -- not the nearest one. 45 damage and a 2 second stun. Two of those kill
  a gunner. You will see the bolt go past three closer towers to reach your
  best one. It is answered by having depth, not by putting something in
  front of your good tower.

  THE LEAP (unlocked by the roar, then it alternates with the shot)
  It stops, JUMPS 50 u.l. FORWARD, and lands with a shockwave that damages
  (30) and stuns EVERY tower within 90 u.l. of where it came down. The jump
  is the nasty part -- it wins back the ground the wind-up cost it, and it can
  drop the fight right into a cluster that was safe a second earlier.

A stunned tower does nothing at all, not even tick its cooldown, and wears a
spinning dashed ring so you can see it.

AT HALF HEALTH IT ROARS. Three rings go out across the screen and five things
happen at once:
  - it gains a 200 point shield out of nowhere (its own cyan bar, top of screen)
  - it gets faster
  - it attacks more often -- every 6 s instead of 8
  - THE LEAP JOINS ITS POOL, and from then on it alternates shot, leap, shot
  - and it calls twenty-one enemies back in from the wave, ALL RUNNING AT 1.5x
    speed: Fasts, Swarm, Normals and Angries, trailing out behind it.

Even after the roar it attacks LESS often than the first version of it did --
four times in forty-five seconds against about twelve. You were right that the
old one was a constant harmless pulse; this one hits hard and rarely.

Its health bar sits across the top of the screen the whole time, named, with
its shield above it.

I named it "Tyrant" as a placeholder since you did not -- it is one line to
change and nothing else depends on it.

HOW TO PLAY (Mac)
-----------------
Double-click index.html.

That is the whole thing. It opens in Safari or Chrome and starts immediately.
Nothing to install, no Terminal, no security warnings.

You now land on a TITLE MENU with four choices:

  PLAY            goes to the six maps, then into a run
  Armoury         the store and your inventory. Buy tower types with meta
                  coins, and choose which of the ones you own go in the build
                  bar. See "META COINS AND THE ARMOURY" below.
  Index           a field guide: every tower with its full upgrade tree, and
                  every enemy. Click any upgrade to see exactly what it does
                  -- the same before/after card the in-game panel shows on
                  hover, so you can plan a build before spending anything.
  Sandbox mode    opens the sandbox: every tower, infinite cash, spawn what
                  you like. Same engine, no scoring.

Enter or 1 to play, 2 for the armoury, 3 for the index, 4 for the sandbox.
From the route cards, the armoury or the index, Escape or the "< Menu" button
comes back. You no longer have to know sandbox.html exists and open it by hand.

Your coin purse is shown top-right on the title screen and in the armoury.

GETTING BACK TO THE MENU MID-GAME: press ESCAPE. That opens a pause menu with
where your run stands, a Resume button and a "Back to main menu" button. The
board freezes while it is open, so nothing leaks past you while you are in
there, and Escape again resumes.

Escape still cancels first. If you have a tower picked up, a tower selected,
or a tower waiting to be aimed, Escape backs out of THAT, exactly as before.
Only when there is nothing left to cancel does it open the menu -- so it never
gets in the way mid-action.

There is no menu button on screen on purpose. It would take up room the whole
run to be used once, and it would sit one stray click away from ending a
thirty-five-wave game.

The same Escape menu works in the sandbox, and the sandbox sidebar also has
"< Back to main menu" under Run.

GAME SPEED (v0.4.6)
-------------------
Bottom-right corner, a little button: click it to cycle 1x -> 2x -> 3x -> 1x.
It changes at any moment during a run, and it applies to EVERYTHING -- enemies,
towers, bullets, cooldowns, slows, the wave countdown, the lot. Nothing runs at
its own speed.

It is a pacing control, not a difficulty setting. The board plays out exactly
the same at 3x as at 1x, just sooner: internally the game still simulates in
the same sixtieth-of-a-second steps, it simply runs three of them per frame
instead of one. So you cannot lose a run by speeding it up, and you cannot
cheese one either.

The speed you pick sticks across a restart. It is your setting, not part of
the run.

NINETY SECONDS BETWEEN WAVES, OR AS LITTLE AS YOU LIKE (v0.4.6, v0.4.7)
---------------------------------------------------------------
The gap between waves was five seconds, which you said was too short. It is
now NINETY, and there is a "Send next wave" button under the wave countdown,
top-left, for whenever you are ready.

Ninety is a ceiling, not a wait. Waiting earns you nothing -- money comes from
damage dealt and never from time passing -- so the break is purely thinking
room: walk the board, read a panel, compare two upgrades on their hover cards,
place something deliberately. When you are done, send the wave.

v0.4.7 added the other two ways out of a break. CLEARING THE BOARD calls the
next wave in by itself: kill the last enemy of a wave and the next one is
three seconds away. And the button no longer drops the wave on you the instant
you click it -- it puts the same three seconds on the clock, so you get a
moment to look up. Clicking with less than three seconds left never pushes the
wave back out; a call can only ever bring it closer.

So in practice: if you are winning, you get three seconds. If you are
struggling and something is still walking, you get the full ninety. That is
the right way round -- the break is there for when you need it.

One thing worth knowing: calling waves in back to back is HARDER than letting
them space out. The enemies arrive in a clump, and a tower that shoots one at
a time gets through fewer of them. Rushing is a real choice, not free speed --
if you want the run over quickly, that is what the 3x button is for.

AUTO WAVE: NEVER CLICKING IT AGAIN (v0.4.6)
--------------------------------------------
Next to the speed button, bottom-right, there is an AUTO WAVE toggle. Turn it
on and you never press "Send next wave" again -- every break is called in the
moment it starts, and the campaign runs itself. A green lamp and the word "on"
tell you it is armed, so when a wave turns up early you know why. (Since
v0.4.7 that means a three-second break rather than none at all -- it goes
through the same call the button does.)

It is beside the speed button rather than beside "Send next wave" for a boring
but important reason: with auto on, the break lasts three seconds, so a toggle
that only showed up during breaks would be one you had three seconds at a time
to find.

Same warning as above, and it matters more here: auto wave is not an easy
mode. It is the DENSEST way to play, because waves stop being spaced out at
all. If you are trying to clear a route for the first time, leave it off and
use the breaks. Turn it on when you already know a route and want to get
through it.

It stays on across restarts, like the speed setting. Both are yours, not the
run's.

There is also "Play Tower Defense.app" if you want a proper app icon. The
first time you open it macOS will refuse, because it is not code-signed:
right-click it, choose Open, then click Open in the dialog. Once only.

The "windows (not needed on mac)" folder holds a Windows launcher. Ignore it.

CHOOSING A MAP
--------------
The game now opens on a map chooser instead of dropping you straight onto the
road. Six maps, one card each. Click one, or press its number.

  Rune Circuit    NORMAL   0.83   your original map, unchanged
  Mana Coil       EASY     0.57   a tight serpentine
  Sigil Lattice   NORMAL   0.89   six wide switchbacks
  Null Meridian   HARD     1.06   one long shallow sweep
  Shifting Ley    NORMAL   0.91   deterministic generated polyline
  Twin Confluence NORMAL   0.86   two entrances, one shared base

When a run ends -- won or lost -- the screen has THREE buttons: "Restart <map>"
plays the same route again, "Choose another route" takes you back to the
cards, and "Main menu" leaves for the title screen. R or Enter restarts, M
opens the chooser, Escape goes to the menu.

Main menu is new in v0.4.6. The other two both start another run, so there was
no way out of the run loop at all -- which was a problem, because the coins
that same screen has just paid you are spent in the ARMOURY, and the only way
to get there was reloading the page.

The difficulty is not a label anyone typed in. The game measures each route and
works it out, so the card can never claim something the map does not back up.
What it measures, and why, is the next section.


WHAT MAKES A MAP HARD -- AND WHAT DOESN'T
-----------------------------------------
Length, number of turns, and where the turns are. Two of those three behave
differently than they look. Worth reading, because it changes how you would
draw a fifth map.

THE ONE THAT MATTERS: how much road one gunner can shoot.

A gunner reaches 100 u.l. and has to stand at least 22.2 u.l. off the road.
Beside a plain straight stretch that works out to 195 u.l. of road it can
cover -- and that number is the same on every map, because both figures are in
u.l. So the only way a map changes a tower's worth is by putting MORE road
inside its circle.

That is what loops do, and it is a big effect:

  Mana Coil      a good spot covers 334 u.l. of road
  Null Meridian                     203 u.l.

Same tower, same price, well over half again the work. Loops make a map much
easier, and this is the measurement of it.

TURNS ALONE BARELY DO ANYTHING.

A corner helps a gunner tucked into the inside of it and hurts one sitting on
the outside, and the two cancel out to almost exactly the plain-straight
figure. So a map with lots of corners is not easier than a map with none. What
matters is whether a turn brings the road back NEAR ITSELF.

Sigil Lattice is the demonstration: six switchbacks, and still a normal map,
because they sit 301 u.l. apart -- wider than a gunner can reach across. Pull
those same six switchbacks closer together and it becomes a second Mana Coil
without adding a single turn. Mana Coil's folds are 106 u.l. apart, well inside
a gunner's 100 u.l. reach on both sides at once.

LENGTH MATTERS LEAST, and not for the reason you would expect.

Every enemy walks past every tower no matter how long the route is. So length
does not change how much damage a tower does -- it gets its shots in either
way. What length actually changes is HOW LONG UNTIL THE FIRST LEAK:

  Null Meridian   1446 u.l.   first enemy reaches your base at 29 s
  Mana Coil       3510 u.l.                                   70 s

A short map gives your economy less time to get going before the base starts
taking hits. That is the whole of the length effect, and it is why Null
Meridian is the hard one despite being the shortest.

The score on each card combines those: mostly coverage, a little length. 1.00
means "as hard as a plain straight road of reference length", which is roughly
the hardest this geometry gets. Under 0.65 is easy, under 0.93 normal.


HOW DIFFERENT DO THEY ACTUALLY FEEL?
------------------------------------
Not guesswork -- the real game, both waves, with gunners placed on each map's
best ground, simulated through the actual code:

                          2 gunners    3 gunners
  Mana Coil (easy)          96 HP        100 HP
  Rune Circuit (normal)     89 HP        100 HP
  Sigil Lattice (normal)    86 HP        100 HP
  Null Meridian (hard)      85 HP         99 HP

The order is right, but the spread is modest, and that is worth saying rather
than overselling it. The reason is your gunners: against these waves they are
already firing flat out every single second, and a tower that never stops to
breathe does not care how much road it can see. Map shape only starts paying
once a tower would otherwise be sitting idle.

That table measures the OPENING (the original first two waves). The full
ten-wave campaign tests the geometry much harder: simulated with six gunners
built as cash allows, Mana Coil ends a winning run around 82 base HP while
Null Meridian scrapes home around 24 -- and four gunners win on the easier
routes and lose outright on the harder two. The map you pick finally matters
for the whole run, not just the first minute.

THE ORIGINAL THREE ENEMY TYPES
---------------------
You asked for a fast and a slow alongside the normal enemy. All three:

  normal   4 HP    50 u.l./s     crosses the reference map in ~37 s   red
  fast     2 HP    87.5 u.l./s   crosses in ~21 s                     yellow
  slow     7 HP    40 u.l./s     crosses in ~47 s                     purple

The fast and slow speeds are stored as MULTIPLIERS of the normal walking speed
(1.75x and 0.8x), exactly as you described them, not as raw numbers. So if you
ever retune the base speed, all three move together and stay in proportion.
Their health is stored as plain numbers, because 2 / 4 / 7 are three separate
balance decisions rather than one number scaled three ways.

You will notice the normal enemy is now 4 HP, not 3. You described it as 4 and
the code said 3, so I asked, and you chose to make it genuinely 4. Wave 1 used
to send 3 HP enemies and now sends 4. Everything downstream of that -- the
balance numbers further down this file -- was re-measured, not guessed.

Telling them apart on screen: colour, plus a shell that gets thicker the
tankier they are. The original three are all the same SIZE, because the size of
an enemy is also how big a target it is to point at with the mouse, and that is
tuned to sit clear of the blue "slowed" ring. The v0.4.5 types below DO vary in
size -- a Swarm is a speck, the Midboss fills the road -- and the rings are now
worked out from each body's own radius, so the clearance holds at any size.

THE WAVES SEND ALL THREE NOW (v0.4.0). Waves 1 and 2 are your original
normals, untouched; from wave 3 the schedule mixes in fast swarms and slow
columns, exactly through the one-word mechanism described before:

  { count: 8, type: "fast", interval: 0.6 }     <- wave 3, as shipped

This was done under your blanket "make the game better" ask -- no new types
were invented, only the ones you already approved are used. The whole
schedule is one array at the top of js/game.js if you want to reshape it.

SIX MORE TYPES (v0.4.5), the ones you asked for
-----------------------------------------------
  Swarm         1 HP, 1.3x speed. Arrives in heaps -- wave 23 sends forty.
                Nothing survives a hit; the problem is how MANY hits you can
                land per second, which is a different problem from a tank.
                Waves 7, 15, 23.
  Armored       4 HP (a normal's) behind 20% defense. Percentage mitigation:
                every hit is taxed a fifth. Your gunner's 1 damage becomes
                0.8. Annoying, never impossible. Waves 9, 21.
  Brute         40 HP behind 5 FLAT armor, walking at just over half speed.
                FLAT is the important word. Five is subtracted from every hit
                BEFORE anything else, and there is no minimum -- so a gunner
                (1 damage) and the Siphon's beam (1 damage, ten times a
                second) do literally NOTHING to a Brute. A plain $75 Longshot
                (10 damage) is the cheap answer; the Smasher's 12 works too.
                That is the counter working exactly as the armor system was
                written to work, not a bug to report. Waves 18, 28.
  Camo Normal   Same numbers as a normal and a fast. The catch is that no
  Camo Fast     tower can SEE them without detection, and only two upgrades
                grant it: the Longshot's A1 ($300, on top of the $75 tower)
                and the Siphon's B1. A board of gunners and smashers watches
                a camo wave walk straight past. They are drawn faded with a
                dashed ring so you can see what is happening rather than
                wonder why nothing is firing.
                Waves 13 and 16 are small on purpose -- 24 and 16 HP -- so
                you can afford to let them through while you save up. Wave 26
                is 64 HP and you cannot. Buy a Longshot and take A1.
  Midboss       250 HP behind 10% defense, at 0.45x speed, ONE of them, on
                wave 11. It is a checkpoint: the base pays an enemy's
                REMAINING health when it leaks, so a Midboss that gets
                through untouched ends the run on the spot. Wave 11 is asking
                whether you have actually built anything yet.

THE ANGRY ONE (v0.4.6), and towers that can die
------------------------------------------------
  Angry         14 HP, 0.7x speed, and it HITS YOUR TOWERS: 20 damage every
                2.5 seconds to the nearest one within 47.5 u.l. Waves 13 and
                26 (the late ones are 30 HP each).

This is the first enemy that does anything except walk, and it needed towers
to have hit points, which they now do:

  Gunner    60 HP    three swings and it is gone
  Smasher   150 HP   eight swings
  Longshot  100 HP base, up to 1450 with the B path
  Siphon    from its own stat table, and its B path is enormous

A tower at 0 HP is DESTROYED and removed from the board. You get a health bar
over any tower that has been hit -- an undamaged board shows nothing, so a bar
appearing is itself the warning -- and a "destroyed" popup when one goes.

It hits ONE tower, the nearest in reach, not everything around it. And it only
reaches what is close to the road, so a tower tucked behind a loop is safe.
The counterplay is real: kill it before it settles in, or accept losing a $15
gunner rather than a $200 Smasher.

WHILE I WAS THERE: your Longshot's B5 now dies, as you expected
---------------------------------------------------------------
You said the B5 ability "should kill him after 5 or so use but right now he
reach 0/0 HP and doesn't die". That was exactly right, and it was one bug with
the above: the ability always burned 300 permanent max HP per press against
1450, so five presses was always the intent -- but nothing in the game was
watching for a tower at zero, so it sat at 0/0 and kept firing.

Now it dies on the FIFTH use and comes off the board. A tower whose MAXIMUM has
been burned to nothing counts as destroyed, which is that 0/0 case by name.

AND THE SIPHON'S B5 PRICE
-------------------------
It was 60 000, against an unlock requirement of 5000 healing done. That is
twelve times the gate and about fifteen times what a whole run pays out, so the
tier went green and then stayed unbuyable forever -- worse than being locked.

It is now 5000: the price IS the requirement. The run that heals 5000 is a run
that can pay for what the healing unlocked. If you retune either number, move
both -- they are a pair now, the same way the $20 stake and the $15 gunner are.

RANGE CIRCLES ONLY WHEN YOU CLICK A TOWER (v0.4.6)
---------------------------------------------------
Every tower used to paint its own range circle all the time. With sixty-odd
towers on the board that was a fog you could not see the road through. Now a
tower shows its reach only while you have it selected.

Two things deliberately kept: the Smasher still flashes its wedge when it
swings, because that flash is how you see what got hit; and the Siphon's beams
are always drawn, because those are the tower working, not an indicator.

THE SMASHER NOW HITS CAMOS CAUGHT IN ITS SWING (v0.4.6)
--------------------------------------------------------
You reported this: an AoE tower would not damage a camo standing inside its
range while it was busy hitting something else. That was a bug and it is fixed.

The rule everywhere else in the game was already the right one -- camouflage
hides you from being AIMED AT, not from a blow that is already landing. A
Longshot's piercing shot has always hit whatever is on its line, and the
Smasher's own B4 blast has always caught whatever is near the corpse. The
swing itself was the odd one out. Now it is not: a Smasher bringing its hammer
down on a visible enemy flattens every camo in the wedge along with it.

What has NOT changed is that a Smasher still cannot answer a camo wave on its
own. It will not spend a swing unless it can see something in reach, and since
every wave is a single type, a camo wave gives it nothing to swing at. Waves
13, 16 and 26 still need real detection -- the Longshot's A1 or the Siphon's
B1 -- exactly as before.

UPGRADE PREVIEWS NOW SHOW THE DPS CHANGE (v0.4.6)
--------------------------------------------------
Hover any upgrade button and the card beside it now ends with a DPS row:

  DPS       3.0 -> 4.0   +1

That was the missing number. Damage and attack speed were both there, but the
thing you actually care about is what they multiply out to, and you had to do
it in your head -- twice, once for each branch -- before you could compare.

The Smasher's A1 and B1 are the clearest example. One buys +4 damage, the
other swings a second faster; they read completely differently on the buttons
and they are worth exactly the same, 3.0 DPS to 4.0. The row is the only place
that was visible.

It is measured on YOUR tower, not read off a table, so crosspathing is
included: buy A1 first and the same B1 is then worth 4.0 -> 5.3, because it is
speeding up a heavier hammer. The Index screen shows the same cards, so you can
work a whole build out before spending anything.

META COINS AND THE ARMOURY (v0.4.6)
------------------------------------
Coins are the one thing that survives a run. You earn them by how far you got:

  2 coins per wave cleared, plus 60 for clearing the whole campaign.

They are saved in the browser, so they are still there tomorrow. (Technically:
localStorage, which works fine from a double-clicked file. If your browser
refuses -- Safari private mode does -- the game still plays perfectly, it just
forgets your coins when you close the tab. It will never crash over it.)

You start owning the GUNNER and the SMASHER. The store sells:

  Longshot    40 coins
  Siphon     150 coins

Buy one and it drops straight into your build bar. The Inventory tab shows the
bar as it will appear in a run, and you can click a slot to empty it or pick a
tower's card to put it back.

WHY THE LONGSHOT IS THE FIRST THING TO BUY, and why run one is a loss

Your starting kit cannot beat the campaign, and that is on purpose. Gunners and
Smashers have no camo detection, and the camo waves total more than your base
has. I simulated a fresh profile on all four routes: it loses somewhere between
wave 17 and wave 30, and pays 30 to 56 coins for the attempt.

The Longshot costs 40. So the run that shows you what you are missing is the
run that pays for the answer -- take its A1 upgrade in-game and camo becomes
targetable. With that, the campaign is winnable on every route.

One rule the armoury enforces: you cannot empty the build bar, and you cannot
leave yourself with nothing you can afford on turn one. Unequipping the Gunner
so that only the $800 Siphon remains would hand you a board you could never
build on -- $20 stake, no affordable tower, no damage, no income, ever. It
refuses, and tells you why.

WHAT THIS DOES TO THE STRATEGY, measured rather than guessed
-----------------------------------------------------------
I drove the real game through the whole schedule on all four routes, and
re-ran it after the Angry enemy and tower deaths went in:

  building nothing              loses on every route, waves 7 to 11
  gunners only, best ground     loses on every route, waves 17 to 30
  your STARTER kit              loses on every route, waves 17 to 30
  (gunner + Smasher)
  gunners, then Longshots,      WINS on every route: 60 base HP left on Rune
  with A1 around wave 18        Circuit, 57 on Mana Coil, 72 on Sigil Lattice,
                                17 on Null Meridian

Those winning runs lose between 3 and 18 towers to Angry enemies on the way,
and still win -- so losing towers is a cost, not a disaster.

The second line is the change worth knowing about: in v0.4.4 a board of nothing
but gunners could win. It cannot any more. Camo and flat armor are counters,
and a board with no answer to them is supposed to fall short. Null Meridian is
now genuinely hard rather than merely harder.

They are all in the index screen (Enemies tab) with their real numbers, drawn
by the same code that draws them on the road.

THEY NO LONGER WALK IN SINGLE FILE (v0.4.5)
-------------------------------------------
Every enemy now picks a lane: a small sideways offset from the middle of the
road, up to 4 u.l. either way, kept perpendicular to the road so it follows
the corners. A wave of thirty Swarm used to be one caterpillar of overlapping
dots; now it spreads across the tarmac and you can see how many there are.

Two things worth knowing about how it is done:

- The offset is NOT random. It comes from a fixed sequence, reset at the start
  of every run, so the same run always plays out identically. Random numbers
  in the simulation would make every measured balance figure in the test suite
  a coin toss, which is why the only Math.random() in the whole project lives
  in the cosmetic effects file.
- It is a real position, not a drawing trick, so towers measure their range to
  where the enemy actually is. That means it very slightly changes how long
  each enemy spends inside a tower's circle -- about 1% either way. Small, but
  real; see the note at the end of this file about re-measuring.

Do not confuse a SLOW ENEMY with a SLOWED enemy. The slow type is just a walking
speed. A smasher's slow is a temporary debuff on top of whatever the enemy
already was -- a slowed fast is still quicker than a slowed normal.

PLAYING
-------
There are five boxes along the bottom of the screen -- your towers. Two are
filled: the Gunner at $15 and the Smasher at $200. Click one (or press 1 or 2)
to pick it up. The box lights up green.

Now click anywhere off the road to place it. Placing puts the tower down and
lets go of it, so you do not have to click the box again to stop building --
press 1 (or click the box) when you want another. A refused placement keeps
it in hand.

Under your cursor you see two circles: the big faint one is the gunner's
range, the small tight one is its footprint -- the space it physically
occupies. Green means you can build,
red means you cannot, and the reason is printed underneath.

Click a tower already on the board to see its stats. The first rows are the
damage it has dealt and the kills it has taken over its life, so you can tell
at a glance which of your towers is actually earning its place; then damage,
range, attack speed and DPS, a button to choose what it shoots at, and any
upgrades it has.

Every tower reads the same way now. They used to each have their own words for
how often they hit -- the gunner called it a cooldown in seconds, the smasher
"hit speed" in seconds, the sniper a fire rate per second -- so you could not
compare two towers by looking at them. All of them say ATTACK SPEED, in attacks
per second, and DPS always means damage x attack speed against one enemy. A
tower that hits several at once does that much to each of them.

HOVER ANY BUTTON IN THAT PANEL. A card opens beside it with the whole story:
every stat the upgrade would move, with the value before and after, a sentence
explaining each ability it switches on, and a warning if buying it commits the
tower to that branch. Hovering the targeting button explains what the current
mode actually picks.

That panel also has a "Sell $8" button -- selling gives you back half what the
tower cost, rounded up, and frees the ground it was standing on. The Delete
key does the same thing to whichever tower you have selected.

Press Escape to clear everything -- and again, with nothing selected, to open
the pause menu.

Cash is top right. You earn $1 for every point of damage you land. When you
cannot afford a tower its box dims and the price turns red.

Base HP and the current wave are shown at the top left. An enemy that reaches
the end takes its remaining HP off the base. If the base reaches 0, the run
freezes and you get three buttons: replay the same route, go back and pick a
different one, or leave for the main menu. R / Enter restarts, M opens the
chooser, Escape goes to the menu.

WHAT'S IN THE GAME
------------------
- Six maps, chosen after the Easy, Normal or Hard schedule at the start of every
  run. A route card's own rating still measures the shape of its road.
- Nineteen enemy types: fourteen in the original Easy campaign and all nineteen
  in Normal and Hard, including the former Sandbox/Index-only enemies.
- Three thirty-five-wave campaigns. Easy is the original 13 498 effective HP;
  Normal is 22 369 and Hard is 30 911. Shields, second lives and any enemies
  created during play can add more. Most waves mix several types, and defeating
  one pays a tenth of its authored effective HP.
- A title menu: play, the index, or the sandbox. Reachable mid-run too, via
  the Escape pause menu, which freezes the board while it is open.
- An INDEX with two tabs. Towers: all four, base stats, and every upgrade
  tier priced and clickable, with the real preview card. Enemies: all nineteen
  types on a grid that resizes itself, drawn by the same code that draws them on the
  road, with speed, health (including how far the late campaign scales them),
  armor and defense, whether they are camo, bounty, and exactly which waves
  send them. None of it is typed in -- the screen reads the same data the
  game plays, so it can never disagree with what happens on the road.
- A 100 HP base; leaks deal their remaining HP and zero HP ends the run.
- A real ending on both sides: survive all thirty-five waves and the run is
  WON, with a victory screen mirroring the loss screen.
- Feedback on everything: kill bursts, bounty popups, a red pulse when the
  base is hit, and a banner announcing each wave. All drawn in code like the
  rest of the game -- still no images, sounds or files to load.
- ALL FOUR TOWERS, in the build bar, in the real game:
    Automaton Rifleman  $300  burst starter; B path goes automatic and recruits.
    Warbringer          $700  melee AOE wedge with two 5-tier paths.
    Siphon              $800  continuous beam with two 5-tier paths.
    Arcane Sniper       $900  long-range pierce with two 5-tier paths.
- Per-tower targeting: choose which enemy each tower goes for.
- Per-tower scoreboard: damage dealt and kills, since you placed it.
- Cash: starts at $600, then a fixed bounty for every enemy you kill.
  Damage on its own pays nothing -- you are paid for finishing the job.
  Each wave you clear also pays a bonus that grows as the run goes on.
- A five-slot build bar and a stats panel for placed towers.
- Selling towers back for half price ($8 for a gunner), rounded up.
- Gunners coordinate: no two of them waste shots on the same dying enemy.

About those two, in more detail:

  Longshot -- a long-range sniper. Its shots travel in a straight line and
              PIERCE, so where you put it matters: beside the road it clips
              one or two, aimed ALONG a straight it hits the whole queue.
  Siphon   -- a continuous beam. No bullets: it holds a link on its target
              and drains it ten times a second. One path turns damage into
              gold, the other adds targets (up to 50), slows, and heals your
              base off the damage it deals.

  Both need MORE ROOM from the road than a gunner, because their footprints
  are bigger. If a spot goes red, back off the road a little.

Two things the Siphon brought in that affect everything:

  Armor and defense. Enemies can now have flat armor (removed from every
  hit) and percentage defense (applied after it). An enemy whose armor is
  bigger than your damage takes NOTHING -- that is deliberate, and it is what
  keeps a 1-damage-ten-times-a-second tower from being universally good.

  Base HP has no ceiling any more. The Siphon's lifesteal pushes it past 100,
  and its last upgrade needs 10 000 of it.

WAVES AND THE BASE
------------------
The first enemy of wave 1 appears immediately. Its other four enemies arrive
0.8 seconds apart. The five-second break starts when a wave's LAST enemy
appears, then the next wave begins. Ten waves in all:

   1.  5 normal, 0.8 s apart        your original wave 1, untouched
   2.  8 normal, 1 s                your original wave 2, untouched
   3.  8 fast, 0.6 s                first taste of speed
   4.  12 normal, 0.7 s
   5.  6 slow, 1.4 s                7 HP walkers
   6.  14 fast, 0.4 s               the fast swarm
   7.  16 normal, 0.55 s
   8.  10 slow, 1 s                 the tank column
   9.  18 fast, 0.35 s
  10.  14 slow, 0.8 s               end of the first half

  Then the back half, where the SAME three enemies get scaled up:

  11.  16 normal @ 8 HP, 0.5 s
  12.  12 fast @ 6 HP, 0.4 s
  13.  14 slow @ 14 HP, 0.7 s
  14.  20 normal @ 10 HP, 0.45 s
  15.  18 fast @ 8 HP, 0.3 s
  16.  16 slow @ 20 HP, 0.6 s
  17.  24 normal @ 14 HP, 0.4 s
  18.  20 fast @ 10 HP, 0.28 s
  19.  18 slow @ 28 HP, 0.55 s
  20.  30 normal @ 18 HP, 0.35 s    540 HP finale

Note what the back half does NOT do: invent new enemy types. It uses the
"health" field a wave was always allowed to carry, so the roster stays the
three you approved and a scaled enemy is still just a normal / fast / slow --
same colour, same speed, same everything but toughness.

A wave never states a health -- enemies inherit their type's, so there is
still exactly one place in the code that says what a normal is worth.

When an enemy reaches the end, only the HP it still has damages the base.
Hitting a 4 HP enemy down to 1 HP before it leaks therefore costs the base 1,
not 4. If base HP reaches zero, everything freezes under a loss screen (which
now tells you which wave got you, and how many enemies you destroyed).
Restart clears towers, enemies, bullets, cash and wave progress, then begins
wave 1 again with 100 base HP and $20.

SURVIVING ALL TWENTY WAVES WINS. When the last enemy of the last wave is off
the board and the base still stands, the run freezes under a victory screen --
same two buttons as a loss, plus the run's numbers.

THE LENGTH IS ALSO AN ECONOMY DECISION, not just a difficulty one. You earn $1
per point of damage, so the total HP of the schedule IS the money a run can
ever pay you. The schedule carries 3094 HP, so:

  - building nothing genuinely loses (the base falls in the mid-game);
  - a full run pays ~$3100, which is what makes the $800 Siphon buyable at
    all. At the previous 454 HP it never could have been, and it would have
    sat in the build bar permanently greyed out.

ONE THING WORTH KNOWING, because a simulated player fell into it: if you spend
every $15 on another gunner the moment you have it, your balance never climbs
to $800 and you never get a Siphon. Reaching the expensive towers means
deliberately saving. Whether that is the tension you want is your call -- the
run is still winnable on gunners alone.

Wave 1 is still the HARDER of your two openers per second: 4 HP every 0.8 s
(5.0 HP/sec) against wave 2's 4 HP every 1.0 s (4.0 HP/sec). Both are exactly
as you defined them; the escalation starts at wave 3.

THE PURPLE DEBUG BOX -- DELETE IT WHEN YOU ARE DONE
---------------------------------------------------
Bottom right corner, dashed purple border, says REMOVE BEFORE RELEASE. Type an
amount and hit Give to add it, Set to set your cash to exactly that, or use the
quick buttons. Reset puts you back to the real starting $20.

You asked for this for testing, so it is built to come out cleanly. To remove
it:

  1. delete the file js/debug-cash.js
  2. delete this line from index.html:
       <script src="js/debug-cash.js"></script>

That is all of it. Nothing in the game refers to that file, so deleting it
cannot break anything.

THE MONEY PROBLEM -- SETTLED
----------------------------
You asked for cash to start at 0 and pay 1 per damage, and there was a trap in
that: you only earn cash by dealing damage, you only deal damage by having a
tower, so starting at $0 with towers that cost anything is a deadlock -- you
can never buy the first one.

You have now settled it the standard way: a starting stake. $20 to start,
gunners cost $15.

Note how tight that is, because it is doing real work. $20 buys exactly ONE
gunner and leaves you $5. One gunner cannot hold the line (see below), so your
opening is genuinely a decision -- you place one, watch some enemies get
through, and earn your way to the second. I simulated the actual game code:
placing your first gunner beside the long straight, the second one becomes
affordable after about 26 seconds. Over the full campaign one gunner is of
course nowhere near enough -- the simulator that tuned the schedule
(tools/simulate-campaign.js) shows even four gunners falling to the final
waves on the harder routes.

  ONE RULE TO REMEMBER: STARTING_CASH must stay above Tower.COST.
  If you ever raise the gunner's price above $20, or drop the starting cash
  below the gunner's price, the deadlock comes straight back and the game
  becomes unplayable. They are a pair -- change one, check the other.

Bumping the stake to $30 would let you place two gunners immediately and
protect much more of the base from the first wave. That is a calmer opening if
you want it; it also throws away the only interesting decision the game
currently has. Your call.

One detail already handled: overkill does not pay. Hitting a 1 HP enemy for
3 damage earns $1, not $3. Otherwise heavy-hitting towers would print money
against weak enemies later on.

THE ONE EMPTY BOX
-----------------
Four of the five are filled now. The machinery behind the last one is
finished: the bar reads a list of tower types and draws whatever it finds, so
adding a fifth tower is a matter of writing the tower itself and dropping it
in the list. Naming, price, icon, range preview, placement rules and the stats
panel all come along for free -- which is exactly how the Longshot and the
Siphon went in, with no changes to either tower.

I left the last box visible rather than hiding it so the bar does not jump
around and change shape later.

WHERE YOU CAN BUILD
-------------------
Two rules, both derived from geometry rather than hand-picked numbers, so
they stay correct if you change the map:

  Not on the road. Minimum distance from the road centre line is
  (road width / 2) + (gunner footprint radius) = 10.9375 + 11.25
  = 22.1875 u.l.
  That puts a gunner exactly flush against the road edge -- as close as it
  can physically get without overlapping. If you widen ROAD_WIDTH_UL, the
  build rule follows automatically.

  Not on each other. Two towers must be at least the sum of their footprint
  radii apart -- 22.5 u.l. between two gunners. The visible base is drawn as a
  square inscribed in the footprint circle, so what you see is exactly what
  collides -- bases can never visually overlap, even corner to corner. That
  same circle is the tower's click target when you click one to read its
  stats, so all three agree by construction.

THE SMASHER
-----------
Build box 2, or press 2. $200. A melee tower: it stands off the road like a
gunner and does not block anything, but instead of firing a bullet it swings,
and the swing hits EVERY enemy inside its zone at the same instant.

The zone is a 120 degree wedge, drawn on screen all the time so you can see
what it covers. It turns to face the nearest enemy in reach, and keeps its last
facing when nothing is there. Base reach is 31.25 u.l., which is short -- it only
covers about 40 u.l. of road, so placement matters much more than it does for a
gunner.

It waits rather than swinging at empty air. With a 4 second swing and a zone
that narrow, an enemy crosses in under a second, so a smasher that swung on a
fixed rhythm would miss most of them. Instead it holds, and hits the moment
something walks in.

Base numbers: 12 damage every 4 seconds.

SMASHER UPGRADES
----------------
Click a smasher and its panel shows a green button per branch, above Sell. Each
one names the next upgrade on that branch, its price, and what it actually does:

    Path A -> A1
    $150
    +4 dmg, +6.25 u.l. range

Every button says three things before you spend anything: which tier it is,
what it costs, and what it actually does. That last line is worked out from the
upgrade itself, so it can never claim something the upgrade does not do.

Hold the cursor over a button and you get the rest of it:

    Smasher  ·  A1
    $150
    ----------------------------------
    Damage        12 -> 16         +4
    Range     31.25 u.l. -> 37.5 u.l.  +6.25

The same card appears for every upgrade on every tower, and where a tier
switches on an ability -- a slow, a blast on kill, lifesteal, the sniper's
pierce falloff -- it gets a sentence saying what that ability does, with the
numbers taken from the upgrade itself. Tier 3 also warns you that it commits
the tower to that branch, which is the one thing a price tag cannot tell you.

Click to buy. Three things to know:

  - You cannot skip tiers. A2 needs A1, A3 needs A2, and so on. The button
    always offers the next one you are allowed to buy.
  - If you cannot afford it the button greys out and does nothing when clicked.
  - A branch with nothing left to sell you does NOT lose its button. It greys
    out and says why: "MAXED" if you bought every tier, or "path A already
    chosen" if you shut it out. A button that vanishes leaves you guessing.

Two branches. Damage from every upgrade you own adds up:

  A1  $150   +4 damage,  reach 37.50 u.l.
  A2  $225   +5 damage,  reach 43.75 u.l.
  A3  $300   +7 damage,  reach 50.00 u.l.
  A4  $450  +10 damage,  reach 56.25 u.l.,  zone becomes a FULL CIRCLE
  A5  $700  +14 damage,  reach 62.50 u.l.

  B1  $150   swing every 3.0 s
  B2  $225   swing every 2.2 s
  B3  $300   +4 damage,  slows enemies 15% for 2.0 s
  B4  $500   +6 damage,  slows 40% for 2.5 s, and see below
  B5  $800   +8 damage,  slows 65% for 3.0 s

A1, A2, B1 and B2 can all be owned together. But the moment you buy A3, A4 or
A5, the B3/B4/B5 upgrades are locked out forever on that tower, and the other
way round. So the choice that actually commits you is the third one.

That is why the B button still offers B1 and B2 after you have gone down path
A -- those two are never locked. It only greys out once the next one up would
be B3.

Fully upgraded path A is 52 damage every 4 seconds in a full circle out to 62.5 u.l..
Fully upgraded path B (with A1 and A2 too) is 39 damage every 2.2 seconds with
a 65% slow. Path B without any A upgrades is 30 damage.

Slows never stack. If two smashers hit the same enemy, only the strongest slow
applies -- a weak one cannot water down a strong one or extend how long it
lasts. Slowed enemies turn blue and get a blue ring.

B4 also makes enemies that die WHILE SLOWED explode for 3 damage to anything
within 18.75 u.l..

Worth knowing: this is hard to set off, and for a reason I got wrong at first.
The enemy has to survive one swing to pick up the slow, AND still be in range
when the smasher is ready to swing again. That second part is the real problem.
A smasher only covers about a second of road, but swings every 2.2 seconds at
best, so it normally gets exactly ONE swing per enemy walking past. Only B5's
65% slow drags the crossing out long enough for a second swing.

Spawning enemies from the debug box, this is what actually happens:

  B1-B4 (40% slow), 30 HP enemy   no explosion -- never gets a second swing
  B1-B5 (65% slow), 30 HP enemy   no explosion -- dies to the first swing
  B1-B5 (65% slow), 60 HP enemy   explodes

With your 4 HP waves it cannot fire at all, and the 7 HP slow does not change
that either -- a smasher swings for 12. Worth keeping in mind if you ever
wonder whether B4 is broken -- it is not, it is just very conditional at these
numbers.

Selling a smasher refunds half of everything you put into it, upgrades
included, not half of the $200.

WHAT EACH TOWER HAS ACTUALLY DONE
---------------------------------
Every tower's panel has two running totals since the moment you placed it:

  Damage dealt  every point of damage it has landed
  Kills         only enemies it actually finished off

"Damage done" counts what LANDED, not what was swung for. A smasher hitting a
4 HP enemy for 12 counts 4, not 12, because 4 is what it actually did and 4 is
what you got paid for. A hit that does not kill still counts in full -- a
smasher catching five enemies for 12 each counts all 60.

A smasher with B4 gets credit for its explosions too, damage and kills both.

These are per tower, not per type, so you can compare two gunners and see which
spot is actually pulling its weight. Selling a tower throws its record away.

CHOOSING WHAT A TOWER SHOOTS AT
-------------------------------
Click any tower and its panel has a blue "Target: first" button. Click it to
cycle through six modes:

  first       the enemy furthest along the path (the default, and what
              every tower did before this existed)
  last        the one least far along
  weakest     lowest health right now
  strongest   highest health right now
  fastest     whichever is currently moving quickest
  nearest     closest to the tower

Two things worth knowing:

"Fastest", "weakest" and "strongest" used to do very little, because every
enemy was identical. With three enemy types they now mean something: a fast
moves at nearly twice a slow's pace, and their health runs 2 / 4 / 7. Fastest
reads CURRENT speed, so a slowed fast correctly ranks below a fresh normal.
On the scripted waves, which are all normals, they still tie constantly.

When several enemies do tie, the tower picks whichever of them is furthest
along. Without that rule it would flicker between targets every frame.

Smashers use this for which way the wedge FACES, not for what gets hit; a swing
always hits everything inside the arc. Every tower starts on "first". Once a
smasher has A4 the zone is a full circle and facing stops mattering.

GUNNERS DO NOT WASTE SHOTS ON EACH OTHER'S KILLS
------------------------------------------------
You spotted this one: two gunners covering the same stretch of road would both
shoot the same enemy at the same moment. If that enemy only had 1 HP left, the
first bullet killed it and the second hit a corpse for nothing. With two
gunners facing each other across the road it cost a full quarter of your
firepower -- four shots fired per three-HP kill instead of three.

Fixed. A bullet now "claims" its damage the instant it is fired. A gunner
looking for a target ignores any enemy that bullets already in the air are
going to kill, and if that leaves it nothing worth shooting, it simply waits.
Waiting costs nothing -- its cooldown keeps running, so it fires the moment a
real target turns up.

When two gunners do want the same enemy, the one EARLIER along the path takes
the shot and the other holds. That is the right way round: the enemy is walking
away from the first gunner and towards the second, so the first gunner's chance
is the one about to disappear. The second will get another look at it.

Two gunners still gang up on a healthy enemy -- that is not waste, that is just
focus fire. Only the pointless finishing shot is blocked.

The number to watch if you ever suspect this has broken: shots fired per kill.
It should be exactly 3.00 for wave 1 and 4.00 for wave 2 (one damage per shot).
If it climbs above the applicable number, shots are being wasted again.


IMPORTANT: THE WAVES ARRIVE FASTER THAN ONE GUNNER FIRES
--------------------------------------------------------
This is arithmetic, not a bug.

  Wave 1 burst:  3 HP every 0.8 s  =  3.75 HP per second
  Wave 2 burst:  4 HP every 1.0 s  =  4.00 HP per second
  A gunner:      1 damage x 1 shot =  1.00 damage per second

The five-second break gives towers some time to catch up, but the enemies in
either wave arrive faster than one gunner can damage them. Simulated through
the complete two-wave run with gunners beside the long straight:

  1 gunner   ->  2 killed, 11 leaked, base ends at 71 HP
  2 gunners  ->  6 killed,  7 leaked, base ends at 88 HP
  3 gunners  ->  9 killed,  4 leaked, base ends at 96 HP

More towers still help even when they do not kill every enemy, because every
point of damage removes one point from what that enemy can take off the base.

SANDBOX MODE
------------
Open sandbox.html (same as index.html -- just double-click it).

It is the same game, not a separate toy: enemies walk the path to your base,
towers shoot them, leaks take base HP, placement and selling work the same.
Three things are yours to control instead of the game's:

  Money      Infinite by default, or set it to any amount you like. Setting
             a value turns the top-up off, otherwise it would be wiped a
             frame later. The presets are the points where the Siphon's last
             upgrade changes gear.
  Base HP    Set it to anything, including far above 100. 10 000 is what the
             Siphon's last B upgrade needs before you can buy it.
  Enemies    You spawn them -- one, five, a whole wave, or a 500 HP tank.
             The normal wave schedule is off unless you tick it back on.
             The flying Aether Wisp is available here but not in the campaign.
  Towers     Every tower type is in the left sidebar, not just the gunner.

Click a placed tower to inspect it. Its panel shows two upgrade rectangles
side by side -- one per path, each with the next tier's price -- and, once
the tower has an ability, a third rectangle below them. They work on the map
in the normal game too, not just in the sandbox. The left sidebar mirrors the
same buttons. The debug overlay draws that tower's range, deadzone and
footprint with their u.l. values labelled, and there is a UNIT_LENGTH box for
tuning the scale by eye.

About the prices: they are worked out in tools/price-upgrades.js, which
models what each upgrade actually does to damage per second and charges the
same rate the gunner does ($15 per point of DPS). Two things it turned up
that you may want to look at. Path A ends up roughly four times path B's DPS
-- so it costs roughly four times as much, but if that gap is not what you
intended, it is the stats that need changing rather than the prices. And a
full run currently only pays out about $47, which is less than the Longshot's
$75 base cost, so none of this is affordable until the economy grows.

One thing to know: the gunner and Longshot were written with very different
ideas of how big a u.l. is (8 vs 250 range). The sandbox quietly puts them
on a common scale so both are usable together -- the normal game still has
the mismatch. See AGENTS.md if that matters to you.

EDITING THE GAME
----------------
Every file is plain text. Open any of them, save, then refresh the browser
(Cmd-R). Nothing to install, compile, or build.

  index.html      the page; loads the scripts in order
  sandbox.html    sandbox mode (see above)
  js/sandbox/     sandbox wiring; delete it and the sandbox is gone
  js/towers/      Longshot: its config, its systems, its game adapter
  js/systems/     upgrade/stat/targeting/damage systems (tower-agnostic)
  js/units.js     u.l. (unit lengths) <-> pixels
  js/path.js      the road: shape, length, distance queries
  js/enemy.js     movement, health, death, damage reporting
  js/systems/tower-stats.js  the words and units every tower's panel uses
  js/tower.js     targeting, attack speed, footprint, cost
  js/bullet.js    homing projectile; returns damage dealt
  js/game.js      waves, base HP, main loop, cash, placement, selling, drawing
  js/debug-cash.js  the purple test box -- delete before release
  tests/          automated checks, see below

If you use TextEdit: it defaults to rich text and will corrupt these files.
Open the file, then Format > Make Plain Text before saving. Any real code
editor avoids this entirely.

Everything is drawn with code -- no images, no sound files, nothing to load.
That is why it runs straight from a folder with no web server.

THE AUTOMATED TESTS
-------------------
There are automated checks across the core and tower suites. In Terminal,
from this folder:

  node tests/run.js                   the original gunner/wave game
  node tests/content.test.js          maps, flight, targeting, smasher, Rifleman
  node tests/long-range-dps.test.js   the Longshot
  node tests/beam.test.js             the Siphon
  node tests/sandbox.smoke.js         boots sandbox mode end to end
  node tests/soldier-merge-check.js   focused newer-Rifleman merge check

Each finishes in under half a second and prints a line per check. Nothing to
install -- they use only what Node already ships with.

This does NOT change how the game works. The game still opens by
double-clicking index.html with no software at all. The tests are only for
whoever is editing the code; if you never run them, nothing is different.

What they are for: this game's real problems are invisible to the eye. Whether
a gunner is wasting a quarter of its shots, whether a wave starts one interval
late, or whether a leak is charged twice cannot be judged reliably by
watching. The tests measure it. If you change a number and the tests still
pass, you have not broken anything that was previously known to work.


THE U.L. (UNIT LENGTH) SYSTEM
------------------------------
Gameplay is written in u.l. ("unit lengths"), never pixels. One constant,
UNIT_LENGTH (currently 1.04, meaning 1.04 pixels per u.l.), and one helper,
ul(value), are the entire conversion -- ul() is the ONLY place a u.l. number
becomes a pixel one. The road, the path's shape, every tower's range and
footprint, and enemy/bullet speed are all authored as plain u.l. numbers and
converted through ul() when they're actually drawn or compared.

The payoff: change UNIT_LENGTH and every range, speed, projectile and build
rule rescales together, automatically -- and because the path itself is a
u.l.-authored quantity too (not fixed pixel geometry), how LONG anything
takes to happen (an enemy crossing the map, a tower's range compared to that
crossing) never changes, only how big it looks on screen. There is a 10 u.l.
ruler bottom-left so the current scale stays visible. One more thing worth
knowing: the gunner's 100 u.l. range is the yardstick everything else is
measured against, so a tower's range reads directly as "how many gunners
wide" it is.

Rule of thumb: never put a pixel number in gameplay code. Go through ul().

TUNING KNOBS
------------
  The six maps .............. Maps.LIST in js/maps.js (four authored, two
                              fixed-seed generated; converted by Maps.toWorld)
  Which route loads first ... Maps.DEFAULT_ID in js/maps.js
  Overall scale (px per u.l.) UNIT_LENGTH in js/units.js
  Road width ................ ROAD_WIDTH_UL in js/game.js
  Difficulty schedules ...... EASY_WAVES and DIFFICULTIES in js/game.js
  Time between waves ........ WAVE_BREAK in js/game.js (90 s, skippable)
  Auto-send waves default ... autoSkipWaves in js/game.js
  Available game speeds ..... GAME_SPEEDS in js/game.js
  Base HP ................... BASE_MAX_HP in js/game.js
  Starting cash ............. STARTING_CASH in js/game.js
  Enemy kill bounties ....... bounty: on each type in Enemy.TYPES (js/enemy.js)
  Wave clear reward ......... waveReward and the three functions it sums,
                              in js/game.js
  Fractal Slime tiers ....... Enemy.TYPES.fractal_slime.fractal in js/enemy.js
  Replaceable art/skins ..... js/visual-models.js -- see MODEL_SKINS_GUIDE.md
  Gunner cost ............... Tower.COST in js/tower.js
  Sell refund rate .......... SELL_REFUND_FRACTION in js/game.js
  Which towers are in the bar. your Inventory tab -- BUILD_SLOTS is now built
                              from your saved loadout (js/meta.js)
  Store prices, coin payout . CATALOGUE / coinsForRun in js/meta.js
  Tower hit points .......... Tower.BASE_HP, Smasher.BASE_HP, and each config
  Angry enemy's attack ...... Enemy.TYPES.angry.attack in js/enemy.js
  Build box size ............ SLOT_SIZE / SLOT_GAP in js/game.js
  Gunner footprint .......... Tower.FOOTPRINT_RADIUS_UL in js/tower.js
  Enemy HP and speed ........ Enemy.BASE_HEALTH / BASE_SPEED_ULPS in js/enemy.js
  The enemy roster .......... Enemy.TYPES in js/enemy.js
  Targeting modes ........... Targeting.MODES in js/targeting.js
  Smasher stats/upgrades .... Smasher.* and Smasher.UPGRADES in js/smasher.js
  Gunner range/damage/rate .. Tower.BASE_RANGE_UL / BASE_DAMAGE /
                              BASE_FIRE_RATE in js/tower.js
  Bullet speed .............. Bullet.BASE_SPEED_ULPS in js/bullet.js

VALUES I CHOSE FOR YOU
----------------------
  Enemy speed 50 u.l./s. A 37 second walk across the reference route. A
  gunner beside a straight section covers 195 u.l. of road, roughly 3.9
  seconds of contact.

  Bullet speed 562.5 u.l./s. Fast enough that travel time does not distort
  damage output at this range.

  Gunner footprint 11.25 u.l. radius. Chosen so the drawn base stays the
  size it already was while guaranteeing squares never overlap.

  Targeting "first" -- the in-range enemy furthest along the path. Genre
  standard, and still the default; there are now five others to switch to per
  tower. See "Choosing what a tower shoots at" above.

  Firing priority "earliest gunner first" when two gunners want the same
  enemy. See the section above on wasted shots for why that way round.

WHAT WILL BREAK FIRST
---------------------
1. Tower targeting checks every enemy, every frame, for every tower. Fine at
   these numbers, dies around a few hundred enemies. A spatial grid fixes it.
2. Bullets are created and thrown away per shot. Pool them when wave counts
   get real.
3. Placement checks every existing tower on every mouse move. Irrelevant now,
   noticeable at a few hundred towers.

None of these are worth doing yet. Note that (1) is closer than it was: wave
22 puts forty Swarm on the road at once.

ONE THING TO RE-MEASURE ON YOUR MACHINE (v0.4.5, still true in v0.4.7)
------------------------------------------------
The campaign itself IS measured -- I drove the real game through all 35 waves
on all four routes in a browser, which is where the table further up comes
from. What I could not run is the five Node test suites, because the machine
this was written on has no Node at all.

One thing in them is at genuine risk. The lane offsets move every enemy up to
4 u.l. sideways, which changes how long each one spends inside a tower's range
by about 1% -- and the opening's measured figures ("1 gunner kills 2 and leaks
11, base ends at 66") sit right on a knife edge, because a 4 HP normal takes
about 3.9 damage from a single gunner as it walks past. A 1% swing there can
flip a kill.

Those figures are PINNED as numbers in tests/run.js. Please run the suites:

  node tests/run.js
  node tests/content.test.js
  node tests/long-range-dps.test.js
  node tests/beam.test.js
  node tests/sandbox.smoke.js

If the opening-balance tests fail on a kill or a base-HP figure being one or
two off, that is this change and the right fix is to record the new number in
the test (and in AGENTS.md's Balance math section). If anything else fails, it
is a real bug -- tell me what it says.

tools/simulate-campaign.js is stale too. Every building policy it scripts buys
gunners, and gunners can no longer win, so its "greedy building wins on every
route" conclusion no longer describes this schedule. It needs a policy that
buys a Longshot and takes A1 -- which is exactly what I did by hand in the
browser to produce the table above.
