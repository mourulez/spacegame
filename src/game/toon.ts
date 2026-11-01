import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Cel-shading helpers shared by the player's ship and the enemies: a
 * three-tone light ramp for MeshToonMaterial, and inverted-hull outlines.
 */

let ramp: THREE.DataTexture | null = null;

/** Three-tone light ramp for MeshToonMaterial.gradientMap. Shared by every toon material. */
export function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    ramp = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat);
    ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

/** Merge parts into one geometry; they may mix indexed and non-indexed primitives. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

/** Mirror across the YZ plane, flipping triangle winding back so faces still point outward. Non-indexed only. */
export function mirrorX(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.scale(-1, 1, 1);
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 3) {
    for (const attr of [pos, normal, uv]) {
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
 * Positions only, with welded vertices and smooth normals, so pushing each
 * vertex out along its normal doesn't tear the outline open at hard edges.
 */
export function outlineGeometry(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => new THREE.BufferGeometry().setAttribute('position', g.getAttribute('position'))))!;
  const welded = mergeVertices(merged, 1e-3);
  welded.computeVertexNormals();
  return welded;
}

/** Inverted hull: back faces only, inflated along the normal, in a flat color. Works on instanced meshes too. */
export function outlineMaterial(color: THREE.ColorRepresentation, width: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      color: { value: new THREE.Color(color) },
      width: { value: width },
    },
    vertexShader: /* glsl */ `
      uniform float width;
      void main() {
        vec4 p = vec4(position + normal * width, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
