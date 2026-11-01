import * as THREE from 'three';

const SPEED = 8; // world units per second
const BANK = 0.5; // radians of roll at full lateral speed
const PITCH = 0.3;

export class Ship {
  readonly object = new THREE.Group();
  /** Half-extents of the area the ship may move in (set from the viewport). */
  readonly bounds = new THREE.Vector2(5, 3);

  constructor() {
    const hull = new THREE.MeshStandardMaterial({ color: 0xc8d4e6, metalness: 0.6, roughness: 0.35, flatShading: true });
    const accent = new THREE.MeshStandardMaterial({ color: 0x3a6df0, metalness: 0.4, roughness: 0.5, flatShading: true });
    const glow = new THREE.MeshBasicMaterial({ color: 0x66ccff });

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 6), hull);
    body.rotation.x = -Math.PI / 2; // nose points to -Z (away from camera)

    const wings = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.6), accent);
    wings.position.z = 0.35;

    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.1, 12), glow);
    engine.rotation.x = Math.PI / 2;
    engine.position.z = 0.92;

    this.object.add(body, wings, engine);
  }

  update(dt: number, axis: { x: number; y: number }) {
    const p = this.object.position;
    p.x = THREE.MathUtils.clamp(p.x + axis.x * SPEED * dt, -this.bounds.x, this.bounds.x);
    p.y = THREE.MathUtils.clamp(p.y + axis.y * SPEED * dt, -this.bounds.y, this.bounds.y);

    // Ease the tilt toward the input direction so it does not snap.
    const k = 1 - Math.exp(-10 * dt);
    this.object.rotation.z += (-axis.x * BANK - this.object.rotation.z) * k;
    this.object.rotation.x += (axis.y * PITCH - this.object.rotation.x) * k;
  }
}
