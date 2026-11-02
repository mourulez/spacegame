/*
 * Gameplay layout, in the camera rig's space: the camera sits at the origin
 * looking down -Z. Sizes on screen are given as slopes (offset / distance from
 * the camera), so a slope range is a fixed part of the view at any depth.
 */

/**
 * The play area's aspect ratio: iPad in landscape, the least elongated screen
 * the game runs on. The camera always fits the whole play area; wider screens
 * see more sky at the sides but get no more room to play.
 */
export const PLAY_ASPECT = 4 / 3;

/** Half extents of the play area, as slopes. */
export const PLAY_SLOPE = { x: 0.5 * PLAY_ASPECT, y: 0.5 } as const;

/** Distance from the camera to the plane the reticle moves on. */
export const AIM_DISTANCE = 60;

export const RETICLE_RADIUS = 3;

/** Where the reticle's center can go on the aim plane, keeping it whole inside the play area. */
export const AIM_AREA = {
  halfWidth: PLAY_SLOPE.x * AIM_DISTANCE - RETICLE_RADIUS,
  halfHeight: PLAY_SLOPE.y * AIM_DISTANCE - RETICLE_RADIUS,
} as const;

/** Distance from the camera to the plane the ship flies on. */
export const SHIP_DISTANCE = 6;

/**
 * How far below the middle of the screen the ship sits with the reticle
 * centered, in world units on its plane: just below the reticle, so it never
 * hides it at rest. Seen from the camera, which looks a little up, it is then
 * on the rail's line ahead.
 */
export const SHIP_REST_Y = -0.84;

/** Ship extents from its center (including outline and banking), and how far it reaches toward the camera. */
const SHIP_HALF_WIDTH = 1.15;
const SHIP_HALF_HEIGHT = 0.85; // a wingtip at the ship's full bank (45 degrees)
const SHIP_REAR = 1.05;

/** How far the ship's center can go, as slopes, keeping the ship whole inside the play area. */
export const SHIP_LIMIT = {
  x: PLAY_SLOPE.x - SHIP_HALF_WIDTH / (SHIP_DISTANCE - SHIP_REAR),
  y: PLAY_SLOPE.y - SHIP_HALF_HEIGHT / (SHIP_DISTANCE - SHIP_REAR),
} as const;
