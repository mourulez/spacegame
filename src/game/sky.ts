import * as THREE from 'three';
import skyUrl from '../assets/textures/sky.jpg';
import { type Atmosphere, CLOUD_SPEEDUP, HAZE_DISTANCE } from './atmosphere';
import { fractalNoise } from './noise';

const RADIUS = 400; // must stay inside the camera's far plane

/*
 * The painted sky (src/assets/textures/sky.jpg, source in art/) is grayscale on
 * purpose: its brightness is mapped to the current atmosphere's sky colors, so
 * the time of day can change it. Its bottom edge is the horizon.
 */

/** Painted brightness taken as black and as white, before applying the palette. */
const LEVELS = { black: 0.25, white: 1 } as const;
/** The painting covers this much of the horizon per image width, and is mirrored to go all the way round. */
const PAINTING_ARC = Math.PI;
/** Elevation, in radians, the painting's height covers above the horizon. */
const PAINTING_HEIGHT = THREE.MathUtils.degToRad(60);
/** Where the painted sun is across the image (0..1); it is placed straight ahead at the start. */
const PAINTING_SUN_U = 0.51;

/** World units covered by one repeat of the cloud deck texture, at its two scales. */
const DECK_SCALE_A = 180;
const DECK_SCALE_B = 61;
const DECK_TEXTURE_SIZE = 256;

/**
 * Sky dome that follows the camera, so it always looks infinitely far away.
 * Above the horizon, the painted sky. Below it, a soft cloud deck at y = 0:
 * each pixel finds where its view ray meets the deck, at the camera's real
 * altitude, so the perspective and the horizon are true 3D. Close clouds are
 * blurred and far ones dissolve into a milky haze, so the deck reads as soft
 * cloud rushing past rather than as ground. One draw call, at most two
 * texture reads per visible pixel.
 */
export class Sky {
  readonly object: THREE.Mesh;
  private readonly altitude = { value: 10 };
  // Camera position within one texture repeat, at each deck scale (xy: A, zw: B).
  // Kept small so the shader's float precision holds however far the flight goes.
  private readonly deckOffset = { value: new THREE.Vector4() };

  constructor(atmosphere: Atmosphere) {
    // Colors are the atmosphere's own objects, so they follow the time of day.
    const uniforms = {
      painting: { value: null as THREE.Texture | null },
      paintingReady: { value: 0 },
      shadow: { value: atmosphere.sky[0] },
      mid: { value: atmosphere.sky[1] },
      light: { value: atmosphere.sky[2] },
      levels: { value: new THREE.Vector2(LEVELS.black, LEVELS.white) },
      horizonGlow: { value: atmosphere.horizonGlow },
      haze: { value: atmosphere.haze },
      hazeDistance: { value: HAZE_DISTANCE },
      deck: { value: deckTexture() },
      cloudShadow: { value: atmosphere.cloud[0] },
      cloudMid: { value: atmosphere.cloud[1] },
      cloudLight: { value: atmosphere.cloud[2] },
      altitude: this.altitude,
      deckOffset: this.deckOffset,
    };

    new THREE.TextureLoader().load(skyUrl, (texture) => {
      texture.wrapS = THREE.MirroredRepeatWrapping; // edges don't match, so mirror around the horizon
      texture.wrapT = THREE.ClampToEdgeWrapping;
      uniforms.painting.value = texture;
      uniforms.paintingReady.value = 1;
    });

    // SphereGeometry's uv.x runs around the horizon (0.75 is straight ahead, -Z, and it
    // decreases to the right) and uv.y from the bottom pole to the top one. Mapping
    // them to the painting per vertex keeps the per-pixel work to one texture read,
    // and the sphere's duplicated seam vertices keep the mapping continuous.
    const uScale = (2 * Math.PI) / PAINTING_ARC;
    const vScale = Math.PI / PAINTING_HEIGHT;

    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        varying vec2 vPaintingUv;
        void main() {
          vDir = position;
          vPaintingUv = vec2((0.75 - uv.x) * ${uScale.toFixed(6)} + ${PAINTING_SUN_U.toFixed(6)}, (uv.y - 0.5) * ${vScale.toFixed(6)});
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          // On the far plane, so it is drawn last and only where nothing else covers it.
          gl_Position.z = gl_Position.w;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D painting;
        uniform float paintingReady;
        uniform vec3 shadow;
        uniform vec3 mid;
        uniform vec3 light;
        uniform vec2 levels;
        uniform vec3 horizonGlow;
        uniform vec3 haze;
        uniform float hazeDistance;
        uniform sampler2D deck;
        uniform vec3 cloudShadow;
        uniform vec3 cloudMid;
        uniform vec3 cloudLight;
        uniform float altitude;
        uniform vec4 deckOffset;
        varying vec3 vDir;
        varying vec2 vPaintingUv;

        vec3 ramp(float v, vec3 dark, vec3 middle, vec3 bright) {
          return v < 0.5 ? mix(dark, middle, v * 2.0) : mix(middle, bright, v * 2.0 - 1.0);
        }

        void main() {
          vec3 dir = normalize(vDir);
          float e = dir.y; // sine of the elevation angle
          vec3 color;
          if (e > 0.0) {
            // Plain gradient until the painting loads.
            vec3 gradient = mix(light, shadow, pow(clamp(e / 0.7, 0.0, 1.0), 0.6));
            float painted = clamp((texture2D(painting, vPaintingUv).r - levels.x) / (levels.y - levels.x), 0.0, 1.0);
            color = mix(gradient, ramp(painted, shadow, mid, light), paintingReady);
            // Atmospheric haze toward the horizon.
            color = mix(color, haze, exp(-e / 0.05) * 0.85);
          } else {
            // Distance along the view ray down to the deck.
            float t = min(altitude / max(-e, 1e-4), 1e4);
            vec2 p = dir.xz * t;
            // Blur the clouds just below the camera: they rush past and must not look like ground.
            float blur = 3.0 * (1.0 - smoothstep(0.0, 40.0, t));
            float density =
              texture2D(deck, p / ${DECK_SCALE_A.toFixed(1)} + deckOffset.xy, blur).r * 0.65 +
              texture2D(deck, p / ${DECK_SCALE_B.toFixed(1)} + deckOffset.zw, blur).r * 0.35;
            color = mix(ramp(density, cloudShadow, cloudMid, cloudLight), haze, 1.0 - exp(-t / hazeDistance));
          }
          // Soft glow along the horizon rather than a hard line.
          color = mix(color, horizonGlow, exp(-abs(e) * 60.0) * 0.5);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.object = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 32), material);
    this.object.renderOrder = 1; // after the other opaque objects, so covered pixels are skipped
    this.object.frustumCulled = false;
  }

  /** Follow the camera: center the dome on it and move the cloud deck under it, CLOUD_SPEEDUP times faster. */
  update(camera: THREE.Vector3) {
    this.object.position.copy(camera);
    this.altitude.value = Math.max(camera.y, 0.5);
    const x = camera.x * CLOUD_SPEEDUP;
    const z = camera.z * CLOUD_SPEEDUP;
    this.deckOffset.value.set(fract(x / DECK_SCALE_A), fract(z / DECK_SCALE_A), fract(x / DECK_SCALE_B), fract(z / DECK_SCALE_B));
  }
}

function fract(x: number) {
  return x - Math.floor(x);
}

/** Soft, tileable cloud density: large rounded shapes, no hard edges. Single channel. */
function deckTexture(): THREE.DataTexture {
  const size = DECK_TEXTURE_SIZE;
  const noise = fractalNoise(size, 5, 4, 4);
  const data = new Uint8Array(size * size);
  for (let i = 0; i < data.length; i++) {
    data[i] = 255 * THREE.MathUtils.smoothstep(noise[i], 0.3, 0.72);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
