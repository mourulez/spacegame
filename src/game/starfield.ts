import * as THREE from 'three';

const COUNT = 1500;
const SPREAD = 60; // x/y half-extent
const NEAR = 15; // z where stars wrap (behind the camera)
const FAR = -200;

/** Points streaming toward the camera to sell forward motion. */
export class Starfield {
  readonly object: THREE.Points;
  private readonly positions: Float32Array;

  constructor() {
    this.positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      this.positions[i * 3] = THREE.MathUtils.randFloatSpread(SPREAD * 2);
      this.positions[i * 3 + 1] = THREE.MathUtils.randFloatSpread(SPREAD * 2);
      this.positions[i * 3 + 2] = THREE.MathUtils.randFloat(FAR, NEAR);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    // Fixed pixel size: with attenuation, stars passing near the camera blow up into big squares.
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false });
    this.object = new THREE.Points(geometry, material);
    this.object.frustumCulled = false;
  }

  update(dt: number, speed: number) {
    const p = this.positions;
    for (let i = 2; i < p.length; i += 3) {
      p[i] += speed * dt;
      if (p[i] > NEAR) p[i] -= NEAR - FAR;
    }
    this.object.geometry.attributes.position.needsUpdate = true;
  }
}
