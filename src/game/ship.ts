import * as THREE from 'three';
import { STEP } from '../core/loop';
import { PLAY_AREA } from './play-area';

const SPEED = 8; // world units per second
const BANK = 0.5; // radians of roll at full lateral speed
const PITCH = 0.3;
const TILT_EASE = 1 - Math.exp(-10 * STEP); // per-step blend toward the target tilt

export class Ship {
  readonly object = new THREE.Group();

  // Simulation state for the current and previous step; render() interpolates between them.
  private readonly pos = new THREE.Vector2();
  private readonly prevPos = new THREE.Vector2();
  private roll = 0;
  private prevRoll = 0;
  private pitch = 0;
  private prevPitch = 0;

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

  step(axis: { x: number; y: number }) {
    this.prevPos.copy(this.pos);
    this.prevRoll = this.roll;
    this.prevPitch = this.pitch;

    this.pos.x = THREE.MathUtils.clamp(this.pos.x + axis.x * SPEED * STEP, -PLAY_AREA.halfWidth, PLAY_AREA.halfWidth);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y + axis.y * SPEED * STEP, -PLAY_AREA.halfHeight, PLAY_AREA.halfHeight);

    // Ease the tilt toward the input direction so it does not snap.
    this.roll += (-axis.x * BANK - this.roll) * TILT_EASE;
    this.pitch += (axis.y * PITCH - this.pitch) * TILT_EASE;
  }

  render(alpha: number) {
    const lerp = THREE.MathUtils.lerp;
    this.object.position.set(lerp(this.prevPos.x, this.pos.x, alpha), lerp(this.prevPos.y, this.pos.y, alpha), 0);
    this.object.rotation.set(lerp(this.prevPitch, this.pitch, alpha), 0, lerp(this.prevRoll, this.roll, alpha));
  }
}
