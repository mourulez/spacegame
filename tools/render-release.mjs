// Release the experimental render library: copy viewer/render-next/ over src/render/,
// which the game uses. Run it only when the user asks for a release.
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';

const OFFICIAL = 'src/render';
const NEXT = 'viewer/render-next';

// An uncommitted change in the official library would be lost, so stop.
const dirty = execFileSync('git', ['status', '--porcelain', '--', OFFICIAL], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error(`${OFFICIAL} has uncommitted changes; commit them (and carry them into ${NEXT}) first:\n${dirty}`);
  process.exit(1);
}

rmSync(OFFICIAL, { recursive: true, force: true });
cpSync(NEXT, OFFICIAL, { recursive: true });

console.log(`Copied ${NEXT} over ${OFFICIAL}. The game now uses it.`);
console.log('Next: npm run build, adapt the game if the API changed, npm test, check the game, then commit.');
console.log(`Review what the release changes with: git diff -- ${OFFICIAL}`);
