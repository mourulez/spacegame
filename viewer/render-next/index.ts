/*
 * The render library's public API, as the viewer uses it. The game imports
 * the modules it needs directly, so the loader stays out of its bundle until
 * it uses it.
 *
 * This is the experimental copy (viewer/render-next/), rebuilt from the
 * reference demo (docs/reference/nave-cel-shader.html). The official one
 * (src/render/) is what the game draws with until a release
 * (npm run render:release) copies this one over it. See CLAUDE.md.
 */
export * from './bloom';
export * from './decals';
export * from './geometry';
export * from './look';
export * from './materials';
export * from './model';
export * from './params';
export * from './renderer';
export * from './shadow';
