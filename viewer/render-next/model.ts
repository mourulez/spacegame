import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { decalAtlas, decalSlotRect } from './decals';
import { addOutlineNormals } from './geometry';
import { onParams, releaseStencilId, takeStencilId } from './look';
import { celMaterial, NO_FEATURES, outlineMaterial, type ModelFeatures } from './materials';
import glowFragment from './shaders/bloom.emissive.frag.glsl?raw';
import glowVertex from './shaders/bloom.emissive.vert.glsl?raw';
import { groundShadows } from './shadow';

/*
 * Cel assets: a .glb in the format of docs/reference/SPEC-cel-shader-movil.md
 * §11, read as it comes. Everything the look needs is in the file: this
 * library draws what is there and computes nothing of its own beyond merging
 * the parts and, if the file doesn't carry them, the outline normals. A .glb
 * from anywhere else (Tripo, Meshy) is just its meshes, drawn in one color.
 *
 * In the file:
 * - Meshes: the parts, any number, merged into one mesh (one draw call).
 *   Attributes, each optional: TEXCOORD_0 (x picks the zone's palette
 *   column), COLOR_0 (red: outline thickness, 0.5 = 1×), _SHADOW_BIAS
 *   (negative = more shadow), _LINE (vec2: a field whose zero is a stroke,
 *   and its period, 0 = a single stroke), _LINE2 (a second stroke field),
 *   _EDGE (vec3 per triangle corner: the corner's one-hot + 2 × the flags of
 *   the triangle's three edges, edge k opposite corner k; 1 = a line),
 *   _OUTLINE_NORMAL.
 * - The material with the palette as its base color texture (rows from the
 *   top: base, shadow, outline color), and extras cel_sw_<column> =
 *   [spec, metal, emissive] per zone.
 * - Empty nodes, by name prefix: emit_* (an emissive segment along local X
 *   from -1 to +1; extras color [sRGB], core, glow, blink_on, blink_off),
 *   decal_* (the box from -1 to +1: X width, Y up in the image, Z out of the
 *   surface; extras slot), nozzle_* (local Z = the flame's direction; extras
 *   radius, length) and muzzle_* (local Z = the shot's direction).
 */

/** Models are shown at the player's ship size (see src/game/ship.ts). */
export const MODEL_LENGTH = 2.2;

export const MAX_EMITTERS = 4;
export const MAX_DECALS = 4;

export interface Emitter {
  /** The segment's ends; equal for a point. */
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** Radius of the full-color core. */
  core: number;
  /** How far the light spills over the surface past the core. */
  glow: number;
  color: THREE.Color;
  /** Blink: seconds on and off (0 off = always on). */
  blinkOn: number;
  blinkOff: number;
}

export interface Decal {
  /** The decal's box (-1 to +1) to model space. */
  box: THREE.Matrix4;
  /** Slot in the game's decal atlas. */
  slot: number;
}

/** A nozzle (where a flame comes out) or a muzzle (where shots come out). */
export interface Port {
  name: string;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
  length: number;
}

export interface CelAsset {
  /** All the parts in one non-indexed geometry, in model space. */
  geometry: THREE.BufferGeometry;
  palette: THREE.Texture | null;
  /** Per palette column: spec, metal, emissive. */
  zones: number[][];
  emitters: Emitter[];
  decals: Decal[];
  nozzles: Port[];
  muzzles: Port[];
}

/** Attributes read from the parts, and what a part without one gets. */
const OPTIONAL: { name: string; size: number; fallback: number[] }[] = [
  { name: 'uv', size: 2, fallback: [0, 0.5] },
  { name: 'color', size: 3, fallback: [0.5, 0.5, 0.5] },
  { name: '_shadow_bias', size: 1, fallback: [0] },
  { name: '_line', size: 2, fallback: [1e3, 0] },
  { name: '_line2', size: 1, fallback: [1e3] },
  { name: '_edge', size: 3, fallback: [0, 0, 0] },
];

let loader: GLTFLoader | null = null;

/** Load a .glb (URL or file contents) as a cel asset, in the file's own units. */
export async function loadAsset(source: string | ArrayBuffer): Promise<CelAsset> {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = typeof source === 'string' ? await loader.loadAsync(source) : await loader.parseAsync(source, '');
  gltf.scene.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  const asset: CelAsset = { geometry: new THREE.BufferGeometry(), palette: null, zones: [], emitters: [], decals: [], nozzles: [], muzzles: [] };
  gltf.scene.traverse((node) => {
    if (node instanceof THREE.Mesh) meshes.push(node);
    else readMarker(node, asset);
  });
  if (meshes.length === 0) throw new Error('The file has no meshes');
  asset.geometry = mergeParts(meshes);

  // The palette and the zones' properties come from the material that carries them.
  const materials = meshes.flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])) as THREE.MeshStandardMaterial[];
  const cel = materials.find((m) => m.map && Object.keys(m.userData).some((k) => k.startsWith('cel_sw_')));
  if (cel?.map) {
    asset.palette = cel.map;
    asset.palette.magFilter = asset.palette.minFilter = THREE.NearestFilter;
    asset.palette.generateMipmaps = false;
    for (const [key, value] of Object.entries(cel.userData)) {
      const column = /^cel_sw_(\d+)$/.exec(key)?.[1];
      if (column !== undefined && Array.isArray(value)) asset.zones[+column] = [0, 1, 2].map((i) => Number(value[i]) || 0);
    }
  }
  for (const m of materials) if (m !== cel) disposeMaterial(m);
  if (cel) {
    cel.map = null;
    disposeMaterial(cel);
  }
  for (const m of meshes) m.geometry.dispose();
  return asset;
}

function disposeMaterial(material: THREE.MeshStandardMaterial) {
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
  material.dispose();
}

const local = new THREE.Vector3();
function readMarker(node: THREE.Object3D, asset: CelAsset) {
  const data = node.userData;
  const at = (x: number, y: number, z: number) => local.set(x, y, z).applyMatrix4(node.matrixWorld).clone();
  const number = (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback);
  if (node.name.startsWith('emit_')) {
    const [r, g, b] = Array.isArray(data.color) ? data.color.map(Number) : [1, 1, 1];
    asset.emitters.push({
      a: at(-1, 0, 0),
      b: at(1, 0, 0),
      core: number(data.core, 0.08),
      glow: number(data.glow, 0.5),
      color: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace),
      blinkOn: number(data.blink_on, 0),
      blinkOff: number(data.blink_off, 0),
    });
  } else if (node.name.startsWith('decal_')) {
    asset.decals.push({ box: node.matrixWorld.clone(), slot: number(data.slot, 0) });
  } else if (node.name.startsWith('nozzle_') || node.name.startsWith('muzzle_')) {
    const position = at(0, 0, 0);
    const port: Port = {
      name: node.name,
      position,
      direction: at(0, 0, 1).sub(position).normalize(),
      radius: number(data.radius, 0),
      length: number(data.length, 0),
    };
    (node.name.startsWith('nozzle_') ? asset.nozzles : asset.muzzles).push(port);
  }
}

/** All the parts in model space, in one non-indexed geometry. Attributes some parts lack get their fallback. */
function mergeParts(meshes: THREE.Mesh[]): THREE.BufferGeometry {
  const parts = meshes.map((mesh) => {
    const g = mesh.geometry as THREE.BufferGeometry;
    return { mesh, g: g.index ? g.toNonIndexed() : g };
  });
  const total = parts.reduce((n, p) => n + p.g.getAttribute('position').count, 0);
  const has = (name: string) => parts.some((p) => p.g.getAttribute(name));
  const wanted = OPTIONAL.filter((a) => has(a.name) || (a.name.startsWith('_line') && (has('_line') || has('_line2'))));
  const outlineNormals = parts.every((p) => p.g.getAttribute('_outline_normal'));

  const arrays: Record<string, Float32Array> = { position: new Float32Array(total * 3), normal: new Float32Array(total * 3) };
  for (const a of wanted) arrays[a.name] = new Float32Array(total * a.size);
  if (outlineNormals) arrays._outline_normal = new Float32Array(total * 3);

  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let offset = 0;
  for (const { mesh, g } of parts) {
    const count = g.getAttribute('position').count;
    if (!g.getAttribute('normal')) g.computeVertexNormals(); // non-indexed: flat
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const position = g.getAttribute('position');
    const normal = g.getAttribute('normal');
    const outline = g.getAttribute('_outline_normal');
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).toArray(arrays.position, (offset + i) * 3);
      v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize().toArray(arrays.normal, (offset + i) * 3);
      if (outline) v.fromBufferAttribute(outline, i).applyMatrix3(normalMatrix).normalize().toArray(arrays._outline_normal, (offset + i) * 3);
    }
    for (const a of wanted) {
      const source = g.getAttribute(a.name);
      const target = arrays[a.name];
      for (let i = 0; i < count; i++) {
        for (let c = 0; c < a.size; c++) {
          // getComponent also turns normalized integers (common in COLOR_0) into floats.
          target[(offset + i) * a.size + c] = source && c < source.itemSize ? source.getComponent(i, c) : a.fallback[c];
        }
      }
    }
    if (g !== mesh.geometry) g.dispose();
    offset += count;
  }

  const merged = new THREE.BufferGeometry();
  for (const [name, array] of Object.entries(arrays)) merged.setAttribute(name, new THREE.BufferAttribute(array, array.length / total));
  return merged;
}

/** A bare geometry as an asset: one color, no palette or markers. */
export function assetFromGeometry(geometry: THREE.BufferGeometry): CelAsset {
  return { geometry, palette: null, zones: [], emitters: [], decals: [], nozzles: [], muzzles: [] };
}

/** Center on the origin and scale so the longest side is `length`, markers included. */
export function normalizeAsset(asset: CelAsset, length = MODEL_LENGTH): CelAsset {
  const geometry = asset.geometry;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = length / Math.max(size.x, size.y, size.z, 1e-6);
  const matrix = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  geometry.applyMatrix4(matrix); // stroke fields stay as they are: their width is measured on screen
  geometry.computeBoundingSphere();
  for (const e of asset.emitters) {
    e.a.applyMatrix4(matrix);
    e.b.applyMatrix4(matrix);
    e.core *= s;
    e.glow *= s;
  }
  for (const d of asset.decals) d.box.premultiply(matrix);
  for (const p of [...asset.nozzles, ...asset.muzzles]) {
    p.position.applyMatrix4(matrix);
    p.radius *= s;
    p.length *= s;
  }
  return asset;
}

/** Free an asset's GPU resources. */
export function disposeAsset(asset: CelAsset) {
  asset.geometry.dispose();
  asset.palette?.dispose();
}

export interface CelModel {
  /** The model, its outline and its ground shadow. */
  object: THREE.Object3D;
  /** The data the asset carries, so a viewer can tell which settings apply to it. */
  features: ModelFeatures;
  /** Its emissive areas alone, for Bloom (not part of `object`); null without emissive areas. */
  glow: THREE.Mesh | null;
  /** Animate to this time, in seconds of the game's fixed-step clock (never real time): the emissive areas' blink. */
  update(time: number): void;
  /** Free what this model created on the GPU; the asset is left alone. */
  dispose(): void;
}

/**
 * The cel look on an asset: one mesh and its outline (2 draw calls), and its shadow when there is a ground
 * (one more). Adds `_outline_normal` to the geometry if missing.
 */
export function celModel(asset: CelAsset): CelModel {
  const { geometry } = asset;
  if (!geometry.getAttribute('_outline_normal')) addOutlineNormals(geometry);
  const emitters = asset.emitters.slice(0, MAX_EMITTERS);
  const decals = asset.decals.slice(0, MAX_DECALS);
  const palette = !!asset.palette && !!geometry.getAttribute('uv');
  const features: ModelFeatures = {
    ...NO_FEATURES,
    palette,
    metal: palette && asset.zones.some((z) => z?.[1] > 0),
    shadowBias: !!geometry.getAttribute('_shadow_bias'),
    edges: !!geometry.getAttribute('_edge'),
    lines: !!geometry.getAttribute('_line'),
    paintedWidth: !!geometry.getAttribute('color'),
    emissive: emitters.length > 0,
    decals: decals.length > 0,
  };

  const zones = palette ? zonesTexture(asset.zones) : null;
  const uniforms: Record<string, THREE.IUniform> = {};
  if (palette) Object.assign(uniforms, { uPalette: { value: asset.palette }, uZones: { value: zones } });
  if (emitters.length) {
    Object.assign(uniforms, {
      uEmA: { value: emitters.map((e) => new THREE.Vector4(e.a.x, e.a.y, e.a.z, e.core)) },
      uEmB: { value: emitters.map((e) => new THREE.Vector4(e.b.x, e.b.y, e.b.z, e.glow)) },
      uEmColor: { value: emitters.map((e) => e.color) },
      uEmOn: { value: emitters.map(() => 1) }, // see update()
    });
  }
  if (decals.length) {
    const half = new THREE.Matrix4().makeScale(0.5, 0.5, 0.5); // the shader's box spans -0.5 to +0.5
    Object.assign(uniforms, {
      uDecalInv: { value: decals.map((d) => half.clone().multiply(d.box.clone().invert())) },
      uDecalAxis: { value: decals.map((d) => new THREE.Vector3().setFromMatrixColumn(d.box, 2).normalize()) },
      uDecalRect: { value: decals.map((d) => decalSlotRect(d.slot)) },
      uDecalAtlas: { value: decalAtlas() },
    });
  }

  // Its own stencil id, so its silhouette outline also shows over other models (spec §11.9).
  const stencilId = takeStencilId();
  const material = celMaterial({ features, uniforms, stencilId });
  const outline = outlineMaterial({ features, uniforms, stencilId });
  const outlineMesh = new THREE.Mesh(geometry, outline);
  outlineMesh.renderOrder = 1; // after the opaque pass: early-Z rejects the hidden part of the hull
  const object = new THREE.Group();
  object.add(new THREE.Mesh(geometry, material), outlineMesh);
  const stopOutline = onParams((p) => (outlineMesh.visible = p.outline));
  const stopShadows = groundShadows(geometry, object);
  const emitterOn = uniforms.uEmOn?.value as number[] | undefined;
  let glow: THREE.Mesh | null = null;
  if (emitters.length) {
    glow = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { uEmA: uniforms.uEmA, uEmB: uniforms.uEmB, uEmColor: uniforms.uEmColor, uEmOn: uniforms.uEmOn },
        defines: { NUM_EMITTERS: String(emitters.length) },
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
      }),
    );
    glow.matrixAutoUpdate = glow.matrixWorldAutoUpdate = false; // Bloom copies the model's matrix
  }
  return {
    object,
    features,
    glow,
    update(time) {
      if (!emitterOn) return;
      emitters.forEach((e, i) => {
        // On for blinkOn seconds, off for blinkOff; always on without a blink.
        emitterOn[i] = e.blinkOff > 0 && time % (e.blinkOn + e.blinkOff) >= e.blinkOn ? 0 : 1;
      });
    },
    dispose() {
      stopOutline();
      releaseStencilId(stencilId);
      stopShadows();
      (glow?.material as THREE.Material | undefined)?.dispose();
      material.dispose();
      outline.dispose();
      zones?.dispose();
    },
  };
}

/** The zones' properties as a one-row texture, one texel per palette column. */
function zonesTexture(zones: number[][]): THREE.DataTexture {
  const width = Math.max(1, zones.length);
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < zones.length; i++) for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(THREE.MathUtils.clamp(zones[i]?.[c] ?? 0, 0, 1) * 255);
  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
