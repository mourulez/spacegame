// Inserted before #include <color_fragment>: the zone's colors from the palette, then decals over them.
#ifdef USE_PALETTE
  diffuseColor.rgb *= texture2D( uPalette, vec2( vPalU, 0.5 / 3.0 ) ).rgb;
  celShadowV = texture2D( uPalette, vec2( vPalU, 1.5 / 3.0 ) ).rgb;
  vec4 zoneProps = texture2D( uZones, vec2( vPalU, 0.5 ) );
  celSpecK = zoneProps.r; celMetalK = zoneProps.g; celGlowK = zoneProps.b;
#endif
#ifdef USE_DECALS
  // Each decal is a box in model space; only the inside test and the atlas read happen here.
  for ( int i = 0; i < NUM_DECALS; i ++ ) {
    vec3 dp = vDecal[ i ];
    vec2 duv = dp.xy + 0.5;
    float inside = step( 0.0, duv.x ) * step( duv.x, 1.0 ) * step( 0.0, duv.y ) * step( duv.y, 1.0 ) * step( abs( dp.z ), 0.5 );
    float facing = smoothstep( 0.25, 0.45, vDecalFacing[ i ] ); // stays off the opposite face
    vec4 dc = texture2D( uDecalAtlas, uDecalRect[ i ].xy + duv * uDecalRect[ i ].zw );
    diffuseColor.rgb = mix( diffuseColor.rgb, dc.rgb, dc.a * inside * facing );
  }
#endif
