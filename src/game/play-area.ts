import * as THREE from 'three';

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
 * Where the ship rests relative to the reticle, as a slope: just below it. It
 * lags behind when the reticle moves fast, and the edges of the play area stop
 * it before the reticle, so the two can cross.
 */
const SHIP_OFFSET_Y = -0.14;
/**
 * Share of the reticle's sideways position the ship follows. Below 1 it stays
 * a little nearer the center, so it angles out toward the reticle: the same
 * amount to either side, and straight ahead with the reticle in the middle.
 */
const SHIP_FOLLOW_X = 0.85;

/** Ship extents from its center (including outline and banking), and how far it reaches toward the camera. */
const SHIP_HALF_WIDTH = 1.15;
const SHIP_HALF_HEIGHT = 1.1; // a wingtip at the ship's full bank
const SHIP_REAR = 1.05;

/** How far the ship's center can go, as slopes, keeping the ship whole inside the play area. */
export const SHIP_LIMIT = {
  x: PLAY_SLOPE.x - SHIP_HALF_WIDTH / (SHIP_DISTANCE - SHIP_REAR),
  y: PLAY_SLOPE.y - SHIP_HALF_HEIGHT / (SHIP_DISTANCE - SHIP_REAR),
} as const;

/** Where the ship wants to be for a reticle at `reticle` (z is ignored). */
export function shipTarget(reticle: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const clamp = THREE.MathUtils.clamp;
  const x = clamp((reticle.x / AIM_DISTANCE) * SHIP_FOLLOW_X, -SHIP_LIMIT.x, SHIP_LIMIT.x);
  const y = clamp(reticle.y / AIM_DISTANCE + SHIP_OFFSET_Y, -SHIP_LIMIT.y, SHIP_LIMIT.y);
  return out.set(x * SHIP_DISTANCE, y * SHIP_DISTANCE, -SHIP_DISTANCE);
}
