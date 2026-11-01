import * as THREE from 'three';
import { STEP } from '../core/loop';

const COUNT = 1500;
const SPREAD = 60; // x/y half-extent
const NEAR = 40; // z where stars wrap; behind the camera at any aspect ratio
const FAR = -200;

/** Points streaming toward the camera to sell forward motion. */
export class Starfield {
  readonly object: THREE.Points;
  private readonly positions: Float32Array; // rendered (interpolated) xyz
  private readonly z = new Float32Array(COUNT);
  private readonly prevZ = new Float32Array(COUNT);

  constructor() {
    this.positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = THREE.MathUtils.randFloatSpread(SPREAD * 2);
      this.positions[i * 3 + 1] = THREE.MathUtils.randFloatSpread(SPREAD * 2);
      this.z[i] = this.prevZ[i] = this.positions[i * 3 + 2] = THREE.MathUtils.randFloat(FAR, NEAR);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    // Fixed pixel size: with attenuation, stars passing near the camera blow up into big squares.
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false });
    this.object = new THREE.Points(geometry, material);
    this.object.frustumCulled = false;
  }

  step(speed: number) {
    for (let i = 0; i < COUNT; i++) {
      this.prevZ[i] = this.z[i];
      this.z[i] += speed * STEP;
      if (this.z[i] > NEAR) {
        // Snap instead of interpolating across the wrap.
        this.z[i] -= NEAR - FAR;
        this.prevZ[i] = this.z[i];
      }
    }
  }

  render(alpha: number) {
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3 + 2] = this.prevZ[i] + (this.z[i] - this.prevZ[i]) * alpha;
    }
    this.object.geometry.attributes.position.needsUpdate = true;
  }
}
