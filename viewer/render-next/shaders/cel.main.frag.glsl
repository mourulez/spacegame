// Inserted before #include <opaque_fragment>, once the light is in outgoingLight.
#ifdef USE_FAKE_METAL
  float mc = texture2D( uMatcap, normal.xy * 0.495 + 0.5 ).r;
  outgoingLight *= mix( 1.0, mc * 1.7, CEL_METAL );
#endif
#if defined( USE_ANIME_SPEC ) && NUM_DIR_LIGHTS > 0
  // Anime specular: one hard-edged spot, only inside the lit side.
  vec3 specL = directionalLights[ 0 ].direction;
  float specNdotH = saturate( dot( normal, normalize( specL + geometryViewDir ) ) );
  float specW = fwidth( specNdotH );
  float specLit = step( uBandT, dot( normal, specL ) );
  float spec = smoothstep( uSpecT - specW, uSpecT + specW, specNdotH ) * specLit;
  outgoingLight = mix( outgoingLight, uSpecColor, spec * CEL_SPEC );
#endif
#ifdef USE_HATCH
  // Ink hatching, a step below the shadow: lines where parallel planes in model space cut the surface, so
  // they wrap around its curves and move with the model. Constant width in pixels; they fade out when they
  // crowd on screen (a distant model).
  float hatchCut = uBandT - uHatchDepth;
  float hatchLW = max( fwidth( celLightD ), 1e-4 );
  float hatchZone = 1.0 - smoothstep( hatchCut - hatchLW, hatchCut + hatchLW, celLightD );
  float hatchF = dot( vHatchObj, uHatchDir ) / uHatchSpacing;
  float hatchPx = max( fwidth( hatchF ), 1e-5 ); // one spacing = 1 / hatchPx pixels
  float hatchD = abs( fract( hatchF + 0.5 ) - 0.5 ) / hatchPx; // pixels to the nearest line
  float hatchLine = 1.0 - smoothstep( 0.5 * uHatchW - 0.5, 0.5 * uHatchW + 0.5, hatchD );
  float hatchFade = smoothstep( 3.0, 6.0, 1.0 / hatchPx ); // lines closer than ~3 px: gone
  #ifdef USE_PALETTE
    vec3 hatchCol = texture2D( uPalette, vec2( vPalU, 2.5 / 3.0 ) ).rgb; // the zone's outline color
    hatchZone *= 1.0 - celGlowK; // emissive zones are never in shadow
  #else
    vec3 hatchCol = vec3( 0.02, 0.025, 0.06 );
  #endif
  outgoingLight = mix( outgoingLight, hatchCol, hatchZone * hatchLine * hatchFade );
#endif
#ifdef USE_PALETTE
  outgoingLight = mix( outgoingLight, diffuseColor.rgb, celGlowK ); // emissive zone: full color, no bands or shadow
#endif
#ifdef USE_LED_LIGHT
  // Emissive area: distance to a segment (A = B is a point; a large radius, a region). The core is full
  // color; around it the light spills over the surface in 2 cel bands. No geometry.
  for ( int i = 0; i < NUM_EMITTERS; i ++ ) {
    float d = emSegDist( vLedObj, uEmA[ i ].xyz, uEmB[ i ].xyz );
    float dw = max( fwidth( d ), 1e-4 );
    float emCore = 1.0 - smoothstep( uEmA[ i ].w - dw, uEmA[ i ].w + dw, d );
    float emInner = 1.0 - smoothstep( uEmA[ i ].w * 0.4 - dw, uEmA[ i ].w * 0.4 + dw, d );
    float emGlow = 1.0 - ( d - uEmA[ i ].w ) / uEmB[ i ].w; // negative beyond the glow's reach
    float gw = max( fwidth( emGlow ), 1e-4 );
    float emPool = smoothstep( -gw, gw, emGlow ) * 0.4 + smoothstep( 0.55 - gw, 0.55 + gw, emGlow ) * 0.6;
    vec3 emColor = uEmColor[ i ];
    float emOn = uEmOn[ i ];
    outgoingLight += emColor * emPool * ( 0.5 + 0.7 * diffuseColor.rgb ) * emOn;
    // The strip itself: lit = full color with a hot, paler core; off = dark glass of the same color.
    vec3 emLit = mix( emColor, mix( emColor, vec3( 1.0 ), 0.6 ), emInner );
    outgoingLight = mix( outgoingLight, mix( emColor * 0.07, emLit, emOn ), emCore );
  }
#endif
#ifdef USE_PANEL_LINES
  // Interior strokes: the zero isoline of a linear per-vertex field, a constant width in pixels.
  float lineW = max( fwidth( vLine.x ), 1e-5 );
  float lineD = vLine.y > 0.0 ? abs( fract( vLine.x / vLine.y + 0.5 ) - 0.5 ) * vLine.y : abs( vLine.x ); // periodic: repeated rings
  float panelLine = 1.0 - smoothstep( lineW * ( 0.5 * uLineW - 0.5 ), lineW * ( 0.5 * uLineW + 0.5 ), lineD );
  float lineW2 = max( fwidth( vLine2 ), 1e-5 );
  panelLine = max( panelLine, 1.0 - smoothstep( lineW2 * ( 0.5 * uLineW - 0.5 ), lineW2 * ( 0.5 * uLineW + 0.5 ), abs( vLine2 ) ) );
  #ifdef USE_PALETTE
    vec3 lineCol = texture2D( uPalette, vec2( vPalU, 2.5 / 3.0 ) ).rgb; // the zone's outline color
  #else
    vec3 lineCol = vec3( 0.02, 0.025, 0.06 );
  #endif
  outgoingLight = mix( outgoingLight, lineCol, panelLine * uLineK );
#endif
#ifdef USE_EDGES
  // Edge lines: a strip of constant pixel width along each marked edge of the triangle. The two faces at an
  // edge paint half the width each, so the line is centered on it.
  vec3 edgeOn = step( 1.5, vEdge ); // flags are constant over the triangle: 2..3 when set, 0..1 when not
  vec3 bary = vEdge - 2.0 * edgeOn;
  vec3 edgePx = mix( vec3( 1e6 ), bary / max( fwidth( bary ), vec3( 1e-6 ) ), edgeOn ); // pixels to each marked edge
  float edgeD = min( min( edgePx.x, edgePx.y ), edgePx.z );
  float edgeLine = 1.0 - smoothstep( 0.5 * uEdgeW - 0.5, 0.5 * uEdgeW + 0.5, edgeD );
  #ifdef USE_PALETTE
    vec3 edgeCol = texture2D( uPalette, vec2( vPalU, 2.5 / 3.0 ) ).rgb; // the zone's outline color
  #else
    vec3 edgeCol = vec3( 0.02, 0.025, 0.06 );
  #endif
  outgoingLight = mix( outgoingLight, edgeCol, edgeLine );
#endif
