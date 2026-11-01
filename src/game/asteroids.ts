import * as THREE from 'three';
import { STEP } from '../core/loop';

const COUNT = 25;
const NEAR = 40; // recycle once behind the camera at any aspect ratio
const FAR = -160;
const SPREAD_X = 30;
const SPREAD_Y = 22;

interface Rock {
  x: number;
  y: number;
  z: number;
  prevZ: number;
  rot: THREE.Vector3;
  prevRot: THREE.Vector3;
  spin: THREE.Vector3;
  scale: THREE.Vector3;
}

/** Decorative rocks drifting past, drawn as a single InstancedMesh. No collisions yet. */
export class Asteroids {
  readonly object: THREE.InstancedMesh;
  private readonly rocks: Rock[] = [];
  private readonly dummy = new THREE.Object3D();

  constructor() {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 0.95, flatShading: true });
    this.object = new THREE.InstancedMesh(geometry, material, COUNT);
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Instances move every step; skip the stale bounding sphere instead of recomputing it.
    this.object.frustumCulled = false;

    for (let i = 0; i < COUNT; i++) {
      const rock: Rock = {
        x: 0,
        y: 0,
        z: 0,
        prevZ: 0,
        rot: new THREE.Vector3(),
        prevRot: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        scale: new THREE.Vector3(),
      };
      this.respawn(rock, THREE.MathUtils.randFloat(FAR, 0));
      this.rocks.push(rock);
    }
    this.render(1);
  }

  step(speed: number) {
    for (const rock of this.rocks) {
      rock.prevZ = rock.z;
      rock.prevRot.copy(rock.rot);
      rock.z += speed * STEP;
      rock.rot.addScaledVector(rock.spin, STEP);
      if (rock.z > NEAR) this.respawn(rock, FAR);
    }
  }

  render(alpha: number) {
    const d = this.dummy;
    this.rocks.forEach((rock, i) => {
      d.position.set(rock.x, rock.y, THREE.MathUtils.lerp(rock.prevZ, rock.z, alpha));
      d.rotation.set(
        THREE.MathUtils.lerp(rock.prevRot.x, rock.rot.x, alpha),
        THREE.MathUtils.lerp(rock.prevRot.y, rock.rot.y, alpha),
        THREE.MathUtils.lerp(rock.prevRot.z, rock.rot.z, alpha),
      );
      d.scale.copy(rock.scale);
      d.updateMatrix();
      this.object.setMatrixAt(i, d.matrix);
    });
    this.object.instanceMatrix.needsUpdate = true;
  }

  private respawn(rock: Rock, z: number) {
    rock.x = THREE.MathUtils.randFloatSpread(SPREAD_X * 2);
    rock.y = THREE.MathUtils.randFloatSpread(SPREAD_Y * 2);
    rock.z = rock.prevZ = z;
    rock.rot.set(Math.random(), Math.random(), Math.random()).multiplyScalar(Math.PI * 2);
    rock.prevRot.copy(rock.rot);
    rock.spin.randomDirection().multiplyScalar(THREE.MathUtils.randFloat(0.2, 1.2));
    // Non-uniform scale so instances of one geometry don't look identical.
    const size = THREE.MathUtils.randFloat(0.4, 2.2);
    rock.scale.set(
      size * THREE.MathUtils.randFloat(0.7, 1.3),
      size * THREE.MathUtils.randFloat(0.7, 1.3),
      size * THREE.MathUtils.randFloat(0.7, 1.3),
    );
  }
}
