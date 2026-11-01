import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STEP } from '../core/loop';
import { AIM_AREA, AIM_DISTANCE, RETICLE_RADIUS } from './play-area';

const KEY_SPEED = 130; // world units per second on the aim plane: crosses the play area in about 0.6 s
const KEY_EASE = 1 - Math.exp(-25 * STEP); // per-step blend toward the key velocity: snappy but still precise for taps
/**
 * The reticle is drawn this close to the camera, scaled down to the same size
 * on screen: just behind the ship, so the ship covers it, and in front of any
 * scenery, so nothing else does, using the depth buffer alone.
 */
const DRAW_DISTANCE = 9;
const DRAW_SCALE = DRAW_DISTANCE / AIM_DISTANCE;
/** Aim-plane units moved per viewport height of touch drag: a swipe of about half the screen height crosses the play area. */
const DRAG_GAIN = 2.6 * AIM_AREA.halfHeight * 2;

/** The aiming reticle the player steers. Drawn over the scenery but under the ship. */
export class Reticle {
  readonly object: THREE.Mesh;
  /** Current position on the aim plane, in rig space. */
  readonly pos = new THREE.Vector3(0, 0, -AIM_DISTANCE);
  private readonly prevPos = this.pos.clone();
  private readonly vel = new THREE.Vector2();

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
    const material = new THREE.MeshBasicMaterial({ color: 0xff2d2d, toneMapped: false });
    this.object = new THREE.Mesh(geometry, material);
    this.object.scale.setScalar(DRAW_SCALE);
    this.render(1);
  }

  /**
   * `axis`: keyboard direction. `drag`: touch drag in viewport heights.
   * `aim`: a point to jump to (mouse), on the aim plane, or null.
   */
  step(axis: { x: number; y: number }, drag: { x: number; y: number }, aim: THREE.Vector2 | null) {
    this.prevPos.copy(this.pos);

    this.vel.x += (axis.x * KEY_SPEED - this.vel.x) * KEY_EASE;
    this.vel.y += (axis.y * KEY_SPEED - this.vel.y) * KEY_EASE;
    if (aim) this.pos.set(aim.x, aim.y, this.pos.z);
    this.pos.x += this.vel.x * STEP + drag.x * DRAG_GAIN;
    this.pos.y += this.vel.y * STEP + drag.y * DRAG_GAIN;

    const { halfWidth, halfHeight } = AIM_AREA;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -halfWidth, halfWidth);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, -halfHeight, halfHeight);
  }

  render(alpha: number) {
    this.object.position.lerpVectors(this.prevPos, this.pos, alpha).multiplyScalar(DRAW_SCALE);
  }
}
