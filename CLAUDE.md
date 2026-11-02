# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Talk to the user in Spanish (castellano). Code, comments, specs, commit messages and this file stay in English, as they are now.

## Project

A three.js game for web game portals, written in TypeScript and bundled with Vite. Developed and tested on desktop, deployed to GitHub Pages on every push to `main` so it can be played on tablets and phones.

## Commands

```sh
npm run dev        # dev server with HMR, localhost only
npm run dev:lan    # same, exposed on the LAN to test on a phone/tablet on the same Wi-Fi
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ (also exposed on the LAN)
npm test           # Playwright: builds, serves dist/ on :4174, runs tests/ on every device project
npx playwright test -g "joystick"           # tests whose title matches
npx playwright test --project=iphone        # one device project
npx playwright test tests/smoke.spec.ts:28  # the test at that line
```

`npm run build` (strict tsc + Vite) is the check that CI runs; there is no linter. Playwright tests aren't in CI yet, so run `npm test` before committing.

### Playwright

- Device projects in `playwright.config.ts` emulate real devices (viewport, pixel ratio, touch, user agent): desktop Chrome, Android phone (Chromium) and iPhone/iPad (WebKit, the engine all iOS browsers use) in portrait and landscape. Portrait projects only check the rotate prompt, since the game is landscape only. Add new device-dependent behavior to tests that run on all projects.
- Tests run against the production build, not the dev server, and fail on any console error or any request outside the local server. That is how the offline rule is enforced.
- The smoke test writes `screenshots/<project>.png` (gitignored). Use these to check visual changes on every device and orientation, instead of headless browser screenshots, which can't emulate phone sizes.
- First-time setup on a new machine: `npx playwright install chromium webkit`.

## "Consolida"

When the user says **"consolida"** (consolidate), do all of the following in this order. Never commit or push without the tests passing.

1. **Tests:** run `npm test` unless it has already passed after the last code change in this session. If anything fails, stop: don't commit, and report the failure.
2. **Specs:** feature specs (documents describing work to implement, usually within one session) live in `specs/`. Delete every spec whose work is now fully implemented. Keep partially implemented ones and say what is left. This is about `specs/` only; never delete Playwright tests (`tests/*.spec.ts`).
3. **Commit and push** everything to `main`, with a message that describes the change.
4. **Deploy:** wait for the GitHub Pages workflow run for that commit to finish and report whether it succeeded. The repo is public, so `curl -s "https://api.github.com/repos/mourulez/spacegame/actions/runs?per_page=1"` works without `gh`.

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
- **Landscape only:** in portrait the game shows a "rotate your device" prompt instead (and Android locks to landscape on entering fullscreen). Don't spend effort on portrait layouts.
- **Screen independence:** define gameplay in world units, never pixels. The play area has a fixed 4:3 aspect ratio, the shape of an iPad in landscape, the least elongated target screen (`src/game/play-area.ts`). The camera always fits the whole play area and the game always fills the screen: wider screens (phones, 16:9 monitors) see more scenery at the sides, which must never give more room to play or any other gameplay advantage. Speeds, sizes and difficulty are the same at any aspect ratio.
- **Resolution independence:** UI is sized in CSS units relative to the viewport and respects safe-area insets. Pixel density affects only sharpness, never layout or gameplay.
- **Input independence:** every action must be possible with touch alone and with keyboard/mouse, with equivalent responsiveness and precision. No hover-only or keyboard-only interactions. Two independent controls, the ship and the reticle, with auto-fire, so two thumbs are enough: on touch, two invisible relative drag zones (left half of the screen moves the ship, right half the reticle; a finger keeps the half it started in), each moving its object like a trackpad so the finger never covers it, and nothing drawn; on keyboard, WASD moves the ship and the arrow keys the reticle; the mouse points the reticle at the spot directly. There is no virtual joystick.

## Other constraints

- **Fully self-contained / offline.** The shipped game must make no network requests: no CDNs, no Google Fonts, no analytics, no remote decoders. Every asset (fonts, audio, models, textures, Draco/KTX2/Basis decoders copied from `node_modules/three/examples/jsm/libs/`) lives in the repo and is bundled or put in `public/`. After adding a dependency or loader, grep `dist/assets/*.js` for `https?://` to confirm.
- **Source art vs shipped assets.** Full-size originals from the artist live in `art/` and are never imported. The game imports optimized copies from `src/assets/` (resized, recompressed). Paintings are grayscale on purpose and get their colors from the palettes in `src/game/atmosphere.ts`, so a different time of day is a different set of palettes.
- **Relative paths only.** `vite.config.ts` sets `base: './'` so the same `dist/` works under GitHub Pages' `/spacegame/` subpath and inside a portal zip/iframe. Never reference assets with a leading `/`.
- No physics engine and no portal SDK (Poki/CrazyGames) for now. When a portal SDK is added, it goes behind an adapter in `src/platform/` so the game still runs without it.

## Deployment

`.github/workflows/deploy.yml` runs `npm ci && npm run build` on every push to `main` and publishes `dist/` to GitHub Pages (https://mourulez.github.io/spacegame/). The repo's Pages source must be set to "GitHub Actions". Pages caches `index.html` for about 10 minutes, so phones may need a hard reload to pick up a new deploy.
