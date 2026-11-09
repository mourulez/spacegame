import * as THREE from 'three';
import { STEP } from '../core/loop';
import { RETICLE_ORDER } from './reticle';
import { outlineMaterial } from '../render/toon';

/*
 * The player's shots, in combat space (see CombatFrame). The ship fires on
 * its own, from the gun under each wing in turn, toward the reticle: the two
 * streams converge on it. A bolt is born thin and short at the gun, its tail
 * held there, and grows to full size over its first few units, so close to
 * the camera it never looks fat or out of place.
 */

const MAX_SHOTS = 48;
const FIRE_INTERVAL = 5; // steps between shots, alternating guns: 12 per second
const SPEED = 260; // world units per second, relative to the player
const LIFETIME = 36; // steps: about 150 units of range
const LENGTH = 3.6;
const RADIUS = 0.16;
/**
 * Thickness at birth, as a share of full, and the distance over which it
 * grows to full, steadily: as it gets farther from the camera it gets
 * thicker, so on screen it looks about as thick all the way.
 */
const BIRTH_THICKNESS = 0.3;
const GROW_DISTANCE = 50;

interface Shot {
  active: boolean;
  life: number; // steps left
  readonly pos: THREE.Vector3; // its head
  readonly prevPos: THREE.Vector3;
  readonly origin: THREE.Vector3; // the gun it left
  readonly vel: THREE.Vector3;
  readonly quat: THREE.Quaternion;
}

export class Shots {
  readonly object = new THREE.Group();
  readonly list: Shot[] = [];
  private readonly meshes: THREE.InstancedMesh[];
  private cooldown = 0;
  private gun = 0; // the gun that fires next

  // Scratch objects.
  private readonly matrix = new THREE.Matrix4();
  private readonly drawPos = new THREE.Vector3();
  private readonly drawScale = new THREE.Vector3();
  private static readonly AHEAD = new THREE.Vector3(0, 0, -1);

  constructor() {
    // A bright bolt along -Z with a warm rim: same cel language as the ships.
    const bolt = new THREE.CylinderGeometry(RADIUS, RADIUS, LENGTH, 6).rotateX(Math.PI / 2);
    const core = new THREE.InstancedMesh(bolt, new THREE.MeshBasicMaterial({ color: 0xfff4c2, toneMapped: false }), MAX_SHOTS);
    const rim = new THREE.InstancedMesh(bolt, outlineMaterial(0xff8a1e, 0.1), MAX_SHOTS);
    this.meshes = [core, rim];
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      // Fully opaque, but in the transparent pass so they are drawn after the reticle, over it.
      (mesh.material as THREE.Material).transparent = true;
      mesh.renderOrder = RETICLE_ORDER + 1;
    }
    this.object.add(...this.meshes);

    for (let i = 0; i < MAX_SHOTS; i++) {
      this.list.push({
        active: false,
        life: 0,
        pos: new THREE.Vector3(),
        prevPos: new THREE.Vector3(),
        origin: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
      });
    }
  }

  /**
   * Move the shots and, if `fire`, fire a new one when due toward `target`,
   * from the next of the `guns` in turn (all in combat space).
   */
  step(guns: readonly THREE.Vector3[], target: THREE.Vector3, fire = true) {
    for (const s of this.list) {
      if (!s.active) continue;
      s.prevPos.copy(s.pos);
      s.pos.addScaledVector(s.vel, STEP);
      if (--s.life <= 0) s.active = false;
    }

    if (!fire || --this.cooldown > 0) return;
    this.cooldown = FIRE_INTERVAL;
    const s = this.list.find((shot) => !shot.active);
    if (!s) return;
    const muzzle = guns[this.gun];
    this.gun = (this.gun + 1) % guns.length;
    s.active = true;
    s.life = LIFETIME;
    s.vel.subVectors(target, muzzle).normalize();
    s.quat.setFromUnitVectors(Shots.AHEAD, s.vel);
    s.vel.multiplyScalar(SPEED);
    s.pos.copy(muzzle);
    s.prevPos.copy(muzzle);
    s.origin.copy(muzzle);
  }

  render(alpha: number) {
    let n = 0;
    for (const s of this.list) {
      if (!s.active) continue;
      // How far its head has come from the gun: as long as that, up to full length, and growing thicker.
      this.drawPos.lerpVectors(s.prevPos, s.pos, alpha);
      const travelled = this.drawPos.distanceTo(s.origin);
      const length = Math.min(LENGTH, travelled);
      const thickness = BIRTH_THICKNESS + (1 - BIRTH_THICKNESS) * Math.min(1, travelled / GROW_DISTANCE);
      // Centered half its length behind its head, so the tail never reaches behind the gun.
      this.drawPos.addScaledVector(s.vel, -length / 2 / SPEED);
      this.drawScale.set(thickness, thickness, Math.max(length, 0.01) / LENGTH);
      this.matrix.compose(this.drawPos, s.quat, this.drawScale);
      for (const mesh of this.meshes) mesh.setMatrixAt(n, this.matrix);
      n++;
    }
    for (const mesh of this.meshes) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Whether the segment from `a` to `b` passes within `radius` of `center`. */
export function segmentHitsSphere(a: THREE.Vector3, b: THREE.Vector3, center: THREE.Vector3, radius: number): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = lenSq > 0 ? ((center.x - a.x) * abx + (center.y - a.y) * aby + (center.z - a.z) * abz) / lenSq : 0;
  t = Math.min(1, Math.max(0, t));
  const dx = a.x + abx * t - center.x;
  const dy = a.y + aby * t - center.y;
  const dz = a.z + abz * t - center.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}
