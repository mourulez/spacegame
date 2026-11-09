// Only the emissive areas' cores, as the cel material draws them; the rest of the model in black, which also
// hides whatever glows behind it.
uniform vec4 uEmA[ NUM_EMITTERS ]; uniform vec4 uEmB[ NUM_EMITTERS ];
uniform vec3 uEmColor[ NUM_EMITTERS ]; uniform float uEmOn[ NUM_EMITTERS ];
varying vec3 vObj;
void main() {
  vec3 glow = vec3( 0.0 );
  for ( int i = 0; i < NUM_EMITTERS; i ++ ) {
    vec3 pa = vObj - uEmA[ i ].xyz, ba = uEmB[ i ].xyz - uEmA[ i ].xyz;
    float d = length( pa - ba * clamp( dot( pa, ba ) / max( dot( ba, ba ), 1e-6 ), 0.0, 1.0 ) );
    float dw = max( fwidth( d ), 1e-4 );
    float core = 1.0 - smoothstep( uEmA[ i ].w - dw, uEmA[ i ].w + dw, d );
    float inner = 1.0 - smoothstep( uEmA[ i ].w * 0.4 - dw, uEmA[ i ].w * 0.4 + dw, d );
    vec3 color = uEmColor[ i ];
    glow += mix( color, mix( color, vec3( 1.0 ), 0.6 ), inner ) * core * uEmOn[ i ];
  }
  gl_FragColor = vec4( glow, 1.0 );
}
