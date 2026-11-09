import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Merge parts into one geometry; they may mix indexed and non-indexed primitives. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

/** Mirror across the YZ plane, flipping triangle winding back so faces still point outward. Non-indexed only. */
export function mirrorX(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.scale(-1, 1, 1);
  const attributes = Object.values(geometry.attributes);
  const count = geometry.getAttribute('position').count;
  for (let i = 0; i < count; i += 3) {
    for (const attr of attributes) {
      for (let c = 0; c < attr.itemSize; c++) {
        const a = attr.getComponent(i + 1, c);
        attr.setComponent(i + 1, c, attr.getComponent(i + 2, c));
        attr.setComponent(i + 2, c, a);
      }
    }
  }
  return geometry;
}

/**
 * Add `_outline_normal`: the normals of every vertex at the same position, averaged. Pushing the
 * outline along it keeps the hull closed at hard edges, where the shading normals split. Equivalent
 * to baking the attribute in Blender.
 */
export function addOutlineNormals(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const sums = new Map<string, THREE.Vector3>();
  const keys: string[] = [];
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e4)}_${Math.round(position.getY(i) * 1e4)}_${Math.round(position.getZ(i) * 1e4)}`;
    keys.push(key);
    let sum = sums.get(key);
    if (!sum) sums.set(key, (sum = new THREE.Vector3()));
    sum.add(n.fromBufferAttribute(normal, i));
  }
  const out = new Float32Array(position.count * 3);
  keys.forEach((key, i) => {
    const sum = sums.get(key)!;
    n.copy(sum).normalize();
    out[i * 3] = n.x;
    out[i * 3 + 1] = n.y;
    out[i * 3 + 2] = n.z;
  });
  geometry.setAttribute('_outline_normal', new THREE.BufferAttribute(out, 3));
  return geometry;
}
