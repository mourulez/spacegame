/**
 * The region the ship's center can move in, in world units on the z=0 plane.
 * It is the same on every device: the camera fits it (plus PLAY_AREA_MARGIN)
 * to the screen, and extra screen space only shows more scenery.
 */
export const PLAY_AREA = { halfWidth: 5, halfHeight: 3 } as const;

/** Room around the play area that must also stay visible (covers the ship's own size). */
export const PLAY_AREA_MARGIN = 1.2;
