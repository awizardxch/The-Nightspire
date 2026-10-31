// ─────────────────────────────────────────────────────────────────
//  LoveSlots — free-play slot machine (no wallet, no chain)
//  · Game math: src/lib/loveSlots.ts (port of the design's simulation)
//  · Free credits only; they have no value and can be refilled
//  · Player-protection defaults from the design's compliance profile:
//    at least 2.5 s per spin, no autoplay or turbo, no celebration when
//    a "win" returns no more than the bet, session net and time on screen
// ─────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  CAULDRONS,
  FREE_SPIN_MULT,
  HL_CELLS,
  HL_FULL_GRID,
  JACKPOT_PAYS,
  LINES,
  LINE_CHOICES,
  MAX_COINS,
  MAX_WIN,
  POOL_BPS,
  STRIPS,
  cryptoRng,
  loveDraw,
  playSpin,
  resolvePotionPick,
  settle,
  type Grid,
  type HeartLock,
  type LineHit,
  type Pool,
  type Spin,
  type Sym,
} from '../lib/loveSlots';

const ICON: Record<Sym, string> = {
  H: '❤️', W: '🧙', O: '🦉', C: '💎', D: '🕯️', S: '⭐', L: '🍃', M: '🌙', P: '🧪', B: '📖',
};
const COIN_VALUES = [1, 2, 5, 10];
const MAX_BET = 20 * MAX_COINS * COIN_VALUES[COIN_VALUES.length - 1];
const START_CREDITS = 5000;
const POOL_SEED: Record<Pool, number> = { mini: 100, major: 1000, grand: 5000 };
const MIN_CYCLE_MS = 2500;
const STORE_KEY = 'nightspire-love-slots-v1';

interface Saved {
  credits: number;
  pools: Record<Pool, number>;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (typeof s.credits === 'number' && s.pools) return s;
    }
  } catch {
    /* storage blocked: start fresh */
  }
  return { credits: START_CREDITS, pools: { ...POOL_SEED } };
}

function save(s: Saved) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: keep playing in memory */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randomGrid(): Grid {
  return STRIPS.map((strip) => {
    const stop = Math.floor(Math.random() * strip.length);
    return [0, 1, 2].map((r) => strip[(stop + r) % strip.length] as Sym);
  });
}

function winningCells(hits: LineHit[]): Set<number> {
  const cells = new Set<number>();
  for (const h of hits) {
    for (let reel = 0; reel < h.length; reel++) cells.add(reel * 3 + LINES[h.line][reel]);
  }
  return cells;
}

type Phase = 'idle' | 'spinning' | 'free' | 'heartlock' | 'potion' | 'done';

export default function LoveSlots({ onBack }: { onBack: () => void }) {
  const [saved, setSaved] = useState<Saved>(load);
  const [lines, setLines] = useState(20);
  const [coins, setCoins] = useState(1);
  const [coinValue, setCoinValue] = useState(1);
  const [grid, setGrid] = useState<Grid>(randomGrid);
  const [stopped, setStopped] = useState(5);
  const [highlight, setHighlight] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<Phase>('idle');
  const [banner, setBanner] = useState<string | null>(null);
  const [lastWin, setLastWin] = useState<{ amount: number; bet: number; detail: string[] } | null>(null);
  const [freeLeft, setFreeLeft] = useState(0);
  const [hlCells, setHlCells] = useState<(number | null)[] | null>(null);
  const [hlRespins, setHlRespins] = useState(0);
  const [potion, setPotion] = useState<{ contents: number[] | null; picked: number | null } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const potionResolve = useRef<((i: number) => void) | null>(null);
  const [session] = useState(() => ({ start: Date.now(), credits: load().credits }));
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => save(saved), [saved]);

  const bet = lines * coins * coinValue;
  const busy = phase !== 'idle' && phase !== 'done';
  const canSpin = !busy && saved.credits >= bet;

  async function showReels(final: Grid) {
    setHighlight(new Set());
    setStopped(0);
    const spinUntil = Date.now() + 900;
    while (Date.now() < spinUntil) {
      setGrid(randomGrid());
      await sleep(80);
    }
    for (let reel = 1; reel <= 5; reel++) {
      const blur = randomGrid();
      setGrid(final.map((col, i) => (i < reel ? col : blur[i])));
      setStopped(reel);
      await sleep(160);
    }
    setGrid(final);
  }

  async function runFreeSpins(spin: Spin, betNow: number) {
    setPhase('free');
    setBanner(`🌙 Moonlit Free Spins · ${spin.freeSpins!.length} spins, wins ×${FREE_SPIN_MULT}`);
    await sleep(1400);
    let total = 0;
    for (const [i, fs] of spin.freeSpins!.entries()) {
      setFreeLeft(spin.freeSpins!.length - i - 1);
      await showReels(fs.grid);
      setHighlight(winningCells(fs.hits));
      total += fs.win;
      setBanner(`🌙 Free spin ${i + 1}/${spin.freeSpins!.length} · ${Math.round(total * betNow)} won`);
      await sleep(fs.win > 0 ? 900 : 450);
    }
    setFreeLeft(0);
  }

  async function runHeartLock(hl: HeartLock, betNow: number) {
    setPhase('heartlock');
    setBanner('❤️‍🔥 Heart Lock! Fill all 15 cells for +250×');
    const cells: (number | null)[] = Array(HL_CELLS).fill(null);
    for (const s of hl.start) cells[s.cell] = s.value;
    setHlCells([...cells]);
    setHlRespins(3);
    await sleep(1500);
    for (const round of hl.rounds) {
      for (const l of round.landed) cells[l.cell] = l.value;
      setHlCells([...cells]);
      setHlRespins(round.respinsLeft);
      await sleep(round.landed.length ? 900 : 650);
    }
    const sum = cells.reduce<number>((a, v) => a + (v ?? 0), 0);
    setBanner(
      hl.full
        ? `❤️‍🔥 Full grid! ${Math.round(sum * betNow)} + ${HL_FULL_GRID * betNow} bonus`
        : `❤️‍🔥 Heart Lock pays ${Math.round(sum * betNow)}`,
    );
    await sleep(1500);
    setHlCells(null);
  }

  async function runPotionPick(): Promise<number> {
    setPhase('potion');
    setBanner('🧪 Potion Pick · choose a cauldron');
    setPotion({ contents: null, picked: null });
    const pick = await new Promise<number>((res) => (potionResolve.current = res));
    potionResolve.current = null;
    // shuffled only now, after the choice
    const { contents, won } = resolvePotionPick(cryptoRng, pick);
    setPotion({ contents, picked: pick });
    await sleep(1600);
    setPotion(null);
    return won;
  }

  async function spin() {
    if (!canSpin) return;
    const started = Date.now();
    const betNow = bet;
    const linesNow = lines;
    const coinsNow = coins;
    setLastWin(null);
    setBanner(null);
    setPhase('spinning');

    // stake, and the jackpot pools' share of it
    let pools = { ...saved.pools };
    for (const p of Object.keys(POOL_BPS) as Pool[]) pools[p] += (betNow * POOL_BPS[p]) / 10_000;
    setSaved((s) => ({ ...s, credits: s.credits - betNow, pools }));

    const result = playSpin(cryptoRng, linesNow, coinsNow);
    const jackpots = loveDraw(cryptoRng, betNow, MAX_BET, linesNow, coinsNow);

    await showReels(result.grid);
    setHighlight(winningCells(result.hits));
    await sleep(500);

    if (result.freeSpins) await runFreeSpins(result, betNow);
    if (result.heartLock) await runHeartLock(result.heartLock, betNow);
    const potionWin = result.potionPick ? await runPotionPick() : 0;

    const x = settle(result.win, potionWin);
    let amount = Math.round(x * betNow);
    const detail: string[] = [];
    if (result.lineWin) detail.push(`Lines ${Math.round(result.lineWin * betNow)}`);
    if (result.moonPay) detail.push(`Moons ${result.moonPay * betNow}`);
    if (result.freeSpins) detail.push(`Free spins ${Math.round(result.freeSpins.reduce((a, f) => a + f.win, 0) * betNow)}`);
    if (result.heartLock) detail.push(`Heart Lock ${Math.round(result.heartLock.total * betNow)}`);
    if (potionWin) detail.push(`Potion ${potionWin * betNow}`);
    if (result.win + potionWin > MAX_WIN) detail.push(`capped at ${MAX_WIN}× bet`);
    for (const j of jackpots) {
      const prize = Math.floor(pools[j] * JACKPOT_PAYS);
      pools = { ...pools, [j]: pools[j] - prize };
      amount += prize;
      detail.push(`💗 ${j.toUpperCase()} jackpot ${prize}`);
    }
    setSaved((s) => ({ credits: s.credits + amount, pools }));
    setLastWin({ amount, bet: betNow, detail });

    const wait = MIN_CYCLE_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    setBanner(null);
    setPhase('done');
  }

  const net = saved.credits - session.credits;
  const elapsed = Math.floor((now - session.start) / 1000);
  const realWin = lastWin && lastWin.amount > lastWin.bet;

  return (
    <div className="space-y-2 pb-4" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="flex items-center gap-2">
        <button onClick={onBack} disabled={busy} className="text-xs px-2 py-1 rounded" style={btnGhost(busy)}>
          ← Hub
        </button>
        <span className="glow-text text-sm font-bold">❤️‍🔥 Love Slots</span>
        <span className="text-[0.6rem] px-1.5 py-0.5 rounded" style={{ color: 'var(--warning)', border: '1px solid var(--warning)' }}>
          Free play
        </span>
        <button onClick={() => setShowInfo((v) => !v)} className="ml-auto text-xs" style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {showInfo ? 'Close paytable' : 'Paytable'}
        </button>
      </div>

      {/* jackpots */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {(['mini', 'major', 'grand'] as Pool[]).map((p) => (
          <div key={p} className="rounded-lg py-1" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,102,0,0.35)' }}>
            <div className="text-[0.6rem] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {p === 'mini' ? '✨ Mini' : p === 'major' ? '💗 Major' : '👑 Grand'}
            </div>
            <div className="text-sm font-bold" style={{ color: 'var(--glow-inner)' }}>{Math.floor(saved.pools[p]).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {showInfo ? (
        <Paytable />
      ) : (
        <div className="glow-card p-2 relative">
          {/* reels */}
          <div className="grid grid-cols-5 gap-1">
            {grid.map((reel, r) =>
              <div key={r} className="space-y-1">
                {reel.map((s, row) => {
                  const lit = highlight.has(r * 3 + row);
                  return (
                    <div
                      key={row}
                      className="flex items-center justify-center rounded-md"
                      style={{
                        height: 56,
                        fontSize: 30,
                        background: lit ? 'rgba(255,102,0,0.22)' : 'rgba(0,0,0,0.4)',
                        border: lit ? '1px solid var(--glow-inner)' : '1px solid rgba(255,255,255,0.06)',
                        filter: r >= stopped ? 'blur(1.2px)' : 'none',
                        transition: 'background 0.2s',
                      }}
                    >
                      {ICON[s]}
                    </div>
                  );
                })}
              </div>,
            )}
          </div>

          {/* Heart Lock overlay */}
          {hlCells && (
            <div className="absolute inset-0 p-2 rounded-lg" style={{ background: 'rgba(10,4,12,0.94)' }}>
              <div className="text-center text-xs mb-1" style={{ color: 'var(--glow-inner)' }}>
                Respins left: {hlRespins}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {Array.from({ length: 5 }, (_, r) => (
                  <div key={r} className="space-y-1">
                    {[0, 1, 2].map((row) => {
                      const v = hlCells[r * 3 + row];
                      return (
                        <div key={row} className="flex flex-col items-center justify-center rounded-md" style={{ height: 50, background: v != null ? 'rgba(255,40,90,0.25)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,80,120,0.35)' }}>
                          {v != null && (
                            <>
                              <span style={{ fontSize: 20 }}>❤️</span>
                              <span className="text-[0.65rem] font-bold" style={{ color: '#fff' }}>{v}×</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Potion Pick overlay */}
          {potion && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg" style={{ background: 'rgba(4,10,12,0.94)' }}>
              <p className="text-sm" style={{ color: 'var(--text-color)' }}>
                {potion.contents ? 'The cauldrons reveal…' : `Pick one: ${CAULDRONS.join('× · ')}× (shuffled after you choose)`}
              </p>
              <div className="flex gap-3">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    disabled={potion.contents !== null}
                    onClick={() => potionResolve.current?.(i)}
                    className="flex flex-col items-center rounded-xl px-4 py-3"
                    style={{
                      background: potion.picked === i ? 'rgba(0,217,255,0.2)' : 'rgba(0,0,0,0.4)',
                      border: potion.picked === i ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.15)',
                      cursor: potion.contents ? 'default' : 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 34 }}>🧪</span>
                    <span className="text-sm font-bold" style={{ color: 'var(--text-color)' }}>
                      {potion.contents ? `${potion.contents[i]}×` : '?'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* banner / result */}
      <div className="text-center text-sm" style={{ minHeight: 40 }}>
        {banner ? (
          <span style={{ color: 'var(--glow-inner)' }}>{banner}{freeLeft ? ` · ${freeLeft} left` : ''}</span>
        ) : lastWin ? (
          lastWin.amount === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>No win</span>
          ) : (
            <div>
              <span className={realWin ? 'glow-text font-bold' : ''} style={{ color: realWin ? 'var(--success)' : 'var(--text-muted)' }}>
                {realWin ? `WIN ${lastWin.amount.toLocaleString()}` : `Returned ${lastWin.amount.toLocaleString()} of ${lastWin.bet} bet`}
              </span>
              <div className="text-[0.65rem]" style={{ color: 'var(--text-muted)' }}>{lastWin.detail.join(' · ')}</div>
            </div>
          )
        ) : null}
      </div>

      {/* bet controls */}
      <div className="glow-card p-2 space-y-2">
        <Stepper label="Lines" value={lines} options={[...LINE_CHOICES]} onChange={setLines} disabled={busy} />
        <Stepper label="Coins / line" value={coins} options={[1, 2, 3, 4, 5]} onChange={setCoins} disabled={busy} />
        <Stepper label="Coin value" value={coinValue} options={COIN_VALUES} onChange={setCoinValue} disabled={busy} />
        <div className="flex items-center gap-2">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Bet <b style={{ color: 'var(--text-color)' }}>{bet}</b>
            {lines === 20 && coins === MAX_COINS && <span style={{ color: 'var(--glow-inner)' }}> · 👑 Grand eligible</span>}
          </div>
          <button
            onClick={() => { setLines(20); setCoins(MAX_COINS); }}
            disabled={busy}
            className="ml-auto text-xs px-2 py-1 rounded"
            style={btnGhost(busy)}
          >
            Max lines & coins
          </button>
        </div>
        <button
          onClick={spin}
          disabled={!canSpin}
          className="w-full py-2.5 rounded-lg text-sm font-bold"
          style={{
            background: canSpin ? 'linear-gradient(135deg, #ff3b6b, #ff6600)' : 'rgba(60,60,60,0.6)',
            color: '#fff',
            border: 'none',
            cursor: canSpin ? 'pointer' : 'not-allowed',
            opacity: canSpin ? 1 : 0.55,
          }}
        >
          {busy ? 'Spinning…' : 'Spin'}
        </button>
      </div>

      {/* session */}
      <div className="flex items-center justify-between text-xs px-1" style={{ color: 'var(--text-muted)' }}>
        <span>Credits <b style={{ color: 'var(--text-color)' }}>{Math.floor(saved.credits).toLocaleString()}</b></span>
        <span>Session net <b style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{net >= 0 ? '+' : ''}{net.toLocaleString()}</b></span>
        <span>Time {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
      </div>
      {saved.credits < bet && !busy && (
        <button
          onClick={() => setSaved((s) => ({ ...s, credits: START_CREDITS }))}
          className="w-full py-1.5 rounded-lg text-xs"
          style={btnGhost(false)}
        >
          Refill free credits ({START_CREDITS.toLocaleString()})
        </button>
      )}
      <p className="text-[0.6rem] text-center" style={{ color: 'var(--text-muted)' }}>
        Free play: credits have no value and can't be bought, sold or withdrawn.
      </p>
    </div>
  );
}

function btnGhost(disabled: boolean) {
  return {
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-color)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  } as const;
}

function Stepper({ label, value, options, onChange, disabled }: {
  label: string; value: number; options: number[]; onChange: (v: number) => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-24" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex gap-1 flex-wrap">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onChange(o)}
            disabled={disabled}
            className="text-xs px-2.5 py-1 rounded"
            style={{
              background: o === value ? 'rgba(0,217,255,0.18)' : 'rgba(0,0,0,0.35)',
              border: o === value ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-color)',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Paytable() {
  const rows: [Sym, string][] = [['H', 'Heart (wild)'], ['W', 'Wizard'], ['O', 'Owl'], ['C', 'Crystal'], ['D', 'Candle'], ['S', 'Star'], ['L', 'Leaf']];
  const pays: Record<string, string> = { H: '100 / 500 / 2,000 (5,000 at 5 coins)', W: '60 / 250 / 1,000', O: '35 / 120 / 450', C: '25 / 70 / 230', D: '12 / 35 / 140', S: '7 / 23 / 90', L: '5 / 12 / 45' };
  return (
    <div className="glow-card p-3 space-y-2 text-xs" style={{ color: 'var(--text-muted)' }}>
      <p style={{ color: 'var(--text-color)' }}>Line pays (× line bet, 3 / 4 / 5 from the left; ❤️ substitutes)</p>
      {rows.map(([s, name]) => (
        <div key={s} className="flex justify-between"><span>{ICON[s]} {name}</span><span>{pays[s]}</span></div>
      ))}
      <p style={{ color: 'var(--text-color)' }} className="pt-1">Features</p>
      <p>🌙 3+ Moons anywhere: 5× / 20× / 100× bet, then 12 free spins with wins ×3 (about 1 in 242 spins).</p>
      <p>📖 6+ Spellbooks: Heart Lock. Hearts worth 1×–25× lock in place; 3 respins, reset by each new heart. Fill all 15 for +250× (about 1 in 333).</p>
      <p>🧪 3+ Potions: pick a cauldron, 10× / 25× / 60× bet, shuffled after you choose (about 1 in 465).</p>
      <p>Love Draw: every spin can win the Mini or Major; odds scale with your bet. The 👑 Grand needs 20 lines and 5 coins.</p>
      <p style={{ color: 'var(--text-color)' }} className="pt-1">Return to player (long run)</p>
      <p>About 91% from lines and features at any line count, plus the jackpots. Max win {MAX_WIN}× bet per spin, plus jackpots.</p>
    </div>
  );
}
