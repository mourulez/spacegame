import * as THREE from 'three';
import { type Atmosphere, HAZE_DISTANCE } from './atmosphere';
import { railPoints } from './flight';
import { fractalNoise, mulberry32 } from './noise';

/*
 * A blanket of billowing cloud just below the lowest the flight goes, over
 * the whole area around the rail, after the mobile cloud technique in https://habr.com/en/post/345186: the clouds are
 * plain spheres, drawn at a quarter of the screen's resolution as normals,
 * distance and coverage, then blurred so the spheres melt into soft billows,
 * then lit and laid over the scene in one full-screen pass, at the depth
 * their stored distance gives, so they hide what flies inside or behind them.
 * They dissolve as the camera flies into them, and never cover anything
 * closer than CLEAR_DISTANCE: the player's ship and the reticle.
 */

/** Size of the cloud buffers, as a share of the drawing buffer, and the most texels high they get. */
const BUFFER_SCALE = 0.25;
const MAX_BUFFER_HEIGHT = 320;
/** Reach of the blur, as a share of the screen's height, so it looks the same at any resolution. */
const BLUR_REACH = 0.018;
/** Distances are stored as a share of this. Beyond it the haze has swallowed the clouds anyway. */
const MAX_DISTANCE = 450;

/** How far beyond the rail, in every direction, the blanket reaches: as far as it can be seen from it. */
const LAYOUT_MARGIN = MAX_DISTANCE;
/** Spacing of the jittered grid the blanket's puffs sit on. Smaller than the puffs, so they merge into one surface. */
const PUFF_SPACING = 26;
const PUFF_RADIUS = { min: 10, max: 30 } as const;
/** Puffs are flattened to this share of their width, varying from one to the next. */
const PUFF_FLATTEN = { min: 0.4, max: 0.8 } as const;
/**
 * Heights the puffs' tops reach, rolling between them in slow swells. The
 * camera never goes below y = 3 (the rail's lowest point minus the corridor)
 * and the ship sits up to about 2 below it, so the highest tops pass just
 * under the ship. The cloud deck plane at y = 0 carries the blanket on beyond
 * the distance it is drawn to.
 */
const PUFF_TOP = { min: -9, max: 0.5 } as const;
/** Share of the puffs that billow up into mounds, and how high their tops reach. */
const MOUND_SHARE = 0.05;
const MOUND_TOP = { min: 3, max: 12 } as const;
/** Mounds keep this far from the rail horizontally, so they never stand in the flight's way. */
const MOUND_RAIL_CLEARANCE = 45;
/** Side of the square chunks the blanket is drawn in, so the ones off screen or too far are skipped. */
const CHUNK_SIZE = 200;
/** Distance from the camera across which the blanket dissolves, so skimming it never fills the screen. */
const NEAR_FADE = { from: 2, to: 10 } as const;
/** The clouds never cover anything closer than this: the player's ship (6 ahead) and the reticle (drawn 9 ahead). */
const CLEAR_DISTANCE = 10;

/** How far the clouds' undersides take on the sky's deepest tone, beyond the cloud palette's own shadow. */
const UNDERSIDE_SKY = 0.4;

/** Most opacity the blanket reaches, so the deck shows through it everywhere. */
const OPACITY = 0.7;

/** Toward the light, in world space: mostly from above, so the clouds are lit on top and shaded underneath whichever way the flight goes. */
const LIGHT_DIRECTION = new THREE.Vector3(0.25, 1, -0.6).normalize();

const NOISE_SIZE = 128;
/** World units covered by one repeat of the detail noise. */
const NOISE_SCALE = 14;

export class Clouds {
  /** Lays the clouds over the scene. Add it to the main scene. */
  readonly composite: THREE.Mesh;

  private readonly chunks = new THREE.Scene();
  // The main camera's view, but only as far as the clouds are drawn, so the far chunks are culled.
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly targetA: THREE.WebGLRenderTarget; // puffs, then the finished blur
  private readonly targetB: THREE.WebGLRenderTarget; // halfway through the blur
  private readonly blur: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blurStep = new THREE.Vector2();
  private readonly lightView = { value: new THREE.Vector3() };
  private readonly cameraProjection = { value: new THREE.Matrix4() };
  private aspect = 1;

  // Scratch values, reused every frame.
  private readonly clearColor = new THREE.Color();

  constructor(atmosphere: Atmosphere) {
    this.camera.far = MAX_DISTANCE;
    this.camera.matrixAutoUpdate = false;
    this.camera.matrixWorldAutoUpdate = false;
    const noise = noiseTexture();

    const puffMaterial = new THREE.ShaderMaterial({
      uniforms: {
        detailNoise: { value: noise },
        maxDistance: { value: MAX_DISTANCE },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec3 vWorldNormal;
        varying vec3 vViewNormal;
        varying vec3 vView;
        void main() {
          mat4 model = modelMatrix * instanceMatrix;
          vec4 world = model * vec4(position, 1.0);
          vWorld = world.xyz;
          vWorldNormal = normalize(mat3(model) * normal);
          vViewNormal = normalize(mat3(viewMatrix) * vWorldNormal);
          vec4 view = viewMatrix * world;
          vView = view.xyz;
          gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D detailNoise;
        uniform float maxDistance;
        varying vec3 vWorld;
        varying vec3 vWorldNormal;
        varying vec3 vViewNormal;
        varying vec3 vView;
        void main() {
          vec3 n = normalize(vViewNormal);
          vec3 toCamera = normalize(-vView);
          // Detail noise projected along the three axes, weighted by the normal, so it never stretches.
          vec3 w = vWorldNormal * vWorldNormal;
          float detail =
            texture2D(detailNoise, vWorld.yz / ${NOISE_SCALE.toFixed(1)}).r * w.x +
            texture2D(detailNoise, vWorld.zx / ${NOISE_SCALE.toFixed(1)}).r * w.y +
            texture2D(detailNoise, vWorld.xy / ${NOISE_SCALE.toFixed(1)}).r * w.z;
          // Thin toward the silhouette, and eaten away by the noise there.
          float cover = smoothstep(0.0, 0.9, dot(n, toCamera) + (detail - 0.5) * 1.3);
          // Dissolve close to the camera, and before the far end of the draw distance.
          float distance = length(vView);
          cover *= smoothstep(${NEAR_FADE.from.toFixed(1)}, ${NEAR_FADE.to.toFixed(1)}, distance);
          cover *= 1.0 - smoothstep(maxDistance * 0.75, maxDistance, distance);
          if (cover < 0.04) discard;
          // Premultiplied, so the blur blends cloud with empty sky correctly.
          vec3 data = vec3(n.xy * 0.5 + 0.5, min(distance / maxDistance, 1.0));
          gl_FragColor = vec4(data * cover, cover);
        }
      `,
    });
    const sphere = new THREE.SphereGeometry(1, 8, 6); // faceting melts away in the blur
    for (const matrices of layout()) {
      const chunk = new THREE.InstancedMesh(sphere, puffMaterial, matrices.length);
      matrices.forEach((m, i) => chunk.setMatrixAt(i, m));
      chunk.computeBoundingSphere(); // around all its puffs, for frustum culling
      this.chunks.add(chunk);
    }

    const bufferOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    };
    this.targetA = new THREE.WebGLRenderTarget(1, 1, { ...bufferOptions, depthBuffer: true });
    this.targetB = new THREE.WebGLRenderTarget(1, 1, bufferOptions);

    // Separable Gaussian, 13 taps in 7 reads thanks to linear filtering.
    this.blur = new THREE.Mesh(
      screenTriangle(),
      new THREE.ShaderMaterial({
        uniforms: { source: { value: null }, blurStep: { value: this.blurStep } },
        depthTest: false,
        depthWrite: false,
        vertexShader: SCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform sampler2D source;
          uniform vec2 blurStep;
          varying vec2 vUv;
          void main() {
            vec4 sum = texture2D(source, vUv) * 0.1964825501;
            sum += (texture2D(source, vUv + blurStep * 1.4117647059) + texture2D(source, vUv - blurStep * 1.4117647059)) * 0.2969069646;
            sum += (texture2D(source, vUv + blurStep * 3.2941176471) + texture2D(source, vUv - blurStep * 3.2941176471)) * 0.0944703979;
            sum += (texture2D(source, vUv + blurStep * 5.1764705882) + texture2D(source, vUv - blurStep * 5.1764705882)) * 0.0103813624;
            gl_FragColor = sum;
          }
        `,
      }),
    );
    this.blur.frustumCulled = false;

    // Colors are the atmosphere's own objects, so they follow the time of day.
    this.composite = new THREE.Mesh(
      screenTriangle(),
      new THREE.ShaderMaterial({
        uniforms: {
          clouds: { value: this.targetA.texture },
          lightView: this.lightView,
          skyShadow: { value: atmosphere.sky[0] },
          shadow: { value: atmosphere.cloud[0] },
          mid: { value: atmosphere.cloud[1] },
          light: { value: atmosphere.cloud[2] },
          haze: { value: atmosphere.haze },
          hazeDistance: { value: HAZE_DISTANCE }, // the same haze as the deck, which carries the blanket on
          maxDistance: { value: MAX_DISTANCE },
          cameraProjection: this.cameraProjection,
        },
        transparent: true,
        depthWrite: false,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = position.xy * 0.5 + 0.5;
            gl_Position = vec4(position.xy, 0.0, 1.0); // the fragment shader sets the depth
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D clouds;
          uniform vec3 lightView;
          uniform vec3 skyShadow;
          uniform vec3 shadow;
          uniform vec3 mid;
          uniform vec3 light;
          uniform vec3 haze;
          uniform float hazeDistance;
          uniform float maxDistance;
          uniform mat4 cameraProjection;
          varying vec2 vUv;

          vec3 ramp(float v, vec3 dark, vec3 middle, vec3 bright) {
            return v < 0.5 ? mix(dark, middle, v * 2.0) : mix(middle, bright, v * 2.0 - 1.0);
          }

          void main() {
            vec4 s = texture2D(clouds, vUv);
            if (s.a < 0.02) discard;
            vec3 data = s.rgb / s.a;
            vec2 nxy = data.xy * 2.0 - 1.0;
            vec3 n = vec3(nxy, sqrt(max(1.0 - dot(nxy, nxy), 0.0)));
            // Wrapped diffuse into the palette, with undersides deepened toward the sky's
            // shadow tone, plus a bright rim where the light comes from behind.
            float diffuse = clamp(dot(n, lightView) * 0.7 + 0.45, 0.0, 1.0);
            vec3 underside = mix(shadow, skyShadow, ${UNDERSIDE_SKY.toFixed(2)});
            vec3 color = ramp(diffuse, underside, mid, light);
            float rim = (1.0 - n.z) * (1.0 - n.z);
            color = mix(color, light, rim * max(-lightView.z, 0.0) * 0.8);
            float distance = data.z * maxDistance;
            color = mix(color, haze, 1.0 - exp(-distance / hazeDistance));
            // At the depth of the cloud's surface along this pixel's view ray, so whatever
            // is farther, or inside the cloud, ends up behind it.
            vec3 ray = normalize(vec3((vUv * 2.0 - 1.0) / vec2(cameraProjection[0][0], cameraProjection[1][1]), -1.0));
            vec4 clip = cameraProjection * vec4(ray * max(distance, ${CLEAR_DISTANCE.toFixed(1)}), 1.0);
            gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
            // Semi-transparent throughout, thinning gradually toward the edges.
            gl_FragColor = vec4(color, smoothstep(0.05, 0.85, s.a) * ${OPACITY.toFixed(2)});
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.composite.frustumCulled = false;
    this.composite.renderOrder = -1; // first of the transparent objects, after every opaque one it may cover
  }

  /** Size the buffers for a drawing buffer of `width` x `height` pixels. */
  setSize(width: number, height: number) {
    const bufferHeight = Math.max(1, Math.min(Math.round(height * BUFFER_SCALE), MAX_BUFFER_HEIGHT));
    const bufferWidth = Math.max(1, Math.round((bufferHeight * width) / height));
    this.targetA.setSize(bufferWidth, bufferHeight);
    this.targetB.setSize(bufferWidth, bufferHeight);
    this.aspect = width / height;
  }

  /** Draw and blur the clouds for this frame. Call before rendering the main scene, with the camera's world matrix up to date. */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    this.camera.fov = camera.fov;
    this.camera.aspect = camera.aspect;
    this.camera.near = camera.near;
    this.camera.updateProjectionMatrix();
    this.cameraProjection.value.copy(camera.projectionMatrix);
    this.camera.matrixWorld.copy(camera.matrixWorld);
    this.camera.matrixWorldInverse.copy(camera.matrixWorldInverse);
    this.lightView.value.copy(LIGHT_DIRECTION).transformDirection(camera.matrixWorldInverse);

    renderer.getClearColor(this.clearColor);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);

    renderer.setRenderTarget(this.targetA);
    renderer.render(this.chunks, this.camera);

    // A step of the 13-tap kernel, which reaches 5.18 steps out.
    const step = BLUR_REACH / 5.18;
    const material = this.blur.material;
    this.blurStep.set(step / this.aspect, 0);
    material.uniforms.source.value = this.targetA.texture;
    renderer.setRenderTarget(this.targetB);
    renderer.render(this.blur, this.screenCamera);
    this.blurStep.set(0, step);
    material.uniforms.source.value = this.targetB.texture;
    renderer.setRenderTarget(this.targetA);
    renderer.render(this.blur, this.screenCamera);

    renderer.setRenderTarget(null);
    renderer.setClearColor(this.clearColor, clearAlpha);
  }
}

const SCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** One triangle that covers the whole screen. */
function screenTriangle(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return geometry;
}

/**
 * The blanket's puffs, on a jittered grid over the whole area around the
 * rail, as matrices grouped by chunk. Their tops follow slow swells, so the
 * blanket rolls rather than lying flat. Seeded, so it is the same on every run.
 */
function layout(): THREE.Matrix4[][] {
  const random = mulberry32(17);
  const lerp = THREE.MathUtils.lerp;
  const bounds = new THREE.Box3().setFromPoints(railPoints(400)).expandByScalar(LAYOUT_MARGIN);
  const chunks = new Map<string, THREE.Matrix4[]>();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();

  const rail = railPoints(1200);
  const nearRail = (x: number, z: number) => rail.some((p) => Math.hypot(p.x - x, p.z - z) < MOUND_RAIL_CLEARANCE);

  for (let gz = bounds.min.z; gz < bounds.max.z; gz += PUFF_SPACING) {
    for (let gx = bounds.min.x; gx < bounds.max.x; gx += PUFF_SPACING) {
      const x = gx + random() * PUFF_SPACING;
      const z = gz + random() * PUFF_SPACING;
      let radius = lerp(PUFF_RADIUS.min, PUFF_RADIUS.max, random());
      const flatten = lerp(PUFF_FLATTEN.min, PUFF_FLATTEN.max, random());
      // Slow swells (0..1), plus plenty of variation from puff to puff.
      const swell = 0.5 + 0.25 * (Math.sin(x / 170 + 1.3) * Math.sin(z / 230) + Math.sin((x + z) / 310));
      let top = lerp(PUFF_TOP.min, PUFF_TOP.max, swell * 0.5 + random() * 0.5);
      if (random() < MOUND_SHARE && !nearRail(x, z)) {
        top = lerp(MOUND_TOP.min, MOUND_TOP.max, random());
        radius *= 1.2;
      }

      const key = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
      let chunk = chunks.get(key);
      if (!chunk) chunks.set(key, (chunk = []));
      position.set(x, top - radius * flatten, z);
      scale.set(radius, radius * flatten, radius);
      chunk.push(new THREE.Matrix4().compose(position, rotation, scale));
    }
  }
  return [...chunks.values()];
}

/** Tileable detail noise for the clouds' edges. */
function noiseTexture(): THREE.DataTexture {
  const size = NOISE_SIZE;
  const noise = fractalNoise(size, 23, 4, 4);
  const data = new Uint8Array(size * size);
  for (let i = 0; i < data.length; i++) data[i] = 255 * noise[i];
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
