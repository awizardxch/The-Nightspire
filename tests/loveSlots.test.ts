// Love Slots engine vs. the design's simulation (aWizard-Familiar
// docs/slots/simulate.py). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAULDRONS,
  MAX_WIN,
  lineHits,
  playSpin,
  resolvePotionPick,
  settle,
  type Grid,
  type Rng,
} from '../src/lib/loveSlots.ts';

/** mulberry32: small seeded PRNG for repeatable tests */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/love-slots-lines.json', import.meta.url), 'utf8'),
) as { grid: string[]; lines: number; c1: number; c5: number }[];

test('line pays match simulate.py on 3,000 recorded grids', () => {
  for (const [i, f] of fixtures.entries()) {
    const grid = f.grid.map((reel) => [...reel]) as Grid;
    const sum = (coins: number) => lineHits(grid, f.lines, coins).reduce((a, h) => a + h.mult, 0);
    assert.equal(sum(1), f.c1, `case ${i}, 1 coin`);
    assert.equal(sum(5), f.c5, `case ${i}, max coins`);
  }
});

function rtp(spins: number, lines: number, coins: number, seed: number) {
  const rng = seeded(seed);
  let total = 0;
  const hits = { free: 0, heart: 0, potion: 0 };
  for (let i = 0; i < spins; i++) {
    const s = playSpin(rng, lines, coins);
    let potion = 0;
    if (s.potionPick) potion = resolvePotionPick(rng, Math.floor(rng.next() * 3)).won;
    total += settle(s.win, potion);
    if (s.freeSpins) hits.free++;
    if (s.heartLock) hits.heart++;
    if (s.potionPick) hits.potion++;
  }
  return { rtp: total / spins, hits };
}

// Long-run base return from simulate.py, 6 × 500k spins per shape: 91.18%
// at 20 lines, 90.90% at 1 line. A single 300k run swings by ±2.5 points
// (rare large wins dominate), hence the tolerance.
test('return to player matches simulate.py (20 lines, 1 coin: ~91.2%)', () => {
  const { rtp: r, hits } = rtp(600_000, 20, 1, 1);
  assert.ok(Math.abs(r - 0.9118) < 0.03, `rtp ${r}`);
  // simulate.py: free spins 1 in 242, Heart Lock 1 in 333, Potion Pick 1 in 465
  assert.ok(Math.abs(600_000 / hits.free - 242) < 15, `free spins 1 in ${600_000 / hits.free}`);
  assert.ok(Math.abs(600_000 / hits.heart - 333) < 25, `heart lock 1 in ${600_000 / hits.heart}`);
  assert.ok(Math.abs(600_000 / hits.potion - 465) < 35, `potion 1 in ${600_000 / hits.potion}`);
});

test('return to player matches simulate.py (1 line: ~90.9%)', () => {
  const { rtp: r } = rtp(600_000, 1, 1, 2);
  assert.ok(Math.abs(r - 0.909) < 0.03, `rtp ${r}`);
});

test('potion pick shuffles the three cauldrons after the pick', () => {
  const rng = seeded(3);
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    const { contents, won } = resolvePotionPick(rng, i % 3);
    assert.deepEqual([...contents].sort((a, b) => a - b), [...CAULDRONS]);
    assert.equal(won, contents[i % 3]);
    seen.add(contents.join(','));
  }
  assert.equal(seen.size, 6, 'every order occurs');
});

test('a spin never settles above the max win', () => {
  assert.equal(settle(900, 60), MAX_WIN);
  assert.equal(settle(10, 25), 35);
});
