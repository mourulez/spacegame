uniform vec3 uShadowTint;
varying vec2 vP;
void main() {
  float r = length( vP );
  float w = max( fwidth( r ), 1e-4 );
  float m = 1.0 - smoothstep( 1.0 - w, 1.0 + w, r );
  gl_FragColor = vec4( mix( vec3( 1.0 ), uShadowTint, m ), 1.0 ); // multiplies the ground
}
