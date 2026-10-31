// ─────────────────────────────────────────────────────────────────
//  Love Slots game math — free-play engine.
//
//  A direct port of docs/slots/simulate.py in aWizard-Familiar
//  (the model in LOVE_SLOTS_SPEC.md): 5 reels × 3 rows, 20 paylines,
//  Moonlit Free Spins, Heart Lock (Hold & Win), Potion Pick, and the
//  Love Draw jackpots. The reel strips are exported from simulate.py
//  verbatim, so the reels match stop for stop. Free play only: credits
//  have no value, and nothing here touches a wallet or the chain.
//
//  tests/loveSlots.test.ts checks line pays against simulate.py on
//  recorded grids, and the return to player against its figures.
// ─────────────────────────────────────────────────────────────────

/** H heart (wild) · W wizard · O owl · C crystal · D candle · S star · L leaf
 *  · M moon (scatter) · P potion (scatter) · B spellbook (Heart Lock) */
export type Sym = 'H' | 'W' | 'O' | 'C' | 'D' | 'S' | 'L' | 'M' | 'P' | 'B';

/** Uniform in [0, 1). */
export interface Rng {
  next(): number;
}

export const STRIPS: readonly string[] = [
  'LSLCWLSBPLLLBDDLWDOBODBSSBWSLLCCDLLSBSDLSOSLCLBWDBSDLBBSHSCHLLODOCDLHMSBCMWCLDPDLSDDCSLCLOSSOBS',
  'LLCDLSBLSBLDDSSDBLSPWBHDLSSCLCLOWSSDLBLBCMLDSDDOLCSDDHODMLLLPOCSBSOSDBCBOBHCLCLWWLBLSBLSSCSLODW',
  'OCDDLSPLSOSLLDLSOBCCDCHWBSBSSCCSOLHCSBLSBSLHPLDLDLDLLDSLDWSBSDBODSOBLSCBLLWBWBDWLSOMLMBLDCCDSLL',
  'CCODDOBLPSCODDSLLCSDWDDWSLOBDSLCBCBLHLBSLBSBSLBSODSCBDLBCSMSCDHLSCHLSWBLDWMLSDOPBLLOSWSLLLLDSLL',
  'CLSWHCSDSMCWLBCLBLODODDLLBDCSWOBSSLLBDLOSDSDDSLSLDLBSLLHDLLBSLPSCLDSSBOBCWCHDLOSMCWSDCPLBBLLBOS',
];

/** Row (0 top … 2 bottom) of each reel, per payline. */
export const LINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
  [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 0, 2, 0, 0],
];
export const LINE_CHOICES = [1, 5, 10, 15, 20] as const;
export const MAX_COINS = 5;

/** × line bet, for 3 / 4 / 5 of a kind from the left. */
export const PAYS: Readonly<Partial<Record<Sym, readonly [number, number, number]>>> = {
  H: [100, 500, 2000], W: [60, 250, 1000], O: [35, 120, 450],
  C: [25, 70, 230], D: [12, 35, 140], S: [7, 23, 90], L: [5, 12, 45],
};
/** Five hearts at max coins pay this instead of 2,000. */
export const TOP_AWARD_MAX_COINS = 5000;
/** × total bet for 3 / 4 / 5 moons anywhere, plus free spins. */
export const MOON_PAYS: Readonly<Record<number, number>> = { 3: 5, 4: 20, 5: 100 };
export const FREE_SPINS = 12;
export const FREE_SPIN_MULT = 3;
/** Potion Pick, × total bet. */
export const CAULDRONS = [10, 25, 60] as const;
export const HL_TRIGGER = 6;
export const HL_CELLS = 15;
export const HL_RESPINS = 3;
export const HL_LAND = 0.06;
/** Heart Lock heart values (× total bet) and their weights. */
export const HL_VALUES: readonly (readonly [number, number])[] = [[1, 35], [2, 25], [3, 18], [5, 12], [10, 7], [25, 3]];
export const HL_FULL_GRID = 250;
/** Published max win per spin, × total bet (jackpots excluded). */
export const MAX_WIN = 500;

const SCATTERS: ReadonlySet<Sym> = new Set<Sym>(['M', 'P', 'B']);

// ── reels and lines ─────────────────────────────────────────────

/** grid[reel][row] */
export type Grid = Sym[][];

export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

export function spinGrid(rng: Rng): Grid {
  return STRIPS.map((strip) => {
    const stop = randInt(rng, strip.length);
    return [0, 1, 2].map((r) => strip[(stop + r) % strip.length] as Sym);
  });
}

/** Multiple of the line bet one payline pays. */
export function lineWin(symbols: readonly Sym[], coins: number): number {
  let target: Sym = symbols.find((s) => s !== 'H') ?? 'H';
  if (SCATTERS.has(target)) target = 'H';
  let run = 0;
  for (const s of symbols) {
    if (s === target || s === 'H') run++;
    else break;
  }
  let wildRun = 0;
  for (const s of symbols) {
    if (s === 'H') wildRun++;
    else break;
  }
  let best = 0;
  if (target !== 'H' && run >= 3) best = PAYS[target]![run - 3];
  if (wildRun >= 3) {
    let top = PAYS.H![wildRun - 3];
    if (wildRun === 5 && coins === MAX_COINS) top = TOP_AWARD_MAX_COINS;
    best = Math.max(best, top);
  }
  return best;
}

export interface LineHit {
  line: number;
  /** × line bet */
  mult: number;
  /** how many reels from the left */
  length: number;
}

export function lineHits(grid: Grid, lines: number, coins: number): LineHit[] {
  const hits: LineHit[] = [];
  for (let i = 0; i < lines; i++) {
    const symbols = LINES[i].map((row, reel) => grid[reel][row]);
    const mult = lineWin(symbols, coins);
    if (mult > 0) {
      let length = 0;
      const target = symbols.find((s) => s !== 'H') ?? 'H';
      for (const s of symbols) {
        if (s === 'H' || s === target) length++;
        else break;
      }
      hits.push({ line: i, mult, length: Math.max(3, length) });
    }
  }
  return hits;
}

export function countSym(grid: Grid, sym: Sym): number {
  let n = 0;
  for (const reel of grid) for (const s of reel) if (s === sym) n++;
  return n;
}

// ── features ────────────────────────────────────────────────────

function heartValue(rng: Rng): number {
  const total = HL_VALUES.reduce((a, [, w]) => a + w, 0);
  let x = rng.next() * total;
  for (const [v, w] of HL_VALUES) {
    if ((x -= w) < 0) return v;
  }
  return HL_VALUES[HL_VALUES.length - 1][0];
}

export interface HeartLockRound {
  /** cells (reel*3+row) that landed a heart this respin, with values */
  landed: { cell: number; value: number }[];
  respinsLeft: number;
}

export interface HeartLock {
  /** the triggering spellbooks, now hearts */
  start: { cell: number; value: number }[];
  rounds: HeartLockRound[];
  full: boolean;
  /** × total bet */
  total: number;
}

export function heartLock(rng: Rng, grid: Grid): HeartLock {
  const filled = new Map<number, number>();
  const start: { cell: number; value: number }[] = [];
  grid.forEach((reel, r) =>
    reel.forEach((s, row) => {
      if (s === 'B') {
        const v = heartValue(rng);
        filled.set(r * 3 + row, v);
        start.push({ cell: r * 3 + row, value: v });
      }
    }),
  );
  const rounds: HeartLockRound[] = [];
  let respins = HL_RESPINS;
  while (respins > 0 && filled.size < HL_CELLS) {
    const landed: { cell: number; value: number }[] = [];
    for (let cell = 0; cell < HL_CELLS; cell++) {
      if (!filled.has(cell) && rng.next() < HL_LAND) landed.push({ cell, value: 0 });
    }
    for (const l of landed) {
      l.value = heartValue(rng);
      filled.set(l.cell, l.value);
    }
    respins = landed.length ? HL_RESPINS : respins - 1;
    rounds.push({ landed, respinsLeft: respins });
  }
  const full = filled.size === HL_CELLS;
  let total = 0;
  for (const v of filled.values()) total += v;
  return { start, rounds, full, total: total + (full ? HL_FULL_GRID : 0) };
}

export interface FreeSpin {
  grid: Grid;
  hits: LineHit[];
  /** × total bet, multiplier applied */
  win: number;
}

// ── one spin ────────────────────────────────────────────────────

export interface Spin {
  grid: Grid;
  hits: LineHit[];
  /** line wins, × total bet */
  lineWin: number;
  moons: number;
  /** × total bet */
  moonPay: number;
  freeSpins: FreeSpin[] | null;
  heartLock: HeartLock | null;
  /** the player must pick a cauldron before the spin is settled */
  potionPick: boolean;
  /** everything except a pending Potion Pick, × total bet, uncapped */
  win: number;
}

export function playSpin(rng: Rng, lines: number, coins: number): Spin {
  const grid = spinGrid(rng);
  const perLine = 1 / lines;
  const hits = lineHits(grid, lines, coins);
  const lineWinX = hits.reduce((a, h) => a + h.mult, 0) * perLine;
  const moons = countSym(grid, 'M');
  let moonPay = 0;
  let freeSpins: FreeSpin[] | null = null;
  if (moons >= 3) {
    moonPay = MOON_PAYS[Math.min(moons, 5)];
    freeSpins = [];
    for (let i = 0; i < FREE_SPINS; i++) {
      // free spins pay lines only; features don't retrigger
      const g = spinGrid(rng);
      const h = lineHits(g, lines, coins);
      freeSpins.push({ grid: g, hits: h, win: h.reduce((a, x) => a + x.mult, 0) * perLine * FREE_SPIN_MULT });
    }
  }
  const potionPick = countSym(grid, 'P') >= 3;
  const hl = countSym(grid, 'B') >= HL_TRIGGER ? heartLock(rng, grid) : null;
  const win =
    lineWinX + moonPay + (freeSpins?.reduce((a, f) => a + f.win, 0) ?? 0) + (hl?.total ?? 0);
  return { grid, hits, lineWin: lineWinX, moons, moonPay, freeSpins, heartLock: hl, potionPick, win };
}

/** Shuffle the cauldrons only after the player has picked, so the pick is real. */
export function resolvePotionPick(rng: Rng, pick: number): { contents: number[]; won: number } {
  const contents: number[] = [...CAULDRONS];
  for (let i = contents.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [contents[i], contents[j]] = [contents[j], contents[i]];
  }
  return { contents, won: contents[pick] };
}

/** The settled multiple of the total bet: capped at MAX_WIN. */
export function settle(spinWin: number, potionWin = 0): number {
  return Math.min(spinWin + potionWin, MAX_WIN);
}

// ── Love Draw (free-play jackpots) ──────────────────────────────

export type Pool = 'mini' | 'major' | 'grand';
/** share of every bet that goes into each pool, in basis points */
export const POOL_BPS: Readonly<Record<Pool, number>> = { mini: 50, major: 100, grand: 150 };
/** odds per spin at max bet; scaled by bet / max bet */
export const DRAW_ODDS: Readonly<Record<Pool, number>> = { mini: 1 / 1000, major: 1 / 10000, grand: 1 / 50000 };
/** a winner takes 90% of the pool; 10% re-seeds it */
export const JACKPOT_PAYS = 0.9;

/** Pools won by one spin. The Grand needs 20 lines and max coins. */
export function loveDraw(rng: Rng, bet: number, maxBet: number, lines: number, coins: number): Pool[] {
  const scale = Math.min(1, bet / maxBet);
  const won: Pool[] = [];
  for (const pool of ['mini', 'major', 'grand'] as Pool[]) {
    if (pool === 'grand' && !(lines === 20 && coins === MAX_COINS)) continue;
    if (rng.next() < DRAW_ODDS[pool] * scale) won.push(pool);
  }
  return won;
}

// ── randomness for real play in the browser ─────────────────────

export const cryptoRng: Rng = {
  next() {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    // 53 random bits → uniform double in [0, 1)
    return (buf[0] * 2 ** 21 + (buf[1] >>> 11)) / 2 ** 53;
  },
};
