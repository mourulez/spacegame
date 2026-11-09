uniform vec3 uShadowTint;
void main() {
  gl_FragColor = vec4( uShadowTint, 1.0 ); // multiplies the ground
}
