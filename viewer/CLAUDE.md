# viewer/

The asset viewer. Read the root CLAUDE.md's "Game and viewer" section first: it says what a viewer session may touch.

## What it does

- Shows one model drawn by the experimental render library (`render-next/`), on a neutral grey background (so colors read as they are) over a neutral grey checker ground for its shadow ("Suelo" turns it off), with the chase camera's distance ("Vista de juego").
- Time runs in fixed steps like the game's loop (1/60 s), with no controls. Models animate on it (`CelModel.update(time)`): for now, the emissive areas' blink, which each `emit_*` carries in the model.
- Bottom left, two switches to look at the geometry: "Efectos" off shows the model bare (its base colors under a soft light: no outline, strokes, emissive areas, decals, shadow or bloom), and "Wireframe" draws every triangle's edges over whatever is shown. The four combinations work.
- The official library (`src/render/`) isn't shown: it is the game's old toon, to be replaced by `render-next` in the first release. Comparing both side by side comes back after that release.
- A panel with every setting of the look (`render-next/params.ts`), the same controls as the reference demo (`docs/reference/nave-cel-shader.html`). It starts from the library's defaults, the look the user decided on (§13.2 of the spec). A dot marks each value changed from the defaults; "Valores por defecto" resets them. Controls are greyed out, with the reason, when the model has no data for them or `render-next` doesn't have the feature yet. Changes last for the browser session only; to keep a value, change its default in `params.ts`.
- Models: a built-in sample (sphere, cube, torus knot), the viewer's test models in `viewer/samples/` (in the repo, `?model=samples/<path>`), every `.glb` under `art/models/` (the user's, kept out of the repo; listed automatically, `?model=<path under art/models>` in the URL; the dev server watches the folder, so new or regenerated files show up), or a `.glb` opened from disk or dropped on the page. `normalizeAsset` centers each one and scales its longest side to the player's ship length, markers included. The status line says what the asset carries (zones, emissive areas, decals, nozzles, muzzles).
- HUD: median fps, p95 frame time, draw calls, triangles and shader programs, and the pixel ratio and drawing buffer size. Measure performance on a real phone (`npm run viewer:lan`, or the published viewer), never in headless browsers.

## Files

- `main.ts`: model loading, render loop, HUD, saved state, hot reload of the library.
- `panel.ts`: the settings panel: which controls, their labels and ranges, and what each needs from the model.
- `inspect.ts`: the bare material (effects off) and the wireframe.
- `stage.ts`: background, fog, the ground (a grey checker, in the library's cel material) and the camera (`src/game/play-area.ts`; keep it in step with the game's). The light comes from the library, since it is part of the look.
- `models.ts`: the model list and the sample.
- `render-next/`: the experimental render library (see below).

## render-next

Rebuilt from the reference demo. What is in it so far:

- `params.ts`: every setting of the look and its default. Model data (colors per zone, how much specular or metal each zone gets, strokes, emissive areas, decals) belongs to the model, not here.
- `look.ts`: the current settings, the uniforms every material shares, the sun (intensity π, no ambient light), and `setViewport` (widths are in CSS pixels).
- Shading steps: light, shadow (N·L plus the painted shadow below the cut) and, being tried out, ink hatching a step deeper: lines where planes in model space cut the surface, so they follow its curves (spec §11.8b).
- `materials.ts`: the cel material (MeshToonMaterial with its lighting replaced through `onBeforeCompile`) and the outline material (an inverted hull of constant pixel width). Every feature is a define, on when the settings ask for it and the model has the data.
- Lines: the outline is thick and, by default, only around the whole silhouette: each model has its own stencil id (`takeStencilId`, up to 127 at once), written where it is in front, and its outline draws where the id isn't its own, so it also shows over other models. All the parts of one `.glb` form one silhouette; instances of an `InstancedMesh` share one id. Interior lines are thin: edges (`_EDGE`, hard edges plus or minus the author's marks, drawn with barycentric coordinates in the cel shader) and strokes (`_LINE`, `_LINE2`). Spec §11.9–§11.11.
- `shaders/*.glsl`: the demo's GLSL, imported with `?raw`.
- `geometry.ts`: outline normals (averaged per position), merging and mirroring.
- `model.ts`: cel assets: the loader for the format of spec §11 (its header comment lists what the file may carry), `normalizeAsset` and `celModel`.
- `decals.ts`: the game's decal atlas (drawn in code for now) and its slots.
- `renderer.ts`: the renderer (with stencil, for the ground shadow) and `Resolution` (native, 1× or automatic steps).

The loader reads what the file carries and computes nothing of its own: strokes (`_LINE`, `_LINE2`), painted shadow and painted outline width are baked in the asset, and are drawn only if present. The one exception is the outline normals, averaged per position when the file doesn't carry `_OUTLINE_NORMAL`.

- `shadow.ts`: the shadow on the ground (planar silhouette with stencil, or an ellipse), placed entirely in the shader. `setGround(y)` says where the ground is; `null` means no ground and no shadow.

- `bloom.ts`: selective bloom on the emissive areas only (`CelModel.glow`): drawn at 1/4 resolution, blurred by dual filtering, added over the screen. 8 small passes.

The viewer stops there on purpose: it shows what a model carries and how the look draws it. The demo's engine flame, barrel roll and hit flash are the game's (or effects to be decided later), and its instanced rocks are left out.

## Iterating the look

- Change `render-next/`, never `src/render/`. GLSL lives in `render-next/shaders/*.glsl`, imported with `?raw`.
- In `npm run viewer`, saving a file in the library (TypeScript or GLSL) swaps it in and rebuilds the model, keeping the camera, the model and the settings. Saving the viewer's own files reloads the page, which restores them from sessionStorage.
- A new setting goes in `params.ts` (with its default) and in `panel.ts` (its control).
- Effects that animate take the time from `CelModel.update(time)`, in seconds of the fixed-step clock, never real time.
- Everything in `render-next` must meet the game's rules (60 fps on mid-range phones, no network requests, no frame-rate-dependent logic), or a release brings the problem into the game.

## Models

- Model files go in `art/models/` as `.glb` (subfolders allowed), with their Blender sources (`.blend`) and scripts next to them. `art/` is gitignored: models there live only on the user's machine, and the published viewer shows only the samples. A model approved for the game gets an optimized copy in `src/assets/` (how is not decided yet).
- `viewer/samples/demo-ship/` is the test asset (shown as `samples/demo-ship/...`): the reference demo's ship, built by `generate.ts` (`npm run asset:demo-ship`) with every element of the format (edge lines by the same rule as `asset:blend`), in three variants (high density, low density, normals transferred from simple shapes). Edit the generator, not the `.glb` files. Its round trip through Blender 5.2 (import, export) is verified: see spec §11.18.
- A `.blend` goes in its own folder, `art/models/<name>/<name>.blend`. `npm run asset:blend` (or `npm run asset:blend -- <name>` for one) exports each to a `.glb` next to it, with Blender headless and the format's export options fixed (`tools/blend-export.py`), and prints what the model carries: meshes and triangles, attributes, color attributes, zone properties, marker empties, size, and edge lines per mesh. On the way it works out the edge lines (spec §11.10a) and writes `_EDGE`, in memory only: the `.blend` is never saved. Run it after the user saves a `.blend`; never hand-export.
- The same command takes `.fbx` and `.obj` (Blender imports them into an empty scene first), for a quick look at a model from elsewhere. Their edge lines come from their hard edges; `line_on`/`line_off` marks don't survive those formats.
- `viewer/samples/edge-test/` is the Blender path's test asset: a cube and a cylinder with `line_off`/`line_on` marks, built by `make.py` (see its header) and exported with `npm run asset:blend -- viewer/samples/edge-test`.
- Blender 5.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` and runs headless with `--background --python <script>`; no MCP needed.
- Uncompressed or meshopt-compressed `.glb` load. Draco and KTX2 need decoders that aren't set up yet.
- How a model goes from here to the game (approval, optimization) is not decided yet.
