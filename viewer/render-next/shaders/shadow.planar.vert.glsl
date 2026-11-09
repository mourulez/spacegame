// The model flattened onto the ground along the shadow's light: its exact silhouette, with a hard edge.
uniform vec3 uShadowDir; uniform float uGroundY;
void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  wp.xyz += uShadowDir * ( ( uGroundY - wp.y ) / uShadowDir.y );
  wp.y = uGroundY + 0.01;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
