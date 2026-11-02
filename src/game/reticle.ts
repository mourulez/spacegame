import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec2 } from '../core/input';
import { AIM_AREA, AIM_DISTANCE, RETICLE_RADIUS } from './play-area';
import { Steering } from './steering';

/**
 * The reticle is drawn this close to the camera, scaled down to the same size
 * on screen: in front of any scenery, enemy or cloud, so none of them covers
 * it. It ignores depth, so the ship never covers it either, and is drawn just
 * before the shots, so they always show over it.
 */
const DRAW_DISTANCE = 9;
const DRAW_SCALE = DRAW_DISTANCE / AIM_DISTANCE;
/** Draw order in the transparent pass: after the clouds (-1) and explosions (0), before the shots. */
export const RETICLE_ORDER = 1;

/** The aiming reticle the player steers. Drawn over the scenery and the ship, under the shots. */
export class Reticle {
  readonly object: THREE.Mesh;
  /** Current position on the aim plane, in rig space. */
  readonly pos = new THREE.Vector3(0, 0, -AIM_DISTANCE);
  private readonly prevPos = this.pos.clone();
  private readonly steering = new Steering(AIM_AREA);

  constructor() {
    const r = RETICLE_RADIUS;
    const tick = (angle: number) =>
      new THREE.PlaneGeometry(r * 0.08, r * 0.35)
        .translate(0, r * 0.78, 0)
        .rotateZ(angle);
    const geometry = mergeGeometries([
      new THREE.RingGeometry(r * 0.9, r, 48),
      tick(0),
      tick(Math.PI / 2),
      tick(Math.PI),
      tick(-Math.PI / 2),
      new THREE.CircleGeometry(r * 0.07, 12),
    ]);
    // In the transparent pass, after the sky, clouds and effects; see RETICLE_ORDER.
    const material = new THREE.MeshBasicMaterial({
      color: 0xff2d2d,
      toneMapped: false,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.object = new THREE.Mesh(geometry, material);
    this.object.renderOrder = RETICLE_ORDER;
    this.object.scale.setScalar(DRAW_SCALE);
    this.render(1);
  }

  /**
   * `axis`: keyboard direction. `drag`: touch drag in viewport heights.
   * `aim`: a point to jump to (mouse), on the aim plane, or null.
   */
  step(axis: Vec2, drag: Vec2, aim: THREE.Vector2 | null) {
    this.prevPos.copy(this.pos);
    this.steering.step(axis, drag, aim);
    this.pos.set(this.steering.pos.x, this.steering.pos.y, this.pos.z);
  }

  /** Hold still where it is (nothing to interpolate). */
  hold() {
    this.prevPos.copy(this.pos);
  }

  render(alpha: number) {
    this.object.position.lerpVectors(this.prevPos, this.pos, alpha).multiplyScalar(DRAW_SCALE);
  }
}
