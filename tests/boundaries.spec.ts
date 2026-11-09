/// <reference types="node" />
import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/*
 * The game, the viewer and the two copies of the render library may only
 * import what CLAUDE.md allows, so game sessions and viewer sessions can't
 * break each other's side, and a render-next release can be copied over
 * src/render/ as it is.
 */

const ROOT = resolve(import.meta.dirname, '..');
const RENDER = join(ROOT, 'src', 'render');
const RENDER_NEXT = join(ROOT, 'viewer', 'render-next');
const VIEWER = join(ROOT, 'viewer');
// The viewer's test models: their generators run in Node (they may import its modules), never in the viewer.
const SAMPLES = join(ROOT, 'viewer', 'samples');
const SRC = join(ROOT, 'src');

const IMPORT = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|js|mjs)$/.test(entry.name) ? [path] : [];
  });
}

/** Every import in a file: the package name, or the absolute path a relative import points to. */
function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(IMPORT)].map((m) => {
    const spec = (m[1] ?? m[2] ?? m[3]).split('?')[0];
    return spec.startsWith('.') ? resolve(dirname(file), spec) : spec;
  });
}

const inside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep);
const isThree = (spec: string) => spec === 'three' || spec.startsWith('three/');

/** Files under `dir` (but not under any of `except`) with an import `allowed` rejects, as "file: import". */
function violations(dir: string, allowed: (spec: string) => boolean, except: string[] = []): string[] {
  return sourceFiles(dir)
    .filter((file) => !except.some((e) => inside(file, e)))
    .flatMap((file) => imports(file).filter((spec) => !allowed(spec)).map((spec) => `${relative(ROOT, file)}: ${relative(ROOT, spec) || spec}`));
}

test('the render libraries import only three.js and their own files', () => {
  for (const lib of [RENDER, RENDER_NEXT]) {
    expect(violations(lib, (spec) => isThree(spec) || inside(spec, lib))).toEqual([]);
  }
});

test('the game never imports the viewer', () => {
  expect(violations(SRC, (spec) => !inside(spec, VIEWER))).toEqual([]);
});

test('the viewer imports only the render libraries, never the game', () => {
  const allowed = (spec: string) => isThree(spec) || inside(spec, VIEWER) || inside(spec, RENDER);
  expect(violations(VIEWER, allowed, [RENDER_NEXT, SAMPLES])).toEqual([]);
});
