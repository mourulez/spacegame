import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * The model list, bundled into the viewer (never into the game): the viewer's own test models
 * (viewer/samples/, in the repo, keyed "samples/<path>") and the user's models (art/models/, kept out of
 * the repo, keyed by their path there).
 */
const samples = import.meta.glob<string>('./samples/**/*.glb', { query: '?url', import: 'default', eager: true });
const art = import.meta.glob<string>('../art/models/**/*.glb', { query: '?url', import: 'default', eager: true });
export const MODELS = [
  ...Object.entries(samples).map(([path, url]) => ({ key: path.slice('./'.length), url })),
  ...Object.entries(art).map(([path, url]) => ({ key: path.slice('../art/models/'.length), url })),
].sort((a, b) => a.key.localeCompare(b.key));

/** A built-in test shape for when there is no model: a curved surface, flat faces and a busy silhouette, nose toward -Z. */
export function sampleGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.SphereGeometry(0.5, 32, 16).translate(-1.2, 0, 0),
    new THREE.BoxGeometry(0.8, 0.8, 0.8).rotateY(0.6).rotateX(0.4),
    new THREE.TorusKnotGeometry(0.35, 0.12, 128, 16).translate(1.2, 0, 0),
  ].map((g) => {
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', g.getAttribute('position'));
    part.setAttribute('normal', g.getAttribute('normal'));
    part.setIndex(g.getIndex());
    return part.toNonIndexed();
  });
  return mergeGeometries(parts)!;
}
