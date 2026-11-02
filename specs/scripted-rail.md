# Scripted rail

Status: agreed direction, not started. Phase 1 of the flight model (the ship in a box around the rail, flying like a plane, wing guns) is done and shipped; this is what comes next.

## Why

The rail will be a protagonist. Levels will have full 360° turns around motherships, planetoids and the like, attacked over several waves, and the paths themselves must be felt. The designer wants total freedom: loops, corkscrews, slowing almost to a stop, whip turns, circling something while looking at it.

Today the rail is a closed Catmull-Rom curve (`figureEight()` in `src/game/flight.ts`) followed at a constant speed (`SPEED`, 100 units/s). Everything else is derived from the curve:

- Heading and slope come from the tangent (`sampleRail()`, `headingOfRail()`).
- Bank comes from the turn rate (`BANK_PER_TURN`, capped at `MAX_RAIL_BANK`, 35°).
- The camera takes a fixed share of that bank (`VIEW_BANK_SHARE`, 25%).
- Attitudes are Euler angles (yaw, pitch, roll in `'YXZ'` order) and are interpolated per angle in `Flight.apply()`.

That is fine for flat curves at a steady speed, but it cannot express the levels above:

- At near-zero speed the tangent says nothing, so the orientation can't come from the curve.
- Euler pitch breaks through ±90° (a vertical loop).
- A corkscrew's roll can't be derived from the turn rate; it has to be authored.
- To circle a mothership, the camera must look at it, not along the path.

## What must not change

These were settled while building phase 1 and are the base the rail engine builds on:

- **Twin control.** The ship and the reticle are independent; the reticle stays in screen space. See CLAUDE.md's input rules.
- **The ship's box.** The ship flies in a box around the rail, defined across the view and anchored to the rail (`SHIP_BOX` in `src/game/play-area.ts`). The camera follows it for `CAMERA_FOLLOW` (20%) by moving only, and the ship moves on screen by the rest. Input stays screen-relative whatever the camera is looking at: thumb right means ship right on screen.
- **The ship flies like a plane.** Its attitude is the rail's direction turned toward its own moves in the box, proportionally to its speed in the box and capped (`TURN_PER_SPEED`, `MAX_TURN` in `src/game/ship.ts`), never toward the reticle. This is deliberately independent of the rail's speed, so it reads the same at any speed. The ship's bank is the rail's bank plus its own.
- **Guns under the wings** fire at the reticle and converge on it.
- **Combat on the rail.** Enemy formations and their bullets live in the rail's frame (`CombatFrame`), not the camera's, so the ship's moves count in full when dodging.
- **The fixed timestep** (`src/core/loop.ts`): all of this advances in `step()`, render only interpolates.

## The rail as tracks over level time

The rail stops being a curve and becomes an animation: several independent tracks over one level time (seconds since the level started).

- **Path:** the points the rail goes through, as a spline, with arc-length parametrization as today.
- **Speed:** a curve of speed over time, which maps level time to distance along the path. It can slow almost to zero, accelerate or pause. The death halt (`Flight.halt()`) eases the speed down on top of it.
- **Orientation:** keyframes of full attitude (heading, slope, roll), stored and interpolated as quaternions. Where none is authored, it is computed from the path as today (tangent plus bank from turn rate). Where keys exist, they rule. This is what allows loops, corkscrews and turning 180° almost on the spot.
- **Camera bank share:** the share of the rail's roll the camera takes. Today it is a fixed 25%; in a corkscrew the camera should take all of it. It becomes a per-section parameter, or the authored orientation simply is the camera's.
- **Camera look:** where the camera looks. Along the rail by default, or toward a point in the world, such as the center of a mothership being circled, as Panzer Dragoon and Sin and Punishment do. How far the camera may turn away from the path needs a limit (start at about 45°): beyond it the ship, which flies along the path, is seen in profile. That can be spectacular, but should be a deliberate choice per section.
- **Waves:** on the same timeline, so an attack starts exactly as the turn that frames it does. Today waves loop on their own clock (`WAVES` and `WAVE_INTERVAL` in `src/game/enemies.ts`), unrelated to the rail.

All tracks are sampled in `step()` at the fixed timestep. The camera rig, the combat frame and the ship read the sampled pose; render interpolates quaternions (slerp), never Euler angles.

## What assumes a constant speed or simple orientation today

Each of these must change with the rail engine:

- **Render interpolation of the camera.** `Flight.apply()` lerps yaw, pitch and roll separately. With loops or 180° turns in half a second this fails; keep previous and current quaternions and slerp them, as `CombatFrame.render()` already does.
- **Flight attitude and the combat frame's orientation.** `Flight.attitude()`, `Flight.railAttitude()` and `keepInView()` build quaternions from Euler angles. They must come from the orientation track.
- **The ship's bank.** It reads `Flight.bank` (derived from the turn rate, capped at 35°). In a whip turn that saturates, which is fine, but an authored roll must take precedence.
- **Enemies.** Their heading and bank add the frame's forward motion as a constant `FLIGHT_SPEED` (`src/game/enemies.ts`). They must use the frame's real velocity for the step, and the frame's real turn rate, which today is only yaw (`CombatFrame.yawRate`).
- **Clouds.** The blanket's layout bounds and its mound clearance come from `railPoints()` (`src/game/clouds.ts`). A new rail must still provide points along its path for this. The blanket moves `CLOUD_SPEEDUP` times faster than the camera for a sense of speed; at near-zero speed it stands still, which is correct.

## Decision: what turns with the rail

Things in the rail's frame turn with the view. In a whip turn that has two sides:

- **For:** a formation flying with the player stays on screen, and its bullets stay fair to dodge.
- **Against:** bullets and shots already in flight turn with the view, so in a 180° turn they would be seen to bend.

Agreed approach:

- Formations that fly with the player, and their bullets, stay in the rail's frame.
- Things fixed in the world (motherships, turrets, planetoids) and their bullets live in world space. This is a new kind of enemy; today only the first kind exists.
- The player's shots are fast (260 units/s, about 0.6 s of life), so the bend should barely show. Check it on the first whip turn before moving them to world space, which would make them lag when aiming during a turn.

## Comfort

A 180° turn of the whole view in half a second can make people sick on a phone.

- Orientation keys ease in and out by default.
- Optionally, the camera follows the rail's orientation through a very stiff spring, which takes the edge off whip turns without losing the sense of turning. If added, it must not make the ship leave the ship area on screen.

## Scenery

- **Clouds overhead:** the cloud blanket is a layer at height 0 and the painted sky is a dome around the camera. A loop puts the clouds overhead, which works.
- **Below the clouds:** flying below the blanket isn't supported and would be separate work.
- **Height:** heights are designed today so the camera stays well above the clouds (rail heights 8 to 38). Levels must keep that, or the blanket's layout must change.

## Tooling

With this much freedom, authoring loops by hand in code will take most of the time. Levels should be data, not code, and need a way to be seen.

- **Level data:** one file per level with the keys of each track. Bundled with the game; no network requests.
- **Debug view:** a URL flag (for example `?edit`) that shows the rail from outside: the path, orientation frames, the ship's box, camera look targets and waves. It also lets you scrub level time back and forth.
- **Option to evaluate: author in Blender.** Animate an empty (or a camera) along a path, with keyed roll and speed, and export it as a glTF animation. three.js's `AnimationMixer`, or reading the animation's keyframe tracks directly, can sample it per fixed step. That gives a proper curve editor, timeline and preview for free. The glTF ships in the repo, so it keeps the offline rule. Things to check:
  - How cleanly position and rotation tracks export.
  - That sampling stays deterministic at the fixed step.
  - How camera look targets and waves are expressed (for example, as more empties and markers on the timeline).

## Order

1. **Rail engine.** Tracks over time, quaternion orientations, speed curve, camera look and camera bank share. Convert the current figure eight into the first level using only automatic orientation, so nothing visible changes. Fix the constant-speed and Euler assumptions listed above.
2. **Waves on the timeline,** and enemies fixed in the world.
3. **Level format and debug view** (or the Blender pipeline), before designing the first real level.
4. **A first real section** to prove it: a slow approach, a whip turn, and an orbit around something while looking at it.

## Tests

- Playwright on every device project, as now: boots offline without console errors.
- The figure-eight level after step 1 renders and plays as before (screenshots).
- A test level with a vertical loop and a near-zero-speed turn runs without NaNs or flips. Check that the camera's up never snaps, for example by stepping the simulation and checking quaternion continuity (dot product between consecutive steps stays close to 1).

## Open questions

- How far the camera may look away from the path before the ship in profile becomes a problem.
- Whether the camera bank share is a per-section parameter or always the authored orientation.
- Whether levels are authored as hand-written data or in Blender (decide after a short spike of each).
