/*
 * The render library's public API, as the viewer uses it. The game imports
 * the modules it needs directly, so the loader stays out of its bundle until
 * it uses it.
 *
 * This library exists twice, with the same files: src/render/ is the official
 * one (the game and the viewer) and viewer/render-next/ the experimental one
 * (the viewer only). The official one changes only by a release
 * (npm run render:release, which copies next over it) or by an urgent fix
 * made in both. See CLAUDE.md.
 */
export * from './model';
export * from './renderer';
export * from './toon';
