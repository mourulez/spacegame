// Inserted after #include <common> in MeshToonMaterial's vertex shader.
#ifdef USE_SHADOW_BIAS
  attribute float _shadow_bias;
  varying float vShadowBias;
#endif
#ifdef USE_PANEL_LINES
  attribute vec2 _line; // x: linear field, zero on the stroke; y: period (0 = a single stroke)
  attribute float _line2; // second stroke per part (intersections), a single stroke
  varying vec2 vLine;
  varying float vLine2;
#endif
#ifdef USE_EDGES
  // Per triangle corner: the corner's one-hot plus 2 × the flags of the triangle's three edges (edge k is
  // the one opposite corner k). Interpolated, the one-hot becomes the distance to each edge.
  attribute vec3 _edge;
  varying vec3 vEdge;
#endif
#ifdef USE_PALETTE
  varying float vPalU;
#endif
#ifdef USE_LED_LIGHT
  varying vec3 vLedObj;
#endif
#ifdef USE_HATCH
  varying vec3 vHatchObj;
#endif
#ifdef USE_DECALS
  uniform mat4 uDecalInv[ NUM_DECALS ];
  uniform vec3 uDecalAxis[ NUM_DECALS ];
  varying vec3 vDecal[ NUM_DECALS ];
  varying float vDecalFacing[ NUM_DECALS ];
#endif
