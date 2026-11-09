import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { outlineGeometry, outlineMaterial, toonRamp } from './toon';

/*
 * Models from any source (Blender, Tripo, Meshy, generated code) are only
 * meshes: their materials and textures are dropped, and the look comes from
 * this library.
 */

/** Models are shown at the player's ship size (see src/game/ship.ts), so outline widths compare. */
export const MODEL_LENGTH = 2.2;

export interface CelLook {
  color: THREE.ColorRepresentation;
  outline: THREE.ColorRepresentation;
  /** Outline width in world units, for a model MODEL_LENGTH long. */
  outlineWidth: number;
}

/** The player's ship hull, as src/game/ship.ts draws it. */
export const DEFAULT_LOOK: CelLook = { color: 0xe4e9f0, outline: 0x0c1222, outlineWidth: 0.022 };

let loader: GLTFLoader | null = null;

/** Load a .glb (URL or file contents) as one non-indexed geometry with positions and normals, in the file's own units. */
export async function loadModel(source: string | ArrayBuffer): Promise<THREE.BufferGeometry> {
  if (!loader) loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = typeof source === 'string' ? await loader.loadAsync(source) : await loader.parseAsync(source, '');
  gltf.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  gltf.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node.geometry as THREE.BufferGeometry;
    let part = new THREE.BufferGeometry();
    part.setAttribute('position', mesh.getAttribute('position'));
    const normal = mesh.getAttribute('normal');
    if (normal) part.setAttribute('normal', normal);
    part.setIndex(mesh.getIndex());
    part = part.toNonIndexed();
    part.applyMatrix4(node.matrixWorld);
    if (!normal) part.computeVertexNormals();
    parts.push(part);
  });
  if (parts.length === 0) throw new Error('The file has no meshes');
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('The meshes could not be merged');
  return merged;
}

/** Center on the origin and scale so the longest side is `length`. */
export function normalizeModel(geometry: THREE.BufferGeometry, length = MODEL_LENGTH): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = length / Math.max(size.x, size.y, size.z, 1e-6);
  geometry.translate(-center.x, -center.y, -center.z).scale(scale, scale, scale);
  geometry.computeBoundingSphere();
  return geometry;
}

export interface CelModel {
  object: THREE.Object3D;
  /** Free what this model created on the GPU; the geometry passed in is left alone. */
  dispose(): void;
}

/** The game's look on any geometry: toon shading in one color and an inverted-hull outline. */
export function celModel(geometry: THREE.BufferGeometry, look: CelLook = DEFAULT_LOOK): CelModel {
  const material = new THREE.MeshToonMaterial({ color: look.color, gradientMap: toonRamp() });
  const hull = outlineGeometry([geometry]);
  const outline = outlineMaterial(look.outline, look.outlineWidth);
  const object = new THREE.Group();
  object.add(new THREE.Mesh(geometry, material), new THREE.Mesh(hull, outline));
  return {
    object,
    dispose() {
      material.dispose();
      hull.dispose();
      outline.dispose();
    },
  };
}
