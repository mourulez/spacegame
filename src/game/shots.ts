import * as THREE from 'three';
import { STEP } from '../core/loop';
import { outlineMaterial } from './toon';

/*
 * The player's shots, in combat space (see CombatFrame). The ship fires on
 * its own, from its nose toward the reticle.
 */

const MAX_SHOTS = 48;
const FIRE_INTERVAL = 5; // steps between shots: 12 per second
const SPEED = 260; // world units per second, relative to the player
const LIFETIME = 36; // steps: about 150 units of range
const LENGTH = 3.6;

interface Shot {
  active: boolean;
  life: number; // steps left
  readonly pos: THREE.Vector3;
  readonly prevPos: THREE.Vector3;
  readonly vel: THREE.Vector3;
  readonly quat: THREE.Quaternion;
}

export class Shots {
  readonly object = new THREE.Group();
  readonly list: Shot[] = [];
  private readonly meshes: THREE.InstancedMesh[];
  private cooldown = 0;

  // Scratch objects.
  private readonly matrix = new THREE.Matrix4();
  private readonly drawPos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private static readonly AHEAD = new THREE.Vector3(0, 0, -1);

  constructor() {
    // A bright bolt along -Z with a warm rim: same cel language as the ships.
    const bolt = new THREE.CylinderGeometry(0.16, 0.16, LENGTH, 6).rotateX(Math.PI / 2);
    const core = new THREE.InstancedMesh(bolt, new THREE.MeshBasicMaterial({ color: 0xfff4c2, toneMapped: false }), MAX_SHOTS);
    const rim = new THREE.InstancedMesh(bolt, outlineMaterial(0xff8a1e, 0.1), MAX_SHOTS);
    this.meshes = [core, rim];
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
    }
    this.object.add(...this.meshes);

    for (let i = 0; i < MAX_SHOTS; i++) {
      this.list.push({
        active: false,
        life: 0,
        pos: new THREE.Vector3(),
        prevPos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
      });
    }
  }

  /** Move the shots and fire a new one when due, from `muzzle` toward `target` (combat space). */
  step(muzzle: THREE.Vector3, target: THREE.Vector3) {
    for (const s of this.list) {
      if (!s.active) continue;
      s.prevPos.copy(s.pos);
      s.pos.addScaledVector(s.vel, STEP);
      if (--s.life <= 0) s.active = false;
    }

    if (--this.cooldown > 0) return;
    this.cooldown = FIRE_INTERVAL;
    const s = this.list.find((shot) => !shot.active);
    if (!s) return;
    s.active = true;
    s.life = LIFETIME;
    s.vel.subVectors(target, muzzle).normalize();
    s.quat.setFromUnitVectors(Shots.AHEAD, s.vel);
    s.vel.multiplyScalar(SPEED);
    s.pos.copy(muzzle);
    s.prevPos.copy(muzzle);
  }

  render(alpha: number) {
    let n = 0;
    for (const s of this.list) {
      if (!s.active) continue;
      this.drawPos.lerpVectors(s.prevPos, s.pos, alpha);
      this.matrix.compose(this.drawPos, s.quat, this.one);
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
