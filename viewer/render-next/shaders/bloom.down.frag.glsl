// Dual filtering (ARM), downsample: 5 taps.
uniform sampler2D tSrc; uniform vec2 uHalf;
varying vec2 vUv;
void main() {
  vec4 s = texture2D( tSrc, vUv ) * 4.0;
  s += texture2D( tSrc, vUv - uHalf );
  s += texture2D( tSrc, vUv + uHalf );
  s += texture2D( tSrc, vUv + vec2( uHalf.x, -uHalf.y ) );
  s += texture2D( tSrc, vUv - vec2( uHalf.x, -uHalf.y ) );
  gl_FragColor = s / 8.0;
}
