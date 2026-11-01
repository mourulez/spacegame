# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A three.js space game for web game portals, written in TypeScript and bundled with Vite. Developed and tested on desktop, deployed to GitHub Pages on every push to `main` so it can be played on tablets and phones.

## Commands

```sh
npm run dev        # dev server with HMR, localhost only
npm run dev:lan    # same, exposed on the LAN to test on a phone/tablet on the same Wi-Fi
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ (also exposed on the LAN)
```

There is no test runner or linter yet. `npm run build` (strict tsc + Vite) is the check that CI runs.

## Hard constraints

- **Fully self-contained / offline.** The shipped game must make no network requests: no CDNs, no Google Fonts, no analytics, no remote decoders. Every asset (fonts, audio, models, textures, Draco/KTX2/Basis decoders copied from `node_modules/three/examples/jsm/libs/`) lives in the repo and is bundled or put in `public/`. After adding a dependency or loader, grep `dist/assets/*.js` for `https?://` to confirm.
- **Relative paths only.** `vite.config.ts` sets `base: './'` so the same `dist/` works under GitHub Pages' `/spacegame/` subpath and inside a portal zip/iframe. Never reference assets with a leading `/`.
- **Mobile is a first-class target.** Every feature must work with touch alone (no hover, no keyboard-only actions) and in both orientations. The renderer's pixel ratio is capped at 2; keep draw calls and per-frame allocations modest.
- No physics engine and no portal SDK (Poki/CrazyGames) for now. When a portal SDK is added, it goes behind an adapter in `src/platform/` so the game still runs without it.

## Architecture

- `src/main.ts` only wires the `#game` canvas and the `#ui` overlay div from `index.html` into `Game`.
- `src/game/game.ts` (`Game`) owns the renderer, scene, camera and the single frame loop (`renderer.setAnimationLoop`). Each frame it computes a clamped `dt` (`MAX_DT`), calls `update(dt, …)` on every entity, then renders. `resize()` recomputes the camera aspect and the ship's movement bounds from the visible area, which changes with orientation.
- **Entities** (`Ship`, `Starfield`, `Asteroids` in `src/game/`) follow one convention: a public `object` (the `THREE.Object3D` that `Game` adds to the scene) plus an `update(dt, …)` method. They don't read input or the DOM directly; `Game` passes in what they need.
- **Input** (`src/core/input.ts`) merges the keyboard (WASD/arrows) and a floating touch joystick (Pointer Events on the canvas, so it can also be tested with mouse drag on desktop) into a single `axis()` vector in [-1, 1]. The joystick state (`stick`) is exposed for the UI to draw.
- **UI** is plain DOM over the canvas, not three.js. `#ui` has `pointer-events: none` so touches reach the canvas; interactive UI elements must opt back in with `pointer-events: auto`. Safe-area insets (`env(safe-area-inset-*)`) handle notched phones.
- The world moves, not the ship: the ship only moves within the XY plane at z≈0, while the stars and asteroids stream toward +Z at `FORWARD_SPEED` and wrap or respawn far away.

## Deployment

`.github/workflows/deploy.yml` runs `npm ci && npm run build` on every push to `main` and publishes `dist/` to GitHub Pages (https://mourulez.github.io/spacegame/). The repo's Pages source must be set to "GitHub Actions". Pages caches `index.html` for about 10 minutes, so phones may need a hard reload to pick up a new deploy.
