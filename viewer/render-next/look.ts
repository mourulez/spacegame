import * as THREE from 'three';
import { DEFAULT_PARAMS, type CelParams } from './params';

/*
 * The look's shared state: the current parameters, the uniforms every cel
 * and outline material reads, and the materials themselves, so a parameter
 * change reaches all of them (a uniform, or a define that recompiles).
 */

/** Toward the sun, in world space. Lateral, so the light/shadow cut splits a model in two. */
export const SUN_DIRECTION = new THREE.Vector3(-10, 7, -3).normalize();

/**
 * The look's only light. Intensity π cancels the 1/π of the Lambert BRDF, so the lit side shows the
 * base color exactly. There is no ambient light: each zone's shadow color comes from its material.
 */
export function createSun(): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(0xffffff, Math.PI);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(10);
  return sun;
}

function makeMatcap(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      let v = ny > 0.08 ? 205 : ny > -0.12 ? 70 : 140; // sky / dark horizon / ground
      if (Math.hypot(nx + 0.32, ny - 0.46) < 0.2) v = 255; // hard highlight
      if (Math.hypot(nx, ny) > 0.92) v = Math.min(v, 110); // darker edge
      data[y * size + x] = v;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Uniforms shared by every cel material. */
export const celUniforms = {
  uMatcap: { value: makeMatcap() },
  uBandT: { value: DEFAULT_PARAMS.bandThreshold },
  uSpecT: { value: DEFAULT_PARAMS.specThreshold },
  uSpecColor: { value: new THREE.Color(0xffffff) },
  /** Interior stroke width in drawing-buffer pixels. */
  uLineW: { value: DEFAULT_PARAMS.lineWidth },
  uLineK: { value: 1 },
  /** Edge line width in drawing-buffer pixels. */
  uEdgeW: { value: DEFAULT_PARAMS.edgeWidth },
  /** Hatching: how far below the shadow cut, the planes' normal in model space, their spacing and line width (buffer px). */
  uHatchDepth: { value: DEFAULT_PARAMS.hatchDepth },
  uHatchDir: { value: new THREE.Vector3() },
  uHatchSpacing: { value: DEFAULT_PARAMS.hatchSpacing },
  uHatchW: { value: DEFAULT_PARAMS.hatchWidth },
};

/** Stencil bits, by use, so they don't clash. */
export const STENCIL = {
  /** Ground shadow, bit 0: each pixel darkened once. */
  shadow: 0x01,
  /**
   * Bits 1–7: the id of the model drawn in front at each pixel. A model's silhouette outline draws only
   * where the id isn't its own, so each model keeps its thick outline over the others.
   */
  models: 0xfe,
} as const;

/** How many models can have their own stencil id at once. */
export const MAX_STENCIL_IDS = 127;
const stencilIds = new Set<number>();

/**
 * A free stencil id for a model (1–127, as written in the stencil: id << 1), to give back with
 * releaseStencilId. With all of them taken, models start sharing ids: overlapping ones then read as one shape.
 */
export function takeStencilId(): number {
  for (let id = 1; id <= MAX_STENCIL_IDS; id++) {
    if (!stencilIds.has(id)) {
      stencilIds.add(id);
      return id;
    }
  }
  return 1 + Math.floor(Math.random() * MAX_STENCIL_IDS);
}

export function releaseStencilId(id: number) {
  stencilIds.delete(id);
}

/** Uniforms shared by every outline material. */
export const outlineUniforms = {
  /** Outline thickness in drawing-buffer pixels. */
  uThickness: { value: DEFAULT_PARAMS.outlineWidth },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uFadeStart: { value: DEFAULT_PARAMS.outlineFadeStart },
  uLightDir: { value: SUN_DIRECTION },
  uShadeK: { value: DEFAULT_PARAMS.outlineShadeK },
  uLitK: { value: DEFAULT_PARAMS.outlineLitK },
};

let params: CelParams = { ...DEFAULT_PARAMS };
let pixelRatio = 1;

/** Something that depends on the parameters (a material's defines, a mesh's visibility). */
type Dependent = (params: Readonly<CelParams>) => void;
const dependents = new Set<Dependent>();

/** Call `apply` now and on every parameter change, until the returned function is called. */
export function onParams(apply: Dependent): () => void {
  dependents.add(apply);
  apply(params);
  return () => dependents.delete(apply);
}

export function getParams(): Readonly<CelParams> {
  return params;
}

export function setParams(changes: Partial<CelParams>) {
  params = { ...params, ...changes };
  celUniforms.uBandT.value = params.bandThreshold;
  celUniforms.uSpecT.value = params.specThreshold;
  celUniforms.uLineW.value = params.lineWidth * pixelRatio;
  celUniforms.uEdgeW.value = params.edgeWidth * pixelRatio;
  celUniforms.uHatchDepth.value = params.hatchDepth;
  const angle = THREE.MathUtils.degToRad(params.hatchAngle);
  celUniforms.uHatchDir.value.set(Math.sin(angle), 0, Math.cos(angle));
  celUniforms.uHatchSpacing.value = params.hatchSpacing;
  celUniforms.uHatchW.value = params.hatchWidth * pixelRatio;
  outlineUniforms.uThickness.value = params.outlineWidth * pixelRatio;
  outlineUniforms.uFadeStart.value = params.outlineFadeStart;
  outlineUniforms.uShadeK.value = params.outlineShadeK;
  outlineUniforms.uLitK.value = params.outlineLitK;
  for (const apply of dependents) apply(params);
}

const bufferSize = new THREE.Vector2();
/** Widths are in CSS pixels: call after every change of the renderer's size or pixel ratio. */
export function setViewport(renderer: THREE.WebGLRenderer) {
  pixelRatio = renderer.getPixelRatio();
  outlineUniforms.uResolution.value.copy(renderer.getDrawingBufferSize(bufferSize));
  setParams({});
}

/** Set a material's defines, recompiling only if they changed. */
export function setDefines(material: THREE.Material, defines: Record<string, string>) {
  const current = material.defines ?? {};
  const keys = Object.keys(defines);
  if (keys.length === Object.keys(current).length && keys.every((k) => current[k] === defines[k])) return;
  material.defines = defines;
  material.needsUpdate = true;
}
