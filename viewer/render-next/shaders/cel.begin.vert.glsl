// Inserted after #include <begin_vertex>: `transformed` is the vertex in model space.
#ifdef USE_SHADOW_BIAS
  vShadowBias = _shadow_bias;
#endif
#ifdef USE_EDGES
  vEdge = _edge;
#endif
#ifdef USE_PALETTE
  vPalU = uv.x;
#endif
#ifdef USE_LED_LIGHT
  vLedObj = transformed;
#endif
#ifdef USE_HATCH
  vHatchObj = transformed;
#endif
#ifdef USE_PANEL_LINES
  vLine = _line;
  vLine2 = _line2;
#endif
#ifdef USE_DECALS
  // Decal box coordinates are linear in position, so they interpolate exactly.
  for ( int i = 0; i < NUM_DECALS; i ++ ) {
    vDecal[ i ] = ( uDecalInv[ i ] * vec4( transformed, 1.0 ) ).xyz;
    vDecalFacing[ i ] = dot( objectNormal, uDecalAxis[ i ] );
  }
#endif
