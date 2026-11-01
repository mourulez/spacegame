# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A three.js game for web game portals, written in TypeScript and bundled with Vite. Developed and tested on desktop, deployed to GitHub Pages on every push to `main` so it can be played on tablets and phones.

## Commands

```sh
npm run dev        # dev server with HMR, localhost only
npm run dev:lan    # same, exposed on the LAN to test on a phone/tablet on the same Wi-Fi
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ (also exposed on the LAN)
```

There is no test runner or linter yet. `npm run build` (strict tsc + Vite) is the check that CI runs.

## Up-to-date docs

Before writing or changing code that uses three.js, Vite, TypeScript, or any other library or tool in this project, always check the current docs through the Context7 MCP server (`resolve-library-id` then `query-docs`). Do this even for APIs that seem familiar: three.js renames and deprecates APIs frequently, and Vite's config options change between majors. Check the installed version in `package.json` and make sure the docs match it.

## Core requirements

These apply to every element of the game: movement, animation, particles, timers, spawning, AI, camera, UI and input.

### 60 fps minimum on every target device

- The game must hold at least 60 fps on mid-range phones and tablets, not just on desktop. A feature that drops below that on mobile isn't done.
- Avoid allocations in the frame loop: reuse vectors, matrices and arrays instead of creating them per frame.
- Keep draw calls low: share geometries and materials, and use `InstancedMesh` or merged geometry for repeated objects.
- Cap the renderer's pixel ratio (currently 2). Prefer cheap materials and lights; avoid real-time shadows and post-processing unless they are measured to fit the budget on mobile.
- Verify performance on a real phone (`npm run dev:lan` or the Pages deploy), not only in desktop devtools.

### Total device independence

The game must behave identically on any device, whatever its refresh rate, frame rate, screen size, aspect ratio, pixel density or input method.

- **Frame-rate independence:** all game logic runs in the fixed-timestep loop (`src/core/loop.ts`): `step()` advances the state by exactly `STEP` seconds, and `render(alpha)` only interpolates between the previous and current state. Gameplay results must not depend on whether the display runs at 60, 90, 120 or 144 Hz, or on frame drops. Never mutate game state in render code, never use the real frame delta for gameplay, and never tie logic to the number of frames. Anything that moves keeps its previous-step state so it can be interpolated, and snaps (previous = current) when teleported or respawned.
- **Screen independence:** define gameplay in world units, never pixels. The playable area, speeds, sizes and difficulty must be the same in portrait and landscape and at any aspect ratio. The game always fills the whole screen: the camera fits the fixed playable area into view, and extra screen space may show more scenery around it but must never give more room to play or any other gameplay advantage.
- **Resolution independence:** UI is sized in CSS units relative to the viewport and respects safe-area insets. Pixel density affects only sharpness, never layout or gameplay.
- **Input independence:** every action must be possible with touch alone and with keyboard/mouse, with equivalent responsiveness and precision. No hover-only or keyboard-only interactions.

## Other constraints

- **Fully self-contained / offline.** The shipped game must make no network requests: no CDNs, no Google Fonts, no analytics, no remote decoders. Every asset (fonts, audio, models, textures, Draco/KTX2/Basis decoders copied from `node_modules/three/examples/jsm/libs/`) lives in the repo and is bundled or put in `public/`. After adding a dependency or loader, grep `dist/assets/*.js` for `https?://` to confirm.
- **Relative paths only.** `vite.config.ts` sets `base: './'` so the same `dist/` works under GitHub Pages' `/spacegame/` subpath and inside a portal zip/iframe. Never reference assets with a leading `/`.
- No physics engine and no portal SDK (Poki/CrazyGames) for now. When a portal SDK is added, it goes behind an adapter in `src/platform/` so the game still runs without it.

## Deployment

`.github/workflows/deploy.yml` runs `npm ci && npm run build` on every push to `main` and publishes `dist/` to GitHub Pages (https://mourulez.github.io/spacegame/). The repo's Pages source must be set to "GitHub Actions". Pages caches `index.html` for about 10 minutes, so phones may need a hard reload to pick up a new deploy.
