import * as THREE from 'three';
import { BASE_PITCH } from './camera-rig';
import type { Flight } from './flight';

/**
 * The space enemies and shots live in: it rides with the player and points
 * along the rail (its heading and slope, without the bank or the player's
 * lean). Waves are laid out in it, so they play out the same way on every
 * run, and the player moving around the box never shifts them away
 * from the reticle.
 *
 * Combat space: origin at the player's camera, x right, y up, -z ahead.
 */
export class CombatFrame {
  readonly object = new THREE.Group();
  /** Turn rate of the rail in radians per second, positive to the left. Enemies bank with it. */
  yawRate = 0;

  private readonly pos = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly flightQuat = new THREE.Quaternion();

  snap(flight: Flight) {
    this.step(flight);
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
  }

  step(flight: Flight) {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.pos.copy(flight.pos);
    flight.railAttitude(this.quat);
    this.yawRate = flight.turnRate;
  }

  /**
   * Rotation that takes directions in the camera rig's space (where the ship
   * and the reticle live) to combat space, for the current step. Both spaces
   * share the same origin, the player's position.
   */
  fromRig(flight: Flight, out: THREE.Quaternion): THREE.Quaternion {
    return out.copy(this.quat).invert().multiply(flight.attitude(this.flightQuat, BASE_PITCH));
  }

  render(alpha: number) {
    this.object.position.lerpVectors(this.prevPos, this.pos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevQuat, this.quat, alpha);
  }
}
