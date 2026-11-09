import * as THREE from 'three';
import { celUniforms, onParams, outlineUniforms, setDefines, STENCIL } from './look';
import type { CelParams } from './params';
import celBeginVertex from './shaders/cel.begin.vert.glsl?raw';
import celColorFragment from './shaders/cel.color.frag.glsl?raw';
import celMainFragment from './shaders/cel.main.frag.glsl?raw';
import celParsFragment from './shaders/cel.pars.frag.glsl?raw';
import celParsVertex from './shaders/cel.pars.vert.glsl?raw';
import outlineFragment from './shaders/outline.frag.glsl?raw';
import outlineVertex from './shaders/outline.vert.glsl?raw';

/*
 * The cel material (MeshToonMaterial with its lighting replaced) and the
 * outline material (an inverted hull of constant pixel width, drawn either
 * only around the silhouette or wherever it peeks out). Every feature is a
 * define, switched on when the parameters ask for it and the model has the
 * data it needs.
 */

/** Data a model may carry. A feature only turns on when its model has the data for it. */
export interface ModelFeatures {
  /** Colors and properties per zone (uv.x picks the zone's column). */
  palette: boolean;
  /** Some zone is metal. */
  metal: boolean;
  /** `_shadow_bias` attribute. */
  shadowBias: boolean;
  /** `_edge` attribute: which edges of each triangle are lines. */
  edges: boolean;
  /** `_line` and `_line2` attributes. */
  lines: boolean;
  /** Vertex color, red channel: outline thickness. */
  paintedWidth: boolean;
  /** Emissive areas (uEmA, uEmB and their colors). */
  emissive: boolean;
  /** Decals (uDecalInv, uDecalAxis, uDecalRect, uDecalAtlas). */
  decals: boolean;
}

export const NO_FEATURES: Readonly<ModelFeatures> = {
  palette: false,
  metal: false,
  shadowBias: false,
  edges: false,
  lines: false,
  paintedWidth: false,
  emissive: false,
  decals: false,
};

type Uniforms = Record<string, THREE.IUniform>;

export interface CelMaterialOptions {
  /** Base color; with a palette it multiplies the zone's color. */
  color?: THREE.ColorRepresentation;
  /** Color the shadow side is multiplied by. Without a palette only: with one, each zone has its own. */
  shadow?: THREE.ColorRepresentation;
  /** Anime specular strength (0–1). Without a palette only. */
  spec?: number;
  /** The whole material is metal. Without a palette only: with one, the zones say. */
  metal?: boolean;
  /** Color texture, multiplied with the color (the ground's pattern, say). */
  map?: THREE.Texture | null;
  /** Ink hatching in deep shadow when the settings ask for it (default). False for a ground. */
  hatch?: boolean;
  /**
   * The model's stencil id (see takeStencilId): where it draws, the stencil holds it, so the model's own
   * silhouette outline stays outside. For models, not for a ground.
   */
  stencilId?: number;
  features?: Partial<ModelFeatures>;
  /** The model's own uniforms: palette, emissive areas, decals. */
  uniforms?: Uniforms;
}

/** Defaults for a model with no palette: the demo ship's hull. */
const PLAIN = { color: 0xe9edf2, shadow: 0xa9b1dc, spec: 0.55 };

export function celMaterial(options: CelMaterialOptions = {}): THREE.MeshToonMaterial {
  const features = { ...NO_FEATURES, ...options.features };
  const spec = options.spec ?? PLAIN.spec;
  const own: Uniforms = {
    uShadowTint: { value: new THREE.Color(options.shadow ?? PLAIN.shadow) },
    uSpecStrength: { value: spec },
    ...options.uniforms,
  };
  const decalCount = count(own.uDecalInv);
  const emitterCount = count(own.uEmA);
  const material = new THREE.MeshToonMaterial({ color: options.color ?? (features.palette ? 0xffffff : PLAIN.color), map: options.map ?? null });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, celUniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${celParsVertex}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${celBeginVertex}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${celParsFragment}`)
      .replace('#include <gradientmap_pars_fragment>', '')
      .replace('#include <color_fragment>', `${celColorFragment}\n#include <color_fragment>`)
      .replace('#include <opaque_fragment>', `${celMainFragment}\n#include <opaque_fragment>`);
  };
  // Variants differ by their defines, which are part of the program's key; this part stays fixed.
  material.customProgramCacheKey = () => 'cel-next';
  if (options.stencilId) {
    // Only where it ends up in front (depth test passed), so each pixel keeps the id of the visible model.
    material.stencilWrite = true;
    material.stencilRef = options.stencilId << 1;
    material.stencilWriteMask = STENCIL.models;
    material.stencilFunc = THREE.AlwaysStencilFunc;
    material.stencilZPass = THREE.ReplaceStencilOp;
  }

  const stop = onParams((p: Readonly<CelParams>) => {
    const d: Record<string, string> = {};
    if (p.bands === '3') d.CEL_BANDS_3 = '';
    if (p.bands === 'soft') d.CEL_SOFT = '';
    if (p.spec && (features.palette || spec > 0)) d.USE_ANIME_SPEC = '';
    if (p.metal && (features.palette ? features.metal : options.metal)) d.USE_FAKE_METAL = '';
    if (p.shadowBias && features.shadowBias) d.USE_SHADOW_BIAS = '';
    if (p.hatch && options.hatch !== false) d.USE_HATCH = '';
    if (features.palette) d.USE_PALETTE = '';
    if (p.lines && features.lines) d.USE_PANEL_LINES = '';
    if (p.edges && features.edges) d.USE_EDGES = '';
    if (p.emissive && features.emissive && emitterCount > 0) {
      d.USE_LED_LIGHT = '';
      d.NUM_EMITTERS = String(emitterCount);
    }
    if (p.decals && features.decals && decalCount > 0) {
      d.USE_DECALS = '';
      d.NUM_DECALS = String(decalCount);
    }
    setDefines(material, d);
  });
  material.addEventListener('dispose', stop);
  return material;
}

export interface OutlineMaterialOptions {
  /** The outline color when it isn't tinted per zone. */
  color?: THREE.ColorRepresentation;
  features?: Partial<ModelFeatures>;
  /** The model's own uniforms: palette, emissive areas. */
  uniforms?: Uniforms;
  /** The model's stencil id, the same as its cel material's. Without one, the outline is always drawn as a hull. */
  stencilId?: number;
}

/**
 * Inverted hull: back faces only, pushed out a constant number of pixels. Works on instanced meshes, but
 * all the instances share one stencil id: overlapping instances read as one shape in silhouette mode.
 * The geometry needs `_outline_normal` (see addOutlineNormals) for the smooth-normals setting.
 */
export function outlineMaterial(options: OutlineMaterialOptions = {}): THREE.ShaderMaterial {
  const features = { ...NO_FEATURES, ...options.features };
  const emitterCount = count(options.uniforms?.uEmA);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...outlineUniforms,
      uColor: { value: new THREE.Color(options.color ?? 0x161a3a) },
      ...options.uniforms,
    },
    side: THREE.BackSide,
    fog: true,
    vertexShader: outlineVertex,
    fragmentShader: outlineFragment,
  });
  const stop = onParams((p) => {
    // Silhouette: only where the model in front isn't this one (see CelMaterialOptions.stencilId), over
    // the background and over other models alike. A render state, no recompile.
    material.stencilWrite = p.outlineMode === 'silhouette' && !!options.stencilId;
    material.stencilWriteMask = 0;
    material.stencilRef = (options.stencilId ?? 0) << 1;
    material.stencilFuncMask = STENCIL.models;
    material.stencilFunc = THREE.NotEqualStencilFunc;
    const d: Record<string, string> = {};
    if (p.outlineNormals === 'smooth') d.USE_SMOOTH_OUTLINE = '';
    if (p.outlineColor === 'tint' && features.palette) d.USE_PALETTE_OUTLINE = '';
    if (p.outlinePaintedWidth && features.paintedWidth) d.USE_PAINTED_WIDTH = '';
    if (p.outlineLightWidth) d.USE_LIGHT_WIDTH = '';
    if (p.emissive && features.emissive && emitterCount > 0) {
      d.USE_EM_OUTLINE = '';
      d.NUM_EMITTERS = String(emitterCount);
    }
    setDefines(material, d);
  });
  material.addEventListener('dispose', stop);
  return material;
}

/** Length of an array uniform (emitters, decals), 0 if absent. */
function count(uniform: THREE.IUniform | undefined): number {
  return Array.isArray(uniform?.value) ? uniform.value.length : 0;
}
