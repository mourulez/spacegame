import * as THREE from 'three';
import { AIM_DISTANCE, PLAY_SLOPE } from './play-area';
import type { Flight } from './flight';

export const BASE_PITCH = THREE.MathUtils.degToRad(7); // looking up from the flight path, so the horizon sits low and the sky dominates

/**
 * The camera plus everything gameplay lives in, riding on the player's real
 * flight (see Flight). play-area.ts coordinates are in this group's space, so
 * the layout on screen never depends on where the aircraft is or how it is
 * oriented; only the world around it moves.
 */
export class CameraRig {
  readonly object = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);

  constructor() {
    this.object.add(this.camera);
  }

  render(alpha: number, flight: Flight) {
    flight.apply(this.object, alpha, BASE_PITCH);
  }

  /**
   * Set the field of view so the whole play area is visible. At aspect ratios
   * of 4:3 and wider the vertical view is fixed and wider screens see more sky
   * at the sides; narrower ones widen the view to keep the full width.
   */
  fit(aspect: number) {
    this.camera.aspect = aspect;
    const halfSlope = Math.max(PLAY_SLOPE.y, PLAY_SLOPE.x / aspect);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfSlope));
    this.camera.updateProjectionMatrix();
  }

  /** The point on the aim plane under a screen position given in normalized device coordinates. */
  aimPoint(ndc: { x: number; y: number }, out: THREE.Vector2): THREE.Vector2 {
    const halfSlope = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return out.set(ndc.x * halfSlope * this.camera.aspect * AIM_DISTANCE, ndc.y * halfSlope * AIM_DISTANCE);
  }
}
