// Runs before `vite build` (npm "prebuild"). Downloads the game client release
// for this checkout (scripts/game-client-tag.mjs), checks its SHA-256 and
// unpacks it into public/games/, which Vite copies into the deploy, so the
// client is served at /games. See docs/GAME_HUB.md.
//
// If the release doesn't exist yet (the game-client workflow takes ~30 minutes
// after a push), the build continues without /games and says so. The
// workflow redeploys through a Vercel deploy hook once the release exists.
//
//   GAME_CLIENT_SKIP=1      don't fetch (offline or local builds)
//   GAME_CLIENT_REQUIRED=1  fail the build instead of continuing without it
//   GAME_CLIENT_REPO        owner/repo to fetch from (default: this repo)
//   GAME_CLIENT_BASE_URL    fetch from here instead of the GitHub release (testing, mirrors)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameClientTag } from './game-client-tag.mjs';

const ASSET = 'player-app.tgz';
const SUMS = 'SHA256SUMS.txt';
const GAMES_DIR = fileURLToPath(new URL('../public/games/', import.meta.url));

const env = process.env;
const repo =
  env.GAME_CLIENT_REPO ||
  (env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG
    ? `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
    : 'awizardxch/The-Nightspire');

function skip(reason) {
  if (env.GAME_CLIENT_REQUIRED === '1') {
    console.error(`[game-client] ${reason}`);
    process.exit(1);
  }
  console.warn(`[game-client] ${reason}; building without /games.`);
  process.exit(0);
}

async function download(url) {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

if (env.GAME_CLIENT_SKIP === '1') skip('GAME_CLIENT_SKIP=1');

const tag = gameClientTag();
const base = env.GAME_CLIENT_BASE_URL
  ? `${env.GAME_CLIENT_BASE_URL.replace(/\/+$/, '')}/${tag}/`
  : `https://github.com/${repo}/releases/download/${tag}/`;
console.log(`[game-client] fetching ${tag} from ${base}`);

let sums, tgz;
try {
  sums = await download(base + SUMS);
  tgz = sums && (await download(base + ASSET));
} catch (err) {
  skip(`download failed: ${err.message}`);
}
if (!sums || !tgz) skip(`release ${tag} not published yet`);

const expected = sums
  .toString('utf8')
  .split('\n')
  .map((line) => line.trim().split(/\s+/))
  .find(([, name]) => name === ASSET)?.[0];
const actual = createHash('sha256').update(tgz).digest('hex');
if (!expected || expected !== actual) {
  // A mismatch is never a reason to ship: always fail, even when not required.
  console.error(`[game-client] ${ASSET} sha256 ${actual} does not match ${SUMS} (${expected ?? 'missing'})`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'game-client-'));
writeFileSync(join(tmp, ASSET), tgz);
rmSync(GAMES_DIR, { recursive: true, force: true });
mkdirSync(GAMES_DIR, { recursive: true });
execFileSync('tar', ['-xzf', join(tmp, ASSET), '-C', GAMES_DIR]);
// upstream's local static server; Vercel serves the files itself
rmSync(join(GAMES_DIR, 'static-server.js'), { force: true });
rmSync(tmp, { recursive: true, force: true });
console.log(`[game-client] ${tag} unpacked into public/games/ (sha256 ${actual.slice(0, 12)}…)`);
