// Added over the finished image on screen.
uniform sampler2D tSrc; uniform float uStrength;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4( texture2D( tSrc, vUv ).rgb * uStrength, 1.0 );
  #include <colorspace_fragment>
}
