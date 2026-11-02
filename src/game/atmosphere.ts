import * as THREE from 'three';
import { STEP } from '../core/loop';

/*
 * Colors and light for the sky, the cloud deck and the ships, and how they
 * change through the day. Art is grayscale on purpose and gets its colors
 * here, so a time of day is just a set of values, and a sunset is the game
 * blending from one set to the next.
 */

/** Distance over which clouds fade into the haze (about 63% at this distance). Short, as in a milky sky. */
export const HAZE_DISTANCE = 140;

/**
 * The clouds below pass this many times faster than the flight really goes,
 * for a stronger sense of speed. Scenery only: the flight, enemies and shots
 * keep their real speed.
 */
export const CLOUD_SPEEDUP = 1.6;

/** Seconds of play from full day to dusk. The sky then stays at dusk. */
const SUNSET_DURATION = 120;

/** One time of day. Colors are sRGB hex. */
interface TimeOfDay {
  at: number; // position in the sunset, 0 (day) to 1 (dusk)
  /** Painted sky brightness mapped to color: darkest, middle and brightest tones. */
  sky: [number, number, number];
  /** Cloud deck brightness mapped to color. Close tones: the clouds are soft, not banded. */
  cloud: [number, number, number];
  /** What everything fades into with distance, and at the horizon. */
  haze: number;
  horizonGlow: number;
  ambient: number;
  ambientIntensity: number;
  sunLight: number;
  sunLightIntensity: number;
}

const TIMES: TimeOfDay[] = [
  {
    at: 0, // day
    sky: [0x3a6cc8, 0x8dbcf0, 0xffffff],
    cloud: [0xb4c8e0, 0xe2ebf6, 0xffffff],
    haze: 0xe4ecf5,
    horizonGlow: 0xffffff,
    ambient: 0xdfeaff,
    ambientIntensity: 1.1,
    sunLight: 0xfff6e8,
    sunLightIntensity: 2.2,
  },
  {
    at: 0.35, // golden hour
    sky: [0x4a68b8, 0xaab6de, 0xffe9c4],
    cloud: [0xb9b4cf, 0xf0dcc6, 0xfff1dc],
    haze: 0xf3dcc0,
    horizonGlow: 0xffe0b0,
    ambient: 0xf0dcc8,
    ambientIntensity: 1.0,
    sunLight: 0xffd29a,
    sunLightIntensity: 2.2,
  },
  {
    at: 0.7, // sunset
    sky: [0x4b3f8f, 0xd77f78, 0xffc58a],
    cloud: [0x8a6a9a, 0xe79a7e, 0xffd0a0],
    haze: 0xf0a77e,
    horizonGlow: 0xffb070,
    ambient: 0xd9a0a0,
    ambientIntensity: 0.85,
    sunLight: 0xff9a5a,
    sunLightIntensity: 2.0,
  },
  {
    at: 1, // dusk
    sky: [0x1f2350, 0x5a4a86, 0xd88a8a],
    cloud: [0x3b3560, 0x7d6488, 0xc98c8a],
    haze: 0x8e6f8f,
    horizonGlow: 0xe08a70,
    ambient: 0x8f86b8,
    ambientIntensity: 0.7,
    sunLight: 0xd07a6a,
    sunLightIntensity: 1.2,
  },
];

/** The same keyframes as THREE.Colors (linear), converted once. */
const KEYS = TIMES.map((t) => ({
  ...t,
  skyColors: t.sky.map((c) => new THREE.Color(c)),
  cloudColors: t.cloud.map((c) => new THREE.Color(c)),
  hazeColor: new THREE.Color(t.haze),
  horizonGlowColor: new THREE.Color(t.horizonGlow),
  ambientColor: new THREE.Color(t.ambient),
  sunLightColor: new THREE.Color(t.sunLight),
}));

/**
 * The current atmosphere. Its Colors are shared, by reference,
 * with the sky shader's uniforms and the scene lights, so updating it here
 * updates them all.
 */
export class Atmosphere {
  readonly sky = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  readonly cloud = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  readonly haze = new THREE.Color();
  readonly horizonGlow = new THREE.Color();
  readonly ambient: THREE.AmbientLight;
  readonly sunLight: THREE.DirectionalLight;

  /** Position in the sunset, 0 (day) to 1 (dusk). */
  private progress: number;

  constructor(start = 0) {
    this.ambient = new THREE.AmbientLight();
    this.sunLight = new THREE.DirectionalLight();
    this.sunLight.position.set(-3, 6, 4);
    this.progress = THREE.MathUtils.clamp(start, 0, 1);
    this.apply();
  }

  step() {
    if (this.progress >= 1) return;
    this.progress = Math.min(1, this.progress + STEP / SUNSET_DURATION);
    this.apply();
  }

  private apply() {
    let i = 0;
    while (i < KEYS.length - 2 && this.progress > KEYS[i + 1].at) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = THREE.MathUtils.smoothstep(this.progress, a.at, b.at);
    const lerp = THREE.MathUtils.lerp;

    for (let c = 0; c < 3; c++) {
      this.sky[c].lerpColors(a.skyColors[c], b.skyColors[c], t);
      this.cloud[c].lerpColors(a.cloudColors[c], b.cloudColors[c], t);
    }
    this.haze.lerpColors(a.hazeColor, b.hazeColor, t);
    this.horizonGlow.lerpColors(a.horizonGlowColor, b.horizonGlowColor, t);
    this.ambient.color.lerpColors(a.ambientColor, b.ambientColor, t);
    this.ambient.intensity = lerp(a.ambientIntensity, b.ambientIntensity, t);
    this.sunLight.color.lerpColors(a.sunLightColor, b.sunLightColor, t);
    this.sunLight.intensity = lerp(a.sunLightIntensity, b.sunLightIntensity, t);
  }
}
