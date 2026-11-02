import * as THREE from 'three';
import { STEP } from '../core/loop';
import { AIM_DISTANCE, PLAY_SLOPE } from './play-area';
import type { Flight } from './flight';

export const BASE_PITCH = THREE.MathUtils.degToRad(7); // looking up from the flight path, so the horizon sits low and the sky dominates

/** Camera shake on a hit: short and strong, dying away. */
const SHAKE_STEPS = Math.round(0.45 / STEP);
const SHAKE_ANGLE = THREE.MathUtils.degToRad(2.5); // pitch and yaw, at its start
const SHAKE_ROLL = THREE.MathUtils.degToRad(2); // around the view axis, at its start
// Two unrelated frequencies per axis, so it reads as a jolt rather than a wobble.
const SHAKE_FREQ = { x: [47, 29], y: [41, 23], z: [37, 19] } as const; // rad/s

/**
 * The camera plus everything gameplay lives in, riding on the player's real
 * flight (see Flight). play-area.ts coordinates are in this group's space, so
 * the layout on screen never depends on where the aircraft is or how it is
 * oriented; only the world around it moves.
 */
export class CameraRig {
  readonly object = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);

  // Shake: steps left, and the camera's turn for the current and previous step.
  private shakeLeft = 0;
  private readonly shakeAngle = new THREE.Vector3();
  private readonly prevShakeAngle = new THREE.Vector3();

  constructor() {
    this.object.add(this.camera);
  }

  /** Start a camera shake (a hit). */
  shake() {
    this.shakeLeft = SHAKE_STEPS;
  }

  step() {
    this.prevShakeAngle.copy(this.shakeAngle);
    if (this.shakeLeft <= 0) {
      this.shakeAngle.set(0, 0, 0);
      return;
    }
    this.shakeLeft--;
    const t = (SHAKE_STEPS - this.shakeLeft) * STEP;
    const decay = this.shakeLeft / SHAKE_STEPS;
    const amplitude = SHAKE_ANGLE * decay;
    const roll = SHAKE_ROLL * decay;
    // Phases chosen so every axis is already off center on the first step: the jolt starts at once.
    this.shakeAngle.set(
      amplitude * 0.5 * (Math.sin(t * SHAKE_FREQ.x[0] + 1) + Math.sin(t * SHAKE_FREQ.x[1] + 2)),
      amplitude * 0.5 * (Math.sin(t * SHAKE_FREQ.y[0] + 2) + Math.sin(t * SHAKE_FREQ.y[1] + 1)),
      roll * 0.5 * (Math.sin(t * SHAKE_FREQ.z[0] + 1.5) + Math.sin(t * SHAKE_FREQ.z[1] + 0.5)),
    );
  }

  render(alpha: number, flight: Flight) {
    flight.apply(this.object, alpha, BASE_PITCH);
    const lerp = THREE.MathUtils.lerp;
    this.camera.rotation.set(
      lerp(this.prevShakeAngle.x, this.shakeAngle.x, alpha),
      lerp(this.prevShakeAngle.y, this.shakeAngle.y, alpha),
      lerp(this.prevShakeAngle.z, this.shakeAngle.z, alpha),
    );
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
