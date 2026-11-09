import * as THREE from 'three';
import { getParams } from './look';
import type { CelModel } from './model';
import compositeFragment from './shaders/bloom.composite.frag.glsl?raw';
import downFragment from './shaders/bloom.down.frag.glsl?raw';
import postVertex from './shaders/bloom.post.vert.glsl?raw';
import upFragment from './shaders/bloom.up.frag.glsl?raw';

/*
 * Selective, cheap bloom: only the models' emissive areas glow.
 * 1. The models are drawn again at 1/4 resolution with only their emissive
 *    cores lit (the rest black, which also hides what is behind them).
 * 2. Dual filtering (ARM) blurs it: down and back up through smaller targets.
 * 3. One fullscreen quad adds the glow over the image already on screen.
 * The scene itself is still drawn straight to the screen, with its
 * antialiasing, never copied to a texture.
 */

const LEVELS = 3; // 1/4 → 1/8 → 1/16 → 1/32 and back
const STRENGTH = 1.6;

function post(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, extra: THREE.ShaderMaterialParameters = {}) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: postVertex, fragmentShader, depthTest: false, depthWrite: false, ...extra });
}

export class Bloom {
  private readonly renderer: THREE.WebGLRenderer;
  private targets: THREE.WebGLRenderTarget[] = [];
  private readonly glowScene = new THREE.Scene();
  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private readonly down = post(downFragment, { tSrc: { value: null }, uHalf: { value: new THREE.Vector2() } });
  private readonly up = post(upFragment, { tSrc: { value: null }, uHalf: { value: new THREE.Vector2() } });
  private readonly composite = post(compositeFragment, { tSrc: { value: null }, uStrength: { value: STRENGTH } }, { transparent: true, blending: THREE.AdditiveBlending });
  private readonly size = new THREE.Vector2();
  private readonly clearColor = new THREE.Color();

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
  }

  /** Add the glow of these models' emissive areas over what was just drawn to the screen, seen from `camera`. */
  render(camera: THREE.Camera, models: readonly CelModel[]) {
    const params = getParams();
    if (!params.bloom || !params.emissive) return;
    const glowing = models.filter((m) => m.glow);
    if (glowing.length === 0) return;
    this.fit();
    for (const m of glowing) {
      m.glow!.matrixWorld.copy(m.object.matrixWorld);
      this.glowScene.add(m.glow!);
    }

    const r = this.renderer;
    r.getClearColor(this.clearColor);
    const clearAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.targets[0]);
    r.clear();
    r.render(this.glowScene, camera);
    for (let i = 0; i < LEVELS; i++) this.pass(this.down, this.targets[i], this.targets[i + 1]);
    for (let i = LEVELS; i > 0; i--) this.pass(this.up, this.targets[i], this.targets[i - 1]);
    r.setClearColor(this.clearColor, clearAlpha);
    r.setRenderTarget(null);
    const autoClear = r.autoClear;
    r.autoClear = false;
    this.quad.material = this.composite;
    this.composite.uniforms.tSrc.value = this.targets[0].texture;
    r.render(this.postScene, this.postCamera);
    r.autoClear = autoClear;

    for (const m of glowing) this.glowScene.remove(m.glow!);
  }

  dispose() {
    for (const t of this.targets) t.dispose();
    for (const m of [this.down, this.up, this.composite]) m.dispose();
    this.quad.geometry.dispose();
  }

  /** Size the targets to the drawing buffer, when it changed. */
  private fit() {
    this.renderer.getDrawingBufferSize(this.size);
    let w = Math.max(1, Math.floor(this.size.x / 4));
    let h = Math.max(1, Math.floor(this.size.y / 4));
    if (this.targets[0]?.width === w && this.targets[0]?.height === h) return;
    for (const t of this.targets) t.dispose();
    this.targets = [];
    for (let i = 0; i <= LEVELS; i++) {
      this.targets.push(new THREE.WebGLRenderTarget(w, h, { depthBuffer: i === 0, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }));
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
  }

  private pass(material: THREE.ShaderMaterial, source: THREE.WebGLRenderTarget, target: THREE.WebGLRenderTarget) {
    this.quad.material = material;
    material.uniforms.tSrc.value = source.texture;
    material.uniforms.uHalf.value.set(0.5 / source.width, 0.5 / source.height);
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCamera);
  }
}
