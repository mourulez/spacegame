/*
 * Every setting of the cel look in one place. DEFAULT_PARAMS is the look the
 * user decided on in the reference demo (docs/reference/SPEC-cel-shader-movil.md,
 * §13.2): with a release it becomes the game's look.
 *
 * These are the game-wide settings. What belongs to each model (colors per
 * zone, how much specular or metal each zone gets, line placement,
 * emissive areas, decals) comes with the model instead.
 */

export interface CelParams {
  /** Light/shadow bands: 2 tones (a clean cut), 3 tones, or a soft edge. */
  bands: '2' | '3' | 'soft';
  /** Where the light/shadow cut falls, as N·L (0 = the terminator). */
  bandThreshold: number;
  /** Apply the model's painted shadow (_shadow_bias), such as a belly always in shadow. */
  shadowBias: boolean;

  /**
   * Ink hatching, a third step below the shadow: where N·L plus the painted shadow falls below the shadow
   * cut minus hatchDepth. Painted at −1.5, a zone is always hatched.
   */
  hatch: boolean;
  /** How far below the shadow cut hatching starts, in N·L. */
  hatchDepth: number;
  /** Distance between hatch lines, in model units (a model is about 2.2 long in the viewer). */
  hatchSpacing: number;
  /** Direction of the hatch planes, turned around the model's up axis: 0° rings around the length, 90° along it. */
  hatchAngle: number;
  /** Hatch line thickness in CSS pixels. */
  hatchWidth: number;

  /** Anime specular: a hard-edged highlight inside the lit side. */
  spec: boolean;
  /** Specular cut on N·H: higher is a smaller highlight. */
  specThreshold: number;
  /** Fake metal by matcap, on the zones the model marks as metal. */
  metal: boolean;

  outline: boolean;
  /**
   * Where the outline shows: only around the model's whole silhouette (interior lines come from the model's
   * edges and strokes), or wherever the inflated hull peeks out, which also draws parts in front of others
   * and, on detailed models, broken lines between details.
   */
  outlineMode: 'silhouette' | 'hull';
  /** Outline color: each zone's own (from the model's palette) or one color for the whole model. */
  outlineColor: 'tint' | 'flat';
  /** Push the outline along normals averaged per position (no cracks at hard edges) or along the shading normals. */
  outlineNormals: 'smooth' | 'raw';
  /** Outline thickness in CSS pixels, the same at any pixel density. */
  outlineWidth: number;
  /** Thicker on the side in shadow, thinner on the lit side, like a pen stroke. */
  outlineLightWidth: boolean;
  /** Thickness multiplier on the side in shadow. */
  outlineShadeK: number;
  /** Thickness multiplier on the lit side. */
  outlineLitK: number;
  /** Apply the thickness painted on the model (vertex color, red channel). */
  outlinePaintedWidth: boolean;
  /** View distance (world units) beyond which outlines get thinner. */
  outlineFadeStart: number;

  /** Interior lines on the model's marked edges (hard edges, plus or minus the author's marks). */
  edges: boolean;
  /** Edge line thickness in CSS pixels. */
  edgeWidth: number;

  /** Interior strokes placed by the model (panel lines, flaps, rings). */
  lines: boolean;
  /** Interior stroke thickness in CSS pixels. */
  lineWidth: number;

  /** Emissive areas painted on the surface, with their spill and halo. */
  emissive: boolean;
  /** Selective bloom on the emissive areas only. */
  bloom: boolean;
  /** Projected decals. */
  decals: boolean;

  /** Shadow on the ground: the model's flattened silhouette, a simple ellipse, or none. */
  groundShadow: 'planar' | 'blob' | 'off';
  /** Pixel ratio: stepped automatically by frame time, 1×, or native (capped at 2×). */
  resolution: 'auto' | '1' | 'native';
}

export const DEFAULT_PARAMS: Readonly<CelParams> = {
  bands: '2',
  bandThreshold: 0,
  shadowBias: false,
  hatch: true,
  hatchDepth: 0.5,
  hatchSpacing: 0.05,
  hatchAngle: 45,
  hatchWidth: 1,
  spec: true,
  specThreshold: 0.988,
  metal: true,
  outline: true,
  outlineMode: 'silhouette',
  outlineColor: 'tint',
  outlineNormals: 'smooth',
  outlineWidth: 2,
  outlineLightWidth: true,
  outlineShadeK: 1.45,
  outlineLitK: 0.7,
  outlinePaintedWidth: true,
  outlineFadeStart: 18,
  edges: true,
  edgeWidth: 1,
  lines: true,
  lineWidth: 1.25,
  emissive: true,
  bloom: true,
  decals: true,
  groundShadow: 'planar',
  resolution: 'native',
};
