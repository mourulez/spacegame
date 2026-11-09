import * as THREE from 'three';

/*
 * The WebGL renderer as the look needs it, and its resolution: native
 * (capped), 1×, or stepped automatically by frame time.
 */

const MAX_PIXEL_RATIO = 2; // high-DPI phones would otherwise render 3x+

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  // Stencil: the ground shadow darkens each pixel only once where parts overlap.
  return new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
}

export type ResolutionMode = 'auto' | '1' | 'native';

/**
 * The renderer's pixel ratio. In auto mode it steps down when frames take
 * clearly longer than the display's refresh, and back up after a while of
 * frames on time.
 */
export class Resolution {
  private readonly max = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  private readonly levels = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].filter((l) => l <= this.max + 1e-6);
  private level = Math.max(0, this.levels.indexOf(1));
  private mode: ResolutionMode = 'native';
  private width = 1;
  private height = 1;
  private readonly deltas = new Float32Array(240);
  private readonly sorted = new Float32Array(240);
  private count = 0;
  private index = 0;
  private sinceCheck = 0;
  private lock = 0;
  private goodWindows = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  /** The pixel ratio the current mode asks for. */
  ratio(): number {
    if (this.mode === '1') return Math.min(1, this.max);
    if (this.mode === 'native') return this.max;
    return this.levels[this.level];
  }

  setMode(mode: ResolutionMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.lock = 0;
    this.apply();
  }

  /** Size the drawing buffer to the canvas's CSS size. */
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.apply();
  }

  /** Feed each frame's real duration. Returns true when the pixel ratio changed. */
  frame(deltaMs: number): boolean {
    this.deltas[this.index] = deltaMs;
    this.index = (this.index + 1) % this.deltas.length;
    this.count = Math.min(this.count + 1, this.deltas.length);
    this.sinceCheck += deltaMs;
    if (this.mode !== 'auto' || this.sinceCheck < 750 || this.count <= 60) return false;
    this.sinceCheck = 0;
    const vsync = this.percentile(0.1);
    const typical = this.percentile(0.5);
    if (this.lock > 0) this.lock--;
    if (typical > vsync * 1.25 && this.level > 0) {
      this.level--;
      this.goodWindows = 0;
      this.lock = 12;
      return this.changed();
    }
    if (typical <= vsync * 1.08 && this.level < this.levels.length - 1 && this.lock === 0) {
      if (++this.goodWindows >= 3) {
        this.level++;
        this.goodWindows = 0;
        return this.changed();
      }
    } else {
      this.goodWindows = 0;
    }
    return false;
  }

  private changed(): boolean {
    this.count = 0;
    this.apply();
    return true;
  }

  private percentile(p: number): number {
    this.sorted.set(this.deltas);
    const recent = this.sorted.subarray(0, this.count).sort();
    return recent[Math.min(this.count - 1, Math.floor(p * (this.count - 1)))];
  }

  private apply() {
    this.renderer.setPixelRatio(this.ratio());
    this.renderer.setSize(this.width, this.height, false);
  }
}
