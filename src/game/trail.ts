import * as THREE from 'three';
import { STEP } from '../core/loop';
import { mulberry32 } from './noise';

/*
 * Fire and smoke trailing the player's ship as it falls, in world space, so
 * the smoke stays where it was left. Cel-style billboards like the
 * explosions: hard-edged discs, fire white-hot to orange to red and
 * shrinking, smoke dark and billowing out as it fades. One draw call.
 */

const MAX_PUFFS = 64;
const SMOKE = { steps: 70, every: 2, size: [0.9, 3.5], rise: 1.5 } as const;
const FIRE = { steps: 12, every: 1, size: [1.5, 0.4], rise: 0 } as const;
const JITTER = 0.35; // world units around the ship
/**
 * Distance from the camera across which smoke fades out, closer in. The
 * camera takes a moment to stop after the ship goes down and flies through
 * the first puffs, which would otherwise fill the screen.
 */
const NEAR_FADE = { from: 6, to: 14 } as const;

interface Puff {
  active: boolean;
  fire: boolean;
  age: number; // steps
  readonly pos: THREE.Vector3; // where it was left
}

export class Trail {
  readonly object: THREE.InstancedMesh;
  private readonly puffs: Puff[] = [];
  private readonly progress = new Float32Array(MAX_PUFFS);
  private readonly fire = new Float32Array(MAX_PUFFS);
  private readonly progressAttr: THREE.InstancedBufferAttribute;
  private readonly fireAttr: THREE.InstancedBufferAttribute;
  private readonly random = mulberry32(5);
  private steps = 0;

  // Scratch objects.
  private readonly matrix = new THREE.Matrix4();
  private readonly drawPos = new THREE.Vector3();

  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.progressAttr = new THREE.InstancedBufferAttribute(this.progress, 1);
    this.fireAttr = new THREE.InstancedBufferAttribute(this.fire, 1);
    for (const attr of [this.progressAttr, this.fireAttr]) attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('progress', this.progressAttr);
    geometry.setAttribute('fire', this.fireAttr);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float progress;
        attribute float fire;
        varying vec2 vUv;
        varying float vProgress;
        varying float vFire;
        varying float vDistance;
        void main() {
          vUv = uv;
          vProgress = progress;
          vFire = fire;
          // Billboard: always faces the camera.
          vec4 center = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
          vDistance = -center.z;
          float size = length(instanceMatrix[0].xyz);
          center.xy += position.xy * size;
          gl_Position = projectionMatrix * center;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vProgress;
        varying float vFire;
        varying float vDistance;
        void main() {
          float t = vProgress;
          float r = length(vUv * 2.0 - 1.0);
          if (r > 1.0) discard;
          vec3 color;
          float alpha;
          if (vFire > 0.5) {
            color = r < 0.45 * (1.0 - t) ? vec3(1.0, 0.95, 0.75) : r < 0.8 ? vec3(1.0, 0.55, 0.12) : vec3(0.8, 0.18, 0.1);
            alpha = 1.0;
          } else {
            // Dark at first, paler as it spreads, with a darker core for the cel look.
            vec3 smoke = mix(vec3(0.16, 0.15, 0.17), vec3(0.45, 0.43, 0.46), t);
            color = r < 0.5 ? smoke * 0.8 : smoke;
            alpha = 0.85 * (1.0 - smoothstep(0.4, 1.0, t));
            alpha *= smoothstep(${NEAR_FADE.from.toFixed(1)}, ${NEAR_FADE.to.toFixed(1)}, vDistance);
            if (alpha < 0.01) discard;
          }
          gl_FragColor = vec4(color, alpha);
          #include <colorspace_fragment>
        }
      `,
    });

    this.object = new THREE.InstancedMesh(geometry, material, MAX_PUFFS);
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.frustumCulled = false;
    this.object.count = 0;
    for (let i = 0; i < MAX_PUFFS; i++) {
      this.puffs.push({ active: false, fire: false, age: 0, pos: new THREE.Vector3() });
    }
  }

  /** Age the puffs, and leave new ones at `source` (world space) unless it is null. */
  step(source: THREE.Vector3 | null) {
    for (const p of this.puffs) {
      if (p.active && ++p.age >= (p.fire ? FIRE.steps : SMOKE.steps)) p.active = false;
    }
    if (!source) return;
    this.steps++;
    if (this.steps % SMOKE.every === 0) this.spawn(source, false);
    if (this.steps % FIRE.every === 0) this.spawn(source, true);
  }

  render(alpha: number) {
    let n = 0;
    for (const p of this.puffs) {
      if (!p.active) continue;
      const kind = p.fire ? FIRE : SMOKE;
      const t = Math.min(1, (p.age + alpha) / kind.steps);
      const size = THREE.MathUtils.lerp(kind.size[0], kind.size[1], Math.sqrt(t));
      this.drawPos.copy(p.pos);
      this.drawPos.y += kind.rise * (p.age + alpha) * STEP;
      this.matrix.makeScale(size, size, size).setPosition(this.drawPos);
      this.object.setMatrixAt(n, this.matrix);
      this.progress[n] = t;
      this.fire[n] = p.fire ? 1 : 0;
      n++;
    }
    this.object.count = n;
    this.object.instanceMatrix.needsUpdate = true;
    this.progressAttr.needsUpdate = true;
    this.fireAttr.needsUpdate = true;
  }

  private spawn(at: THREE.Vector3, fire: boolean) {
    const p = this.puffs.find((puff) => !puff.active);
    if (!p) return;
    p.active = true;
    p.fire = fire;
    p.age = 0;
    p.pos.set(
      at.x + (this.random() - 0.5) * 2 * JITTER,
      at.y + (this.random() - 0.5) * 2 * JITTER,
      at.z + (this.random() - 0.5) * 2 * JITTER,
    );
  }
}
