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

/** Half extents of a rectangle on the aim plane, in world units. */
export interface Area {
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/*
 * The ship and the reticle move on their own. The ship has the whole play
 * area; the reticle and the enemy formations live in a smaller rectangle
 * centered in it, the aim area, so the ship can move into the band between
 * the two, out of the line of fire and off what it aims at.
 */

/** Share of the play area (each way) the aim area takes. Too small hurts aiming precision on phones. */
const AIM_SHARE = 0.85;

/** Half extents of the aim area, as slopes. */
export const AIM_SLOPE = { x: PLAY_SLOPE.x * AIM_SHARE, y: PLAY_SLOPE.y * AIM_SHARE } as const;

/** Where the reticle's center can go on the aim plane, keeping it whole inside the aim area. */
export const AIM_AREA: Area = {
  halfWidth: AIM_SLOPE.x * AIM_DISTANCE - RETICLE_RADIUS,
  halfHeight: AIM_SLOPE.y * AIM_DISTANCE - RETICLE_RADIUS,
};

/** Distance from the camera to the plane the ship flies on. */
export const SHIP_DISTANCE = 6;

/**
 * How far below the middle of the screen the ship rests, in world units on
 * its plane: just below a centered reticle. Seen from the camera, which looks
 * a little up, it is then on the rail's line ahead.
 */
export const SHIP_REST_Y = -0.84;

/** Ship extents from its center (including outline and banking), and how far it reaches toward the camera. */
const SHIP_HALF_WIDTH = 1.15;
const SHIP_HALF_HEIGHT = 0.85; // a wingtip at the ship's full bank (45 degrees)
const SHIP_REAR = 1.05;

/** How far the ship's center can go, as slopes, keeping the ship whole inside the play area. */
const SHIP_LIMIT = {
  x: PLAY_SLOPE.x - SHIP_HALF_WIDTH / (SHIP_DISTANCE - SHIP_REAR),
  y: PLAY_SLOPE.y - SHIP_HALF_HEIGHT / (SHIP_DISTANCE - SHIP_REAR),
} as const;

/** Where the ship's center can go on its plane, in world units: the ship area. */
export const SHIP_AREA: Area = {
  halfWidth: SHIP_LIMIT.x * SHIP_DISTANCE,
  halfHeight: SHIP_LIMIT.y * SHIP_DISTANCE,
};

/** The ship's hit sphere, in world units around its center: a little forgiving, smaller than its wingspan. */
export const SHIP_HIT_RADIUS = 0.75;
