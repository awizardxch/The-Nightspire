// Downloads the hub (hub.tgz) from the game-client release that matches this
// checkout, checks its SHA-256, and unpacks it into the directory given as the
// first argument. The release is named by scripts/game-client-tag.mjs, the
// same tag the Vercel build uses for /games, so the hub and the client always
// run the same chia-gaming build. Used by hub/Dockerfile; see hub/README.md.
//
//   node hub/fetch-hub.mjs <dir>
//   GAME_CLIENT_REPO       owner/repo to fetch from (default awizardxch/The-Nightspire)
//   GAME_CLIENT_BASE_URL   fetch from here instead of GitHub releases (testing)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gameClientTag } from '../scripts/game-client-tag.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node hub/fetch-hub.mjs <dir>');
  process.exit(2);
}

const tag = gameClientTag();
const repo = process.env.GAME_CLIENT_REPO || 'awizardxch/The-Nightspire';
const base = process.env.GAME_CLIENT_BASE_URL
  ? `${process.env.GAME_CLIENT_BASE_URL.replace(/\/+$/, '')}/${tag}/`
  : `https://github.com/${repo}/releases/download/${tag}/`;

async function download(name) {
  const res = await fetch(base + name);
  if (!res.ok) {
    throw new Error(
      `GET ${base + name}: HTTP ${res.status}` +
        (res.status === 404 ? ` (is release ${tag} published? the game-client workflow builds it)` : ''),
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

const sums = (await download('SHA256SUMS.txt')).toString('utf8');
const tgz = await download('hub.tgz');
const expected = sums
  .split('\n')
  .map((line) => line.trim().split(/\s+/))
  .find(([, name]) => name === 'hub.tgz')?.[0];
const actual = createHash('sha256').update(tgz).digest('hex');
if (expected !== actual) {
  console.error(`hub.tgz sha256 ${actual} does not match SHA256SUMS.txt (${expected ?? 'missing'})`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'hub-'));
writeFileSync(join(tmp, 'hub.tgz'), tgz);
const out = resolve(dir);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync('tar', ['-xzf', join(tmp, 'hub.tgz'), '-C', out]);
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(out, 'RELEASE'), `${tag}\n`);
console.log(`hub ${tag} unpacked into ${out} (sha256 ${actual.slice(0, 12)}…)`);
