// Inserted after #include <common> in MeshToonMaterial's fragment shader.
uniform float uLineW; uniform float uLineK; uniform float uEdgeW;
#ifdef USE_EDGES
  varying vec3 vEdge;
#endif
uniform vec3 uShadowTint; uniform float uBandT;
uniform float uSpecT; uniform float uSpecStrength; uniform vec3 uSpecColor;
#ifdef USE_LED_LIGHT
  // Emissive areas: segment A–B in model space; A.w = core radius, B.w = how far the glow spills.
  uniform vec4 uEmA[ NUM_EMITTERS ]; uniform vec4 uEmB[ NUM_EMITTERS ];
  uniform vec3 uEmColor[ NUM_EMITTERS ]; uniform float uEmOn[ NUM_EMITTERS ];
  varying vec3 vLedObj;
  float emSegDist( vec3 p, vec3 a, vec3 b ) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp( dot( pa, ba ) / max( dot( ba, ba ), 1e-6 ), 0.0, 1.0 );
    return length( pa - ba * h );
  }
#endif
#ifdef USE_PANEL_LINES
  varying vec2 vLine;
  varying float vLine2;
#endif
#ifdef USE_PALETTE
  // One material per model with a palette: each column is a zone. uPalette's rows, from the top: base,
  // shadow and outline color. uZones: specular, metal and emissive strengths.
  uniform sampler2D uPalette;
  uniform sampler2D uZones;
  varying float vPalU;
  vec3 celShadowV = vec3( 1.0 ); float celSpecK = 0.0; float celMetalK = 0.0; float celGlowK = 0.0;
  #define CEL_SHADOW celShadowV
  #define CEL_SPEC celSpecK
  #define CEL_METAL celMetalK
#else
  #define CEL_SHADOW uShadowTint
  #define CEL_SPEC uSpecStrength
  #define CEL_METAL 1.0
#endif
#ifdef USE_SHADOW_BIAS
  varying float vShadowBias;
#endif
#ifdef USE_DECALS
  uniform vec4 uDecalRect[ NUM_DECALS ];
  uniform sampler2D uDecalAtlas;
  varying vec3 vDecal[ NUM_DECALS ];
  varying float vDecalFacing[ NUM_DECALS ];
#endif
#ifdef USE_FAKE_METAL
  uniform sampler2D uMatcap;
#endif

#ifdef USE_HATCH
  uniform float uHatchDepth; uniform vec3 uHatchDir; uniform float uHatchSpacing; uniform float uHatchW;
  varying vec3 vHatchObj;
#endif

// N·L plus the painted shadow, as the light cut saw it; the hatching reads it. 1 = fully lit, or no light.
float celLightD = 1.0;

// Replaces MeshToonMaterial's gradient map: a tinted shadow color and an antialiased cut.
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float d = dot( normal, lightDirection );
  #ifdef USE_SHADOW_BIAS
    d += vShadowBias; // painted per vertex: negative = more shadow
  #endif
  celLightD = d;
  #ifdef CEL_SOFT
    float w = 0.22;
  #else
    float w = max( fwidth( d ), 1e-4 );
  #endif
  #ifdef CEL_BANDS_3
    vec3 mid = mix( CEL_SHADOW, vec3( 1.0 ), 0.55 );
    float b1 = smoothstep( uBandT - 0.35 - w, uBandT - 0.35 + w, d );
    float b2 = smoothstep( uBandT + 0.25 - w, uBandT + 0.25 + w, d );
    return mix( CEL_SHADOW, mix( mid, vec3( 1.0 ), b2 ), b1 );
  #else
    return mix( CEL_SHADOW, vec3( 1.0 ), smoothstep( uBandT - w, uBandT + w, d ) );
  #endif
}
