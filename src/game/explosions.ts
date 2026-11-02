import * as THREE from 'three';

/*
 * Cel-style bursts in combat space: a flat disc that grows and hollows out,
 * white-hot core to orange to dark red rim, with hard edges like the rest of
 * the art. Small and short for hits, big for kills. One draw call.
 */

const MAX_BURSTS = 24;

export const KILL_BURST = { size: 9, steps: 30 } as const;
export const HIT_BURST = { size: 2.2, steps: 9 } as const;
/** An enemy bullet glancing off the rolling ship: a quick spark. */
export const GLANCE_BURST = { size: 1.4, steps: 7 } as const;
/** An enemy bullet shot down. */
export const POP_BURST = { size: 3, steps: 12 } as const;
/** The player's ship going down, close to the camera: big on screen even at this size. */
export const DEATH_BURST = { size: 3.5, steps: 24 } as const;

interface Burst {
  active: boolean;
  age: number; // steps
  steps: number; // total duration
  size: number;
  readonly pos: THREE.Vector3;
}

export class Explosions {
  readonly object: THREE.InstancedMesh;
  private readonly bursts: Burst[] = [];
  private readonly progress = new Float32Array(MAX_BURSTS);
  private readonly progressAttr: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.progressAttr = new THREE.InstancedBufferAttribute(this.progress, 1);
    this.progressAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('progress', this.progressAttr);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float progress;
        varying vec2 vUv;
        varying float vProgress;
        void main() {
          vUv = uv;
          vProgress = progress;
          // Billboard: always faces the camera.
          vec4 center = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
          float size = length(instanceMatrix[0].xyz);
          center.xy += position.xy * size;
          gl_Position = projectionMatrix * center;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vProgress;
        void main() {
          float t = vProgress;
          float r = length(vUv * 2.0 - 1.0);
          float outer = mix(0.35, 1.0, sqrt(t));
          float inner = outer * smoothstep(0.35, 1.0, t); // hollows out as it fades
          if (r > outer || r < inner) discard;
          float band = r / outer;
          vec3 color = band < 0.5 * (1.0 - t) ? vec3(1.0, 0.97, 0.85)
                     : band < 0.82 ? vec3(1.0, 0.6, 0.16)
                     : vec3(0.78, 0.18, 0.12);
          gl_FragColor = vec4(color, 1.0 - smoothstep(0.7, 1.0, t));
          #include <colorspace_fragment>
        }
      `,
    });

    this.object = new THREE.InstancedMesh(geometry, material, MAX_BURSTS);
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.frustumCulled = false;
    this.object.count = 0;
    for (let i = 0; i < MAX_BURSTS; i++) {
      this.bursts.push({ active: false, age: 0, steps: 1, size: 1, pos: new THREE.Vector3() });
    }
  }

  spawn(at: THREE.Vector3, kind: { size: number; steps: number }) {
    const b = this.bursts.find((burst) => !burst.active);
    if (!b) return;
    b.active = true;
    b.age = 0;
    b.steps = kind.steps;
    b.size = kind.size;
    b.pos.copy(at);
  }

  step() {
    for (const b of this.bursts) {
      if (b.active && ++b.age >= b.steps) b.active = false;
    }
  }

  render(alpha: number) {
    let n = 0;
    for (const b of this.bursts) {
      if (!b.active) continue;
      this.matrix.makeScale(b.size, b.size, b.size).setPosition(b.pos);
      this.object.setMatrixAt(n, this.matrix);
      this.progress[n] = Math.min(1, (b.age + alpha) / b.steps);
      n++;
    }
    this.object.count = n;
    this.object.instanceMatrix.needsUpdate = true;
    this.progressAttr.needsUpdate = true;
  }
}
