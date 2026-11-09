import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as initialLib from './render-next/index.ts';
import type { CelAsset, CelModel, CelParams } from './render-next/index.ts';
import { MODELS, sampleGeometry } from './models';
import { plainMaterial, wireMaterial } from './inspect';
import { createParamsPanel } from './panel';
import { createGround, createStage, FOV, GAME_VIEW, GROUND_Y } from './stage';

/*
 * The viewer: one model drawn by the experimental render library
 * (render-next), with a panel for every setting of the look. Editing the
 * library, its GLSL included, rebuilds the model in place without losing the
 * camera or the settings.
 */

type RenderLib = typeof initialLib;
type Source = { kind: 'sample' } | { kind: 'url'; key: string; url: string } | { kind: 'file'; name: string; data: ArrayBuffer };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view');
const hud = $('hud');
const status = $('status');
const modelSelect = $<HTMLSelectElement>('model');

let lib: RenderLib = initialLib;
const renderer = lib.createRenderer(canvas);
renderer.info.autoReset = false; // counted over every pass of the frame
const resolution = new lib.Resolution(renderer);
let bloom = new lib.Bloom(renderer);
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
const scene = createStage();
let sun = lib.createSun();
scene.add(sun);
let ground = createGround(lib.celMaterial);
scene.add(ground);
const groundToggle = $<HTMLInputElement>('ground');

function applyGround() {
  ground.visible = groundToggle.checked;
  lib.setGround(groundToggle.checked ? GROUND_Y : null);
}
groundToggle.addEventListener('change', () => {
  applyGround();
  save();
});

// Time, in fixed steps like the game's loop (src/core/loop.ts), so animation never depends on the frame rate.
const STEP = 1 / 60;
let steps = 0;
let accumulator = 0;

/** Advance the clock by a real frame's duration. */
function advance(deltaMs: number) {
  accumulator = Math.min(accumulator + deltaMs / 1000, 5 * STEP); // after a long stall, don't race to catch up
  while (accumulator >= STEP) {
    steps++;
    accumulator -= STEP;
  }
}

let asset: CelAsset | null = null;
let model: CelModel | null = null;

// The geometry on its own: without the cel effects, and the wireframe over whatever is shown.
let plain: THREE.Mesh | null = null;
const wire = new THREE.Mesh(undefined, wireMaterial());
wire.visible = false;
scene.add(wire);
const wireButton = $<HTMLButtonElement>('wireframe');
const effectsButton = $<HTMLButtonElement>('effects');
const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed') === 'true';

function applyView() {
  const effects = pressed(effectsButton);
  if (model) model.object.visible = effects;
  if (plain) plain.visible = !effects;
  wire.visible = pressed(wireButton) && !!asset;
}
for (const b of [wireButton, effectsButton]) {
  b.addEventListener('click', () => {
    b.setAttribute('aria-pressed', String(!pressed(b)));
    applyView();
    save();
  });
}

// What is shown, kept across reloads (editing the viewer's own code reloads the page).
const STORAGE_KEY = 'viewer-state';
interface Saved {
  model: string;
  camera: number[];
  target: number[];
  params: Partial<CelParams>;
  ground: boolean;
  wireframe: boolean;
  effects: boolean;
}
let source: Source = { kind: 'sample' };
let params: CelParams = { ...lib.DEFAULT_PARAMS };

function save() {
  const saved: Saved = {
    model: source.kind === 'url' ? source.key : 'sample',
    camera: camera.position.toArray(),
    target: controls.target.toArray(),
    params,
    ground: groundToggle.checked,
    wireframe: pressed(wireButton),
    effects: pressed(effectsButton),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage blocked: the viewer just starts from the defaults next time.
  }
}

function restore(): Partial<Saved> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Saved>;
  } catch {
    return {};
  }
}

/** The library's defaults, overridden by saved values for the settings it still has. */
function withDefaults(saved: Partial<CelParams> = {}): CelParams {
  const result = { ...lib.DEFAULT_PARAMS };
  for (const key of Object.keys(result) as (keyof CelParams)[]) {
    if (typeof saved[key] === typeof result[key]) (result as Record<string, unknown>)[key] = saved[key];
  }
  return result;
}

const panel = createParamsPanel($('params'), (changes) => {
  params = { ...params, ...changes };
  applyParams();
  save();
});

/** Hand the settings to the library and the renderer, and show them. */
function applyParams() {
  lib.setParams(params);
  resolution.setMode(params.resolution);
  lib.setViewport(renderer);
  panel.update(params, model?.features ?? lib.NO_FEATURES, lib.DEFAULT_PARAMS);
}

$('reset-params').addEventListener('click', () => {
  params = { ...lib.DEFAULT_PARAMS };
  applyParams();
  save();
});

function gameView() {
  camera.position.copy(GAME_VIEW.position);
  controls.target.copy(GAME_VIEW.target);
  controls.update();
}

async function loadSource(): Promise<CelAsset> {
  if (source.kind === 'sample') return lib.normalizeAsset(lib.assetFromGeometry(sampleGeometry()));
  const input = source.kind === 'url' ? source.url : source.data.slice(0);
  return lib.normalizeAsset(await lib.loadAsset(input));
}

/** What the asset carries, for the status line. */
function describe(a: CelAsset): string {
  const triangles = a.geometry.getAttribute('position').count / 3;
  const parts = [`${triangles.toLocaleString('es-ES')} triángulos`];
  if (a.palette) parts.push(`${a.zones.length} zonas`);
  if (a.emitters.length) parts.push(`${a.emitters.length} emisivos`);
  if (a.decals.length) parts.push(`${a.decals.length} calcomanías`);
  if (a.nozzles.length) parts.push(`${a.nozzles.length} toberas`);
  if (a.muzzles.length) parts.push(`${a.muzzles.length} cañones`);
  return parts.join(' · ');
}

let building = 0;
/** Load the current source and give it the library's look. */
async function rebuild() {
  const id = ++building;
  status.textContent = 'Cargando…';
  try {
    const next = await loadSource();
    if (id !== building) {
      lib.disposeAsset(next);
      return; // a newer rebuild started meanwhile
    }
    if (model) {
      scene.remove(model.object);
      model.dispose();
    }
    if (plain) {
      scene.remove(plain);
      (plain.material as THREE.Material).dispose();
    }
    if (asset) lib.disposeAsset(asset);
    asset = next;
    model = lib.celModel(asset);
    plain = new THREE.Mesh(asset.geometry, plainMaterial(asset.palette));
    wire.geometry = asset.geometry;
    scene.add(model.object, plain);
    applyView();
    applyParams();
    status.textContent = `${sourceName()}: ${describe(asset)}`;
  } catch (error) {
    if (id === building) status.textContent = `No se pudo cargar ${sourceName()}: ${(error as Error).message}`;
  }
}

function sourceName(): string {
  if (source.kind === 'sample') return 'Muestra';
  return source.kind === 'url' ? source.key : source.name;
}

function setSource(next: Source) {
  source = next;
  save();
  void rebuild();
}

function fillModelList() {
  modelSelect.replaceChildren(new Option('Muestra', 'sample'), ...MODELS.map((m) => new Option(m.key, m.key)));
  if (source.kind === 'file') modelSelect.add(new Option(`Archivo: ${source.name}`, 'file'));
  modelSelect.value = source.kind === 'url' ? source.key : source.kind;
}

modelSelect.addEventListener('change', () => {
  const entry = MODELS.find((m) => m.key === modelSelect.value);
  if (entry) setSource({ kind: 'url', key: entry.key, url: entry.url });
  else if (modelSelect.value === 'sample') setSource({ kind: 'sample' });
});

async function openFile(file: File) {
  setSource({ kind: 'file', name: file.name, data: await file.arrayBuffer() });
  fillModelList();
}
$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void openFile(file);
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.name.toLowerCase().endsWith('.glb'));
  if (file) void openFile(file);
});

$('game-view').addEventListener('click', () => {
  gameView();
  save();
});
controls.addEventListener('end', save);

const panelToggle = $('panel-toggle');
panelToggle.addEventListener('click', () => {
  panelToggle.setAttribute('aria-expanded', String(panelToggle.getAttribute('aria-expanded') !== 'true'));
});

function resize() {
  resolution.resize(canvas.clientWidth, canvas.clientHeight);
  lib.setViewport(renderer);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// Frame times for the HUD: median and 95th percentile over the last couple of seconds.
const deltas = new Float32Array(120);
const sorted = new Float32Array(deltas.length);
let deltaCount = 0;
let deltaIndex = 0;
let lastTime = 0;
let hudTime = 0;
const drawingBuffer = new THREE.Vector2();

function updateHud(time: number, delta: number) {
  deltas[deltaIndex] = delta;
  deltaIndex = (deltaIndex + 1) % deltas.length;
  deltaCount = Math.min(deltaCount + 1, deltas.length);
  if (time - hudTime < 250 || deltaCount < 10) return;
  hudTime = time;
  sorted.set(deltas);
  const recent = sorted.subarray(0, deltaCount).sort();
  const median = recent[Math.floor(deltaCount / 2)];
  const p95 = recent[Math.min(deltaCount - 1, Math.floor(deltaCount * 0.95))];
  const { calls, triangles } = renderer.info.render;
  renderer.getDrawingBufferSize(drawingBuffer);
  hud.textContent =
    `${Math.round(1000 / median)} fps · p95 ${p95.toFixed(1)} ms\n` +
    `${calls} draw calls · ${triangles.toLocaleString('es-ES')} triángulos\n` +
    `${renderer.info.programs?.length ?? 0} programas · ${renderer.getPixelRatio()}× ${drawingBuffer.x}×${drawingBuffer.y}`;
}

renderer.setAnimationLoop((time) => {
  const delta = lastTime ? time - lastTime : 0;
  lastTime = time;
  if (delta > 0 && resolution.frame(delta)) lib.setViewport(renderer);
  advance(delta);
  model?.update(steps * STEP);
  renderer.info.reset();
  renderer.render(scene, camera);
  if (model && pressed(effectsButton)) bloom.render(camera, [model]);
  if (delta > 0) updateHud(time, delta);
});

// Editing the render library (TypeScript or GLSL) swaps it in and rebuilds the model, keeping the view.
if (import.meta.hot) {
  import.meta.hot.accept('./render-next/index.ts', (next) => {
    if (!next) return;
    lib = next as unknown as RenderLib;
    bloom.dispose();
    bloom = new lib.Bloom(renderer);
    scene.remove(sun, ground);
    (ground.material as THREE.Material).dispose();
    sun = lib.createSun();
    ground = createGround(lib.celMaterial);
    scene.add(sun, ground);
    applyGround();
    params = withDefaults(params);
    applyParams();
    void rebuild();
  });
}

// Start: a model named in the URL (?model=ships/fighter.glb), else what was shown last, else the sample.
const saved = restore();
const wanted = new URLSearchParams(location.search).get('model') ?? saved.model;
const start = MODELS.find((m) => m.key === wanted);
if (start) source = { kind: 'url', key: start.key, url: start.url };
params = withDefaults(saved.params);
groundToggle.checked = saved.ground ?? true;
applyGround();
wireButton.setAttribute('aria-pressed', String(saved.wireframe ?? false));
effectsButton.setAttribute('aria-pressed', String(saved.effects ?? true));
fillModelList();
if (saved.camera?.length === 3 && saved.target?.length === 3) {
  camera.position.fromArray(saved.camera);
  controls.target.fromArray(saved.target);
  controls.update();
} else {
  gameView();
}
resize();
applyParams();
void rebuild();
