// The GitHub release tag that holds the game client built from this checkout:
// game-client-<first 12 hex of sha256 over game-client/build.sh and patches/>.
//
// build.sh pins the chia-gaming commit, so these files fully determine the
// build. The game-client workflow publishes under this tag, and
// fetch-game-client.mjs downloads it, so the two always agree without a
// version number committed anywhere. Line endings are normalized so a
// Windows checkout hashes the same as CI and Vercel.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GAME_CLIENT = new URL('../game-client/', import.meta.url);

export function gameClientTag() {
  const patches = readdirSync(new URL('patches/', GAME_CLIENT))
    .filter((f) => f.endsWith('.patch'))
    .sort()
    .map((f) => `patches/${f}`);
  const hash = createHash('sha256');
  for (const file of ['build.sh', ...patches]) {
    const text = readFileSync(new URL(file, GAME_CLIENT), 'utf8').replace(/\r\n/g, '\n');
    hash.update(`${file}\0${text}\0`);
  }
  return `game-client-${hash.digest('hex').slice(0, 12)}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(gameClientTag());
}
