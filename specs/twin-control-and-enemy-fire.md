# Twin control, enemy fire, shield and death

Status: agreed design, not started. Build it as a prototype behind `?control=twin`, so it can be compared on a phone with the current scheme, then make it the default once approved (and update CLAUDE.md's input rules, see below).

## Why

Today one control drives everything: the reticle is the master, the ship follows it around a box (±6 × ±4 around the rail, `src/game/flight.ts`) and the camera follows the ship 75% of the way. Enemies and shots live in `CombatFrame`, which rides with the camera.

That works while nothing shoots back, but not once enemies fire:

- With the ship slaved to the reticle, the thing being hit trails the thing being controlled. Rogue Flight uses that scheme and its main control complaint is exactly this: the ship's delay behind the reticle makes enemy fire hard to avoid, and players can't tell where they are or whether they were hit.
- Enemy bullets in a frame that rides with the camera only see the ship's on-screen 25% of its moves (±1.5 × ±1), so dodging is impossible anyway.

Decisions taken in the design discussion:

- The reticle stays the protagonist. Dodging is secondary: few, readable bullets with a clear warning, in the spirit of Space Harrier, not a bullet hell.
- Two independent controls, ship and reticle, with auto-fire kept, so two thumbs are enough on touch.
- The ship keeps its current size. With free positioning, the player moves it out of the way.

## Controls

| Input | Ship | Reticle |
| --- | --- | --- |
| Touch | Drag in the left half of the screen | Drag in the right half of the screen |
| Keyboard | WASD | Arrow keys |
| Mouse | (WASD) | Points directly, as today |

- Touch zones are invisible (nothing drawn), and both drags are relative, like a trackpad: the finger's movement moves the object by a fixed amount, never toward the finger. Position control is much more precise for dodging than a velocity stick.
- A finger belongs to the half it started in, even if it crosses the middle. Track each pointer id (today `Input` tracks a single drag pointer).
- Gains: the reticle keeps today's feel (a swipe of about half the screen height crosses its area; retune `DRAG_GAIN` for the half-width zone). The ship gets an equivalent gain over its own area. Keyboard ship speed similar to the reticle's (`KEY_SPEED`), scaled to the ship's area.
- Auto-fire stays as it is: from the ship's muzzle toward the reticle.
- CLAUDE.md currently says "There is no virtual joystick" and that touch drags the reticle. Once twin control is the default, rewrite that rule: two invisible relative drag zones, ship left, reticle right, nothing drawn.

## Layout (`src/game/play-area.ts`)

Two fixed, nested rectangles in camera slopes, the same on every device, so wider screens still give no extra room:

- **Ship area:** the full 4:3 play area (`PLAY_SLOPE`). The ship's center is limited as today (`SHIP_LIMIT`) so the ship stays whole inside it.
- **Aim area:** a smaller rectangle centered in it, where the reticle and enemy formations live. Start at 85% of the play area, try 80–85% on a phone. Too small hurts aiming precision on phones, the smallest screens.

The ship can move into the band between the two, out of the line of fire and off what the player is aiming at.

## Camera, ship, reticle, frames

- **Camera:** rides the rail itself and no longer follows the ship. It keeps the rail's heading and slope and `VIEW_BANK_SHARE` of its bank. Keep a small lean (about 7°), now keyed to the ship's horizontal position instead of the reticle's. Drop the climb attitude (the camera no longer moves up and down the box).
- **Combat frame:** with the camera on the rail, `CombatFrame` is effectively the rail's frame. The ship's moves now count in full against enemies and their bullets.
- **Ship:** moves freely in the ship area under its own control, with the current critically damped spring (no overshoot). Keeps its size and distance (6 ahead), its share of the rail's bank (`restRoll`), its own bank into sideways moves (max 45°), and its nose pointing exactly at the reticle. Check how it looks when the ship is far from the reticle; the shots crossing the screen diagonally are expected.
- **Reticle:** stays in screen space, moved only by its own input, never recentered. It must always be drawn over the ship (today the ship covers it when they cross). Keep it under the shots, as now.
- **Clouds:** they never cover anything closer than `CLEAR_DISTANCE` (10). Check this still holds with the ship anywhere in its area.

## Enemy bullets

- Simple round bullets: one shared low-poly sphere geometry, one `InstancedMesh` (plus an outline if it reads better), in combat space. Being 3D, they grow naturally as they approach; no scaling tricks.
- Fired by enemies at the ship's position at the moment of firing, in straight lines, slow enough to read (about 1.5–2 s to reach the ship). Few at a time.
- **Warning:** a bullet turns red while it is going to hit. Each step, take the bullet's straight path and find its closest approach to the ship's *current* position. If that miss distance is under the ship's hit radius plus the bullet's, it is red; otherwise it is its normal color. So moving the ship off its path turns it back. Add a little hysteresis (for example, a slightly larger radius to stay red than to turn red) so it does not flicker at the edge.
- **Hit:** segment-versus-sphere test against the ship's hit sphere, like the player's shots against enemies (`segmentHitsSphere`), with the ship's position taken into combat space.
- Fixed timestep, previous/current positions for interpolation, snapping on spawn, no allocations in the loop.

## Hit feedback and shield

- **Camera shake** on each hit: short (about 0.3 s), decaying, small. Its state advances in `step()`; render only reads and interpolates it. Never use the real frame time.
- **Shield bar:** an HTML/CSS bar in the HUD (`src/ui/hud.ts`), sized in viewport units, respecting safe-area insets. It drops by one step per hit. Start with 5 hits to empty and tune.
- Optionally, flash the ship white on a hit, like the enemies do.

## Death (After Burner style)

When the shield reaches zero:

- Player input stops controlling anything. Enemies stop spawning; the ones in flight carry on.
- The camera stops following: it eases to a halt along the rail over about half a second and holds, turning only as much as needed to keep the falling ship in view.
- The ship leaves the camera rig for world (or combat) space with its current velocity: it carries on forward, noses down, spins, and falls under gravity, on fire, trailing smoke (particles, reusing the explosions' approach). It falls into the cloud blanket, which veils it as it sinks in (the clouds already hide what is inside them).
- After about 3 seconds, restart: full shield, ship back at rest, flight resumed. A proper game-over screen comes later.

## Tests

- Playwright, on every device project: the game boots with `?control=twin` without console errors or external requests, and writes `screenshots/<project>-twin.png`.
- The shield bar is present and visible in landscape.
- If practical, a test that drives the ship with the keyboard into a bullet and checks that the shield drops.

## Constraints to keep

- 60 fps minimum on mid-range phones; measure on a real phone (it currently runs at 120 fps on a modern mid-range phone).
- All gameplay in the fixed-timestep loop; render only interpolates.
- Gameplay in world units and fixed slopes, never pixels or the actual screen shape.

## Out of scope (still under discussion)

- Shooting enemy bullets down.
- A dodge action (barrel roll or dash).
- Pickups.
- Sound, other warnings (a cue on the bullet itself, audio), and moving the shield bar next to the reticle.
- Lock-on or aim assist for touch.
