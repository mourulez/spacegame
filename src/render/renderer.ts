import * as THREE from 'three';

/*
 * The WebGL renderer as the game sets it up. The viewer uses the same one,
 * so a model looks there exactly as it does in the game.
 */

const MAX_PIXEL_RATIO = 2; // high-DPI phones would otherwise render 3x+

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  // At 2x pixel density and up, edges are fine without MSAA, which is costly on phones.
  const antialias = window.devicePixelRatio < 2;
  return new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
}

/** Size the drawing buffer to the canvas's CSS size, at the capped pixel ratio. */
export function resizeRenderer(renderer: THREE.WebGLRenderer, width: number, height: number) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(width, height, false);
}
