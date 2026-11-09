// Inverted hull with a constant thickness in pixels: each vertex is pushed out in screen space.
#include <common>
#include <fog_pars_vertex>
#ifdef USE_SMOOTH_OUTLINE
  attribute vec3 _outline_normal; // normals averaged per position: no cracks at hard edges
  #define OUTLINE_N _outline_normal
#else
  #define OUTLINE_N normal
#endif
uniform float uThickness; uniform vec2 uResolution; uniform float uFadeStart;
#ifdef USE_PALETTE_OUTLINE
  varying float vPalU;
#endif
#ifdef USE_PAINTED_WIDTH
  attribute vec3 color; // red channel: thickness painted on the model (0.5 = 1x)
#endif
#ifdef USE_LIGHT_WIDTH
  uniform vec3 uLightDir; uniform float uShadeK; uniform float uLitK;
#endif
#ifdef USE_EM_OUTLINE
  // The emissive area's halo through the outline: near the light the stroke widens and takes its
  // color, so the glow follows the part's real silhouette.
  uniform vec4 uEmA[ NUM_EMITTERS ]; uniform vec4 uEmB[ NUM_EMITTERS ];
  uniform vec3 uEmColor[ NUM_EMITTERS ]; uniform float uEmOn[ NUM_EMITTERS ];
  varying float vEmK;
  varying vec3 vEmColor;
#endif
void main() {
  vec4 p = vec4( position, 1.0 );
  vec4 q = vec4( position + OUTLINE_N * 0.05, 1.0 );
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; q = instanceMatrix * q;
  #endif
  vec4 mvPosition = modelViewMatrix * p;
  vec4 clipP = projectionMatrix * mvPosition;
  vec4 clipQ = projectionMatrix * ( modelViewMatrix * q );
  vec2 dir = ( clipQ.xy / clipQ.w - clipP.xy / clipP.w ) * uResolution;
  float len = length( dir );
  dir = len > 1e-6 ? dir / len : vec2( 0.0 );
  float k = min( 1.0, uFadeStart / max( -mvPosition.z, 1e-3 ) );
  // Pen-like thickness: painted per vertex, times the light (thicker in shadow).
  float wMul = 1.0;
  #ifdef USE_PAINTED_WIDTH
    wMul *= color.r * 2.0;
  #endif
  #ifdef USE_LIGHT_WIDTH
    mat3 nm = mat3( modelMatrix );
    #ifdef USE_INSTANCING
      nm = nm * mat3( instanceMatrix );
    #endif
    float lit = dot( normalize( nm * OUTLINE_N ), uLightDir );
    wMul *= mix( uShadeK, uLitK, smoothstep( -0.2, 0.5, lit ) );
  #endif
  wMul = clamp( wMul, 0.45, 1.8 ); // large contrasts open gaps at corners
  #ifdef USE_EM_OUTLINE
    // The halo reaches 0.6 of the glow's reach past the core, and takes the nearest lit area's color.
    vEmK = 0.0;
    vEmColor = vec3( 0.0 );
    for ( int i = 0; i < NUM_EMITTERS; i ++ ) {
      vec3 pa = position - uEmA[ i ].xyz, ba = uEmB[ i ].xyz - uEmA[ i ].xyz;
      float h = clamp( dot( pa, ba ) / max( dot( ba, ba ), 1e-6 ), 0.0, 1.0 );
      float emK = ( 1.0 - smoothstep( uEmA[ i ].w, uEmA[ i ].w + 0.6 * uEmB[ i ].w, length( pa - ba * h ) ) ) * uEmOn[ i ];
      if ( emK > vEmK ) {
        vEmK = emK;
        vEmColor = uEmColor[ i ];
      }
    }
    wMul *= 1.0 + 2.2 * vEmK;
  #endif
  clipP.xy += dir * ( 2.0 * uThickness * wMul * k / uResolution ) * clipP.w;
  gl_Position = clipP;
  #ifdef USE_PALETTE_OUTLINE
    vPalU = uv.x;
  #endif
  #include <fog_vertex>
}
