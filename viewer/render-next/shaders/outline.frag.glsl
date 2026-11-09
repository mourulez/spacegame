uniform vec3 uColor;
#ifdef USE_EM_OUTLINE
  varying float vEmK;
  varying vec3 vEmColor;
#endif
#ifdef USE_PALETTE_OUTLINE
  uniform sampler2D uPalette; // bottom row: each zone's outline color
  varying float vPalU;
#endif
#include <common>
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4( uColor, 1.0 );
  #ifdef USE_PALETTE_OUTLINE
    gl_FragColor.rgb = texture2D( uPalette, vec2( vPalU, 2.5 / 3.0 ) ).rgb;
  #endif
  #ifdef USE_EM_OUTLINE
    gl_FragColor.rgb = mix( gl_FragColor.rgb, vEmColor, smoothstep( 0.05, 0.4, vEmK ) );
  #endif
  #include <colorspace_fragment>
  #include <fog_fragment>
}
