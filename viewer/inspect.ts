import * as THREE from 'three';
import { SUN_DIRECTION } from './render-next/index.ts';

/*
 * Ways to look at a model's geometry rather than its look: the model
 * without the cel effects (just its base colors under a soft light), and
 * its wireframe over whatever is shown.
 */

/** Base colors (the palette's top row, or grey), lit softly from the sun's side so the shape reads. */
export function plainMaterial(palette: THREE.Texture | null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uPalette: { value: palette }, uLight: { value: SUN_DIRECTION } },
    defines: palette ? { USE_PALETTE: '' } : {},
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying float vU;
      void main() {
        vNormal = normalize( mat3( modelMatrix ) * normal );
        vU = uv.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uPalette;
      uniform vec3 uLight;
      varying vec3 vNormal;
      varying float vU;
      void main() {
        #ifdef USE_PALETTE
          vec3 base = texture2D( uPalette, vec2( vU, 0.5 / 3.0 ) ).rgb;
        #else
          vec3 base = vec3( 0.7 );
        #endif
        float light = 0.45 + 0.55 * max( dot( normalize( vNormal ), uLight ), 0.0 );
        gl_FragColor = vec4( base * light, 1.0 );
        #include <colorspace_fragment>
      }`,
  });
}

/** Every triangle's edges, drawn over the surface. */
export function wireMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
    depthFunc: THREE.LessEqualDepth, // the same depth as the surface under it
  });
}
