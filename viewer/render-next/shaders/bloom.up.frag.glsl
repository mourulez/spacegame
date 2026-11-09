// Dual filtering (ARM), upsample: 8 taps.
uniform sampler2D tSrc; uniform vec2 uHalf;
varying vec2 vUv;
void main() {
  vec4 s = texture2D( tSrc, vUv + vec2( -uHalf.x * 2.0, 0.0 ) );
  s += texture2D( tSrc, vUv + vec2( -uHalf.x, uHalf.y ) ) * 2.0;
  s += texture2D( tSrc, vUv + vec2( 0.0, uHalf.y * 2.0 ) );
  s += texture2D( tSrc, vUv + vec2( uHalf.x, uHalf.y ) ) * 2.0;
  s += texture2D( tSrc, vUv + vec2( uHalf.x * 2.0, 0.0 ) );
  s += texture2D( tSrc, vUv + vec2( uHalf.x, -uHalf.y ) ) * 2.0;
  s += texture2D( tSrc, vUv + vec2( 0.0, -uHalf.y * 2.0 ) );
  s += texture2D( tSrc, vUv + vec2( -uHalf.x, -uHalf.y ) ) * 2.0;
  gl_FragColor = s / 12.0;
}
