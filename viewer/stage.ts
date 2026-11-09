import * as THREE from 'three';
import type { celMaterial } from './render-next/index.ts';

/*
 * What surrounds a model in the viewer: a neutral grey background, so colors
 * read as they are, a ground for its shadow, and the camera at the distance
 * the player sees their ship from (src/game/play-area.ts). The light is the
 * render library's: it is part of the look.
 */

const BACKGROUND = 0x8c8c8c;

/** The ground's height: as far below a model as the demo's ground below its ship. */
export const GROUND_Y = -1.5;

/** Behind the ship and above it, as the chase camera sees it. */
export const GAME_VIEW = { position: new THREE.Vector3(0, 0.84, 6), target: new THREE.Vector3(0, 0, 0) };
export const FOV = 50;

export function createStage(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.Fog(BACKGROUND, 20, 65); // the ground fades into the background
  return scene;
}

/** A neutral grey checker: 2×2 texels, repeated. */
function checker(): THREE.DataTexture {
  const a = [0xd2, 0xd2, 0xd2, 255], b = [0xbe, 0xbe, 0xbe, 255];
  const texture = new THREE.DataTexture(new Uint8Array([...a, ...b, ...b, ...a]), 2, 2, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.repeat.set(48, 48);
  texture.needsUpdate = true;
  return texture;
}

/** A large flat ground in the library's cel material. */
export function createGround(material: typeof celMaterial): THREE.Mesh {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2),
    material({ color: 0xffffff, map: checker(), shadow: 0xc8c8c8, spec: 0, hatch: false }),
  );
  ground.position.y = GROUND_Y;
  return ground;
}
