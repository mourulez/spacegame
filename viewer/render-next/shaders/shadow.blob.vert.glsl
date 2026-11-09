// A hard-edged ellipse on the ground under the model. The quad (-0.5 to +0.5 in x and z) is a child of the
// model scaled to the ellipse's size; this places it flat on the ground, turned with the model's heading and
// narrower as the model banks, whatever the model's rotation.
uniform float uGroundY;
varying vec2 vP;
void main() {
  vP = position.xz * 2.0;
  vec3 center = modelMatrix[ 3 ].xyz;
  vec3 right = modelMatrix[ 0 ].xyz;
  vec3 forward = modelMatrix[ 2 ].xyz;
  vec2 dir = length( forward.xz ) > 1e-4 ? normalize( forward.xz ) : vec2( 0.0, 1.0 );
  vec2 side = vec2( dir.y, -dir.x );
  float width = length( right );
  float bank = max( 0.3, length( right.xz ) / max( width, 1e-4 ) );
  vec2 xz = center.xz + side * position.x * width * bank + dir * position.z * length( forward );
  gl_Position = projectionMatrix * viewMatrix * vec4( xz.x, uGroundY + 0.01, xz.y, 1.0 );
}
