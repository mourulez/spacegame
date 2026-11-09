import * as THREE from 'three';
import { onParams, setParams, STENCIL } from './look';
import blobFragment from './shaders/shadow.blob.frag.glsl?raw';
import blobVertex from './shaders/shadow.blob.vert.glsl?raw';
import planarFragment from './shaders/shadow.planar.frag.glsl?raw';
import planarVertex from './shaders/shadow.planar.vert.glsl?raw';

/*
 * A model's shadow on a flat ground, without shadow maps: one draw call
 * either way. The planar shadow is the model's own geometry flattened onto
 * the ground; the blob is an ellipse under it. Both multiply whatever the
 * ground already drew, and both work out their placement in the shader, so
 * they follow the model with no work per frame.
 */

const uniforms = {
  uGroundY: { value: 0 },
  /** The shadow's light rays, toward the ground: more vertical than the sun, so the shadow stays near the model. */
  uShadowDir: { value: new THREE.Vector3(0.35, -1, 0.12).normalize() },
  /** What the ground is multiplied by under the shadow. */
  uShadowTint: { value: new THREE.Vector3(0xa8 / 255, 0x8f / 255, 0x9e / 255) },
};

let groundOn = false;

/** The ground's height, or null when there is no ground (and so no shadows). */
export function setGround(y: number | null) {
  groundOn = y !== null;
  if (y !== null) uniforms.uGroundY.value = y;
  setParams({});
}

const multiply = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.ZeroFactor,
  blendDst: THREE.SrcColorFactor, // destination × the shader's color
} as const;

let planar: THREE.ShaderMaterial | null = null;
let blob: THREE.ShaderMaterial | null = null;

function planarMaterial(): THREE.ShaderMaterial {
  // Stencil: each pixel is darkened once, even where parts overlap (a wing over the hull).
  planar ??= new THREE.ShaderMaterial({
    uniforms,
    vertexShader: planarVertex,
    fragmentShader: planarFragment,
    side: THREE.DoubleSide,
    ...multiply,
    stencilWrite: true,
    stencilRef: STENCIL.shadow,
    stencilFuncMask: STENCIL.shadow,
    stencilWriteMask: STENCIL.shadow,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  return planar;
}

function blobMaterial(): THREE.ShaderMaterial {
  blob ??= new THREE.ShaderMaterial({ uniforms, vertexShader: blobVertex, fragmentShader: blobFragment, ...multiply });
  return blob;
}

const blobQuad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * The shadow meshes for a model: add them as children of the model's object.
 * Returns a function that stops them following the parameters.
 */
export function groundShadows(geometry: THREE.BufferGeometry, parent: THREE.Object3D): () => void {
  const planarMesh = new THREE.Mesh(geometry, planarMaterial());
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const blobMesh = new THREE.Mesh(blobQuad, blobMaterial());
  blobMesh.scale.set(size.x * 0.78, 1, size.z * 0.92); // a bit inside the silhouette, as in the demo
  for (const mesh of [planarMesh, blobMesh]) {
    mesh.renderOrder = 1; // after the opaque pass, over the ground
    mesh.frustumCulled = false; // the shadow is away from the model's bounds
    parent.add(mesh);
  }
  return onParams((p) => {
    planarMesh.visible = groundOn && p.groundShadow === 'planar';
    blobMesh.visible = groundOn && p.groundShadow === 'blob';
  });
}
