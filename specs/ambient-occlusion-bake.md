# Viewer session: bake ambient occlusion into the painted shadow

Pending, agreed with the user (November 2026). Not started.

## What

Work out each model's ambient occlusion automatically and write it as its painted shadow (`_SHADOW_BIAS`, spec `docs/reference/SPEC-cel-shader-movil.md` §11.8), so nooks and joints (under the wings, where a nacelle meets the hull, gaps) fall into shadow, and the deepest ones into the ink hatching (§11.8b), with no runtime cost.

## How

- **Blender path:** in `npm run asset:blend` (`tools/blend-export.py`), bake ambient occlusion with Cycles into a color attribute (*Bake › Ambient Occlusion* to *Color Attributes*), then turn it into `_SHADOW_BIAS`: no occlusion → 0, full occlusion → −1.5. Decide how it combines with a `_shadow_bias` the author already painted (add them, or the painted one wins), so the user can retouch on top.
- **Code path:** in model generators (`art/models/*/generate.ts`), the same value by casting rays from each vertex over the hemisphere around its normal.
- Check the result in the viewer with a model that has nooks, with the hatching on.

## Limits to keep in mind

- Static, baked into the model: it doesn't follow moving parts or nearby objects.
- It doesn't replace shadows cast by the sun, which change as the ship turns.
