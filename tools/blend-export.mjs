// Export models under art/models/ to .glb next to them, with Blender headless and the cel asset format's
// options (tools/blend-export.py), and print what each model carries. Takes .blend files, and .fbx/.obj
// files, which Blender imports first (for a quick look at a model from elsewhere).
//
//   npm run asset:blend                 every .blend, .fbx and .obj under art/models/
//   npm run asset:blend -- ship1        only art/models/ship1/ (a folder or a file path also works)
//
// Blender: the BLENDER environment variable, else the newest install under Program Files.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, parse, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MODELS = join(ROOT, 'art', 'models');
const SCRIPT = join(ROOT, 'tools', 'blend-export.py');
const SOURCES = ['.blend', '.fbx', '.obj']; // not .blend1 backups

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const base = 'C:\\Program Files\\Blender Foundation';
  const installs = existsSync(base)
    ? readdirSync(base)
        .map((d) => join(base, d, 'blender.exe'))
        .filter((p) => existsSync(p))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    : [];
  if (!installs.length) throw new Error('Blender not found: set the BLENDER environment variable to blender.exe');
  return installs[0];
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return SOURCES.includes(extname(e.name).toLowerCase()) ? [path] : [];
  });
}

function targets(args) {
  if (!args.length) return sourceFiles(MODELS);
  return args.flatMap((arg) => {
    const path = [resolve(arg), join(MODELS, arg)].find((p) => existsSync(p));
    if (!path) throw new Error(`Not found: ${arg}`);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

const blender = findBlender();
const files = targets(process.argv.slice(2));
if (!files.length) console.log('No .blend, .fbx or .obj files found.');
for (const file of files) {
  const out = join(dirname(file), `${parse(file).name}.glb`);
  console.log(`\n${relative(ROOT, file)} -> ${relative(ROOT, out)}`);
  const args = extname(file).toLowerCase() === '.blend'
    ? ['--background', '--factory-startup', file, '--python', SCRIPT, '--', out]
    : ['--background', '--factory-startup', '--python', SCRIPT, '--', out, file];
  const log = execFileSync(blender, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const report = log.split(/\r?\n/).filter((line) => line.startsWith('REPORT') || line.startsWith('  ') || /Error|Traceback/.test(line));
  console.log(report.map((line) => line.replace(/^REPORT /, '')).join('\n'));
  if (!existsSync(out)) throw new Error(`Blender didn't write ${out}`);
}
