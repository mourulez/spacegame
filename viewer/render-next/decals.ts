import * as THREE from 'three';

/*
 * The game's decal atlas: one texture for every decal, in a 2×2 grid of
 * slots. Models only say which slot each decal uses. Drawn in code for now;
 * it can become a PNG once there are decals worth painting.
 */

const SIZE = 256;
const SLOT = SIZE / 2;

let atlas: THREE.DataTexture | null = null;

export function decalAtlas(): THREE.DataTexture {
  if (atlas) return atlas;
  const data = new Uint8Array(SIZE * SIZE * 4); // transparent outside the drawings
  const fill = (x0: number, y0: number, w: number, h: number, hex: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) data.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], (y * SIZE + x) * 4);
    }
  };
  // Slot 0: a simple Spanish flag, 3:2, stripes 1:2:1. Rows go up from the bottom of the texture.
  const [x0, y0] = slotOrigin(0);
  const w = 120, h = 80, ox = x0 + (SLOT - w) / 2, oy = y0 + (SLOT - h) / 2;
  fill(ox, oy, w, h, 0xaa151b);
  fill(ox, oy + h / 4, w, h / 2, 0xf1bf00);

  atlas = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;
  return atlas;
}

/** A slot's bottom-left corner in pixels: slots 0 and 1 on the top row, 2 and 3 below. */
function slotOrigin(slot: number): [number, number] {
  return [(slot % 2) * SLOT, SLOT - Math.floor(slot / 2) * SLOT];
}

/** A slot's rectangle in UV: x, y (bottom-left), width, height. */
export function decalSlotRect(slot: number): THREE.Vector4 {
  const [x, y] = slotOrigin(slot);
  return new THREE.Vector4(x / SIZE, y / SIZE, SLOT / SIZE, SLOT / SIZE);
}
