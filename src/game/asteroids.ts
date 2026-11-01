import * as THREE from 'three';

const COUNT = 25;
const NEAR = 12;
const FAR = -160;

interface Rock {
  mesh: THREE.Mesh;
  spin: THREE.Vector3;
}

/** Decorative rocks drifting past. No collisions yet. */
export class Asteroids {
  readonly object = new THREE.Group();
  private readonly rocks: Rock[] = [];

  constructor() {
    const geometries = [0, 1].map((detail) => new THREE.IcosahedronGeometry(1, detail));
    const material = new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 0.95, flatShading: true });

    for (let i = 0; i < COUNT; i++) {
      const mesh = new THREE.Mesh(geometries[i % geometries.length], material);
      const rock = {
        mesh,
        spin: new THREE.Vector3().randomDirection().multiplyScalar(THREE.MathUtils.randFloat(0.2, 1.2)),
      };
      this.respawn(rock, THREE.MathUtils.randFloat(FAR, NEAR - 20));
      this.rocks.push(rock);
      this.object.add(mesh);
    }
  }

  update(dt: number, speed: number) {
    for (const rock of this.rocks) {
      const m = rock.mesh;
      m.position.z += speed * dt;
      m.rotation.x += rock.spin.x * dt;
      m.rotation.y += rock.spin.y * dt;
      m.rotation.z += rock.spin.z * dt;
      if (m.position.z > NEAR) this.respawn(rock, FAR);
    }
  }

  private respawn(rock: Rock, z: number) {
    const m = rock.mesh;
    m.position.set(THREE.MathUtils.randFloatSpread(40), THREE.MathUtils.randFloatSpread(24), z);
    m.scale.setScalar(THREE.MathUtils.randFloat(0.4, 2.2));
  }
}
