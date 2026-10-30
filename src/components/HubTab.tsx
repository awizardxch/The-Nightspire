// ─────────────────────────────────────────────────────────────────
//  HubTab — the Nightspire game hub
//  · Game catalog: chia-gaming games plus our own titles
//  · Hub picker: BOW hub, other built-in hubs, hubs the player adds
//  · Play: the chia-gaming client, embedded and pointed at the hub
// ─────────────────────────────────────────────────────────────────
import { useState } from 'react';
import {
  CHIA_GAMING_COMMIT,
  GAMES,
  gameClientConfigured,
  gameClientSrc,
  hubReachable,
  isInDiscordFrame,
  type GameInfo,
  type HubInfo,
} from '../lib/gameHub';
import { allHubs, useHubStore } from '../store/hubStore';

const STATUS_LABEL: Record<GameInfo['status'], { text: string; color: string }> = {
  live:           { text: 'Live',           color: 'var(--success)' },
  in_development: { text: 'In development', color: 'var(--warning)' },
  paused:         { text: 'Paused',         color: 'var(--text-muted)' },
};

export default function HubTab() {
  const { selectedHubId, customHubs, playing, selectHub, addCustomHub, removeCustomHub, setPlaying } = useHubStore();
  const [inDiscord] = useState(isInDiscordFrame);
  const hubs = allHubs(customHubs);
  const selected = hubs.find((h) => h.id === selectedHubId) ?? hubs[0] ?? null;
  const src = selected ? gameClientSrc(selected, inDiscord) : null;

  if (playing && src && selected) {
    return <ClientFrame src={src} hub={selected} onBack={() => setPlaying(false)} />;
  }

  return (
    <div className="space-y-3 pb-4">
      <section className="glow-card p-3">
        <h2 className="glow-text text-base font-bold">🎲 Nightspire Game Hub</h2>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Host or join two-player games on any compatible hub. Every game runs in a Chia state channel:
          moves stay off-chain, and the chain only settles the result or a dispute.
        </p>
      </section>

      <HubPicker
        hubs={hubs}
        selected={selected}
        inDiscord={inDiscord}
        onSelect={selectHub}
        onAdd={addCustomHub}
        onRemove={removeCustomHub}
      />

      <section className="space-y-2">
        {GAMES.map((g) => (
          <GameCard
            key={g.id}
            game={g}
            playable={g.inClient && !!src}
            onPlay={() => setPlaying(true)}
          />
        ))}
      </section>

      {!gameClientConfigured(inDiscord) && (
        <p className="text-xs px-1" style={{ color: 'var(--warning)' }}>
          The game client isn&apos;t configured for this build yet
          ({inDiscord ? 'VITE_GAME_CLIENT_DISCORD_PATH' : 'VITE_GAME_CLIENT_URL'}). See docs/GAME_HUB.md.
        </p>
      )}

      <p className="text-[0.65rem] px-1" style={{ color: 'var(--text-muted)' }}>
        chia-gaming {CHIA_GAMING_COMMIT.slice(0, 8)} · peers must run the same revision to open a channel
      </p>
    </div>
  );
}

function HubPicker({
  hubs, selected, inDiscord, onSelect, onAdd, onRemove,
}: {
  hubs: HubInfo[];
  selected: HubInfo | null;
  inDiscord: boolean;
  onSelect: (id: string) => void;
  onAdd: (name: string, url: string) => string | null;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const err = onAdd(name, url);
    setError(err);
    if (!err) { setAdding(false); setName(''); setUrl(''); }
  };

  return (
    <section className="glow-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-color)' }}>Hub</h3>
        {!inDiscord && !adding && (
          <button onClick={() => setAdding(true)} className="text-xs" style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
            + Add hub
          </button>
        )}
      </div>

      {hubs.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          No hubs configured. Set VITE_GAME_HUBS or add one.
        </p>
      )}

      <div className="space-y-1.5">
        {hubs.map((h) => {
          const reachable = hubReachable(h, inDiscord);
          const active = selected?.id === h.id;
          return (
            <div key={h.id} className="flex items-center gap-2">
              <button
                onClick={() => reachable && onSelect(h.id)}
                disabled={!reachable}
                className="flex-1 text-left rounded-lg px-2.5 py-1.5"
                style={{
                  background: active ? 'rgba(0,217,255,0.12)' : 'rgba(0,0,0,0.25)',
                  border: active ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                  cursor: reachable ? 'pointer' : 'not-allowed',
                  opacity: reachable ? 1 : 0.45,
                }}
                title={reachable ? h.url : 'Not mapped for Discord. Open the web hub to use it.'}
              >
                <span className="block text-sm" style={{ color: 'var(--text-color)' }}>{h.name}</span>
                <span className="block text-[0.65rem] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                  {h.url}{!reachable && ' · web only'}
                </span>
              </button>
              {h.custom && (
                <button onClick={() => onRemove(h.id)} aria-label={`Remove ${h.name}`} className="text-xs px-1.5" style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="space-y-1.5 pt-1">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="w-full rounded px-2 py-1 text-xs" style={inputStyle} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hub.example.com" className="w-full rounded px-2 py-1 text-xs font-mono" style={inputStyle} />
          {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
          <div className="flex gap-2">
            <button onClick={submit} className="flex-1 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer' }}>Add</button>
            <button onClick={() => { setAdding(false); setError(null); }} className="flex-1 py-1.5 rounded-lg text-xs" style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {inDiscord && (
        <p className="text-[0.65rem]" style={{ color: 'var(--text-muted)' }}>
          Inside Discord, only hubs mapped for this Activity can be reached. Other hubs work from the web hub.
        </p>
      )}
    </section>
  );
}

const inputStyle = {
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid var(--border-color)',
  color: 'var(--text-color)',
  outline: 'none',
} as const;

function GameCard({ game, playable, onPlay }: { game: GameInfo; playable: boolean; onPlay: () => void }) {
  const status = STATUS_LABEL[game.status];
  const dim = game.status === 'paused';
  return (
    <div className="glow-card p-3 flex gap-3 items-start" style={{ opacity: dim ? 0.6 : 1 }}>
      <span style={{ fontSize: 28, lineHeight: 1 }}>{game.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-color)' }}>{game.name}</span>
          <span className="text-[0.6rem] px-1.5 py-0.5 rounded" style={{ color: status.color, border: `1px solid ${status.color}` }}>
            {status.text}
          </span>
        </div>
        <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>{game.blurb}</p>
      </div>
      {game.inClient && (
        <button
          onClick={onPlay}
          disabled={!playable}
          className="self-center px-3 py-1.5 rounded-lg text-xs font-bold"
          style={{
            background: playable ? 'linear-gradient(135deg, #00d9ff, #ff6600)' : 'rgba(60,60,60,0.6)',
            color: '#fff',
            border: 'none',
            cursor: playable ? 'pointer' : 'not-allowed',
            opacity: playable ? 1 : 0.5,
          }}
        >
          Play
        </button>
      )}
    </div>
  );
}

function ClientFrame({ src, hub, onBack }: { src: string; hub: HubInfo; onBack: () => void }) {
  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 'calc(100dvh - 96px)' }}>
      <div className="flex items-center gap-2 pb-2">
        <button onClick={onBack} className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border-color)', color: 'var(--text-color)', cursor: 'pointer' }}>
          ← Hub
        </button>
        <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {hub.name} · <span className="font-mono">{hub.url}</span>
        </span>
      </div>
      <iframe
        title="Chia gaming client"
        src={src}
        className="flex-1 w-full rounded-lg"
        style={{ border: '1px solid rgba(0,217,255,0.25)', background: 'var(--bg-deep)', minHeight: 480 }}
        allow="clipboard-write"
      />
    </div>
  );
}
