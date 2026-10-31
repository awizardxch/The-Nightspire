// ─────────────────────────────────────────────────────────────────
//  gameHub — the game catalog, the hub directory, and where the
//  chia-gaming client is loaded from.
//
//  Play runs in the upstream chia-gaming client (github.com/Chia-Network/
//  chia-gaming, Apache-2.0), embedded in the Hub tab. That client owns the
//  wallet, the channel engine, the hub lobby and the peer relay; this module
//  only decides which client build and which hub the player is pointed at.
//
//  A hub is one server running upstream `hub-service`: a lobby page at its
//  root plus /ws/hub (matchmaking) and /ws/game (peer relay). Channels are
//  hub-independent, so a player can host or join on any compatible hub.
// ─────────────────────────────────────────────────────────────────

/** The chia-gaming revision our client build and our hub run. Both peers
 *  must agree, or the referee hashes differ and no channel can open. */
export const CHIA_GAMING_COMMIT = '76f0fb8c646e7030c43d2f0a89dd4743445c173b';

export type GameStatus = 'live' | 'free_play';

export interface GameInfo {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  status: GameStatus;
  /** 'client': the embedded chia-gaming client; 'local': runs in The Nightspire */
  runs: 'client' | 'local';
}

// The three production games mirror upstream games/registry.json at
// CHIA_GAMING_COMMIT. Descriptions follow the upstream README.
export const GAMES: GameInfo[] = [
  { id: 'calpoker',   icon: '🃏', name: 'California Poker', blurb: 'Commit-reveal poker. Pick cards, swap, and settle the pot in a two-player state channel.', status: 'live', runs: 'client' },
  { id: 'spacepoker', icon: '🚀', name: 'Space Poker',      blurb: "Texas Hold'em-style poker over a two-player state channel.",                               status: 'live', runs: 'client' },
  { id: 'krunk',      icon: '🔤', name: 'Krunk',            blurb: 'Wordle-style paired word games, head to head.',                                             status: 'live', runs: 'client' },
  { id: 'loveslots',  icon: '❤️‍🔥', name: 'Love Slots',     blurb: '20-line slots with Heart Lock, Moonlit Free Spins, Potion Pick and the Love Draw jackpots. Free credits, no wallet.', status: 'free_play', runs: 'local' },
];

export interface HubInfo {
  id: string;
  name: string;
  /** public origin of the hub, e.g. https://hub.awizard.dev */
  url: string;
  /** Discord URL-mapping prefix that proxies this hub, e.g. /hub/nightspire.
   *  Without one, the hub can't be reached from inside Discord. */
  discordPath?: string;
  custom?: boolean;
}

/**
 * VITE_GAME_HUBS lists the built-in hubs, one per entry, separated by commas:
 *   name|https://origin|/discord-path
 * The Discord path is optional. The first entry is the default hub.
 */
export function parseHubList(raw: string | undefined): HubInfo[] {
  if (!raw) return [];
  const hubs: HubInfo[] = [];
  for (const entry of raw.split(',')) {
    const [name, url, discordPath] = entry.split('|').map((s) => s.trim());
    const origin = normalizeHubUrl(url ?? '');
    if (!name || !origin) {
      console.warn('[aWizard] VITE_GAME_HUBS: skipping invalid entry', entry);
      continue;
    }
    hubs.push({
      id: origin,
      name,
      url: origin,
      discordPath: discordPath && discordPath.startsWith('/') ? discordPath.replace(/\/+$/, '') : undefined,
    });
  }
  return hubs;
}

/** An https origin (or http on localhost), or null. Paths are dropped:
 *  the stock client treats a hub as an origin. */
export function normalizeHubUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export const BUILT_IN_HUBS: HubInfo[] = parseHubList(import.meta.env.VITE_GAME_HUBS as string | undefined);

/** Where the chia-gaming client build is served on the web. */
const CLIENT_URL = (import.meta.env.VITE_GAME_CLIENT_URL as string | undefined)?.replace(/\/+$/, '') || '';
/** Discord URL-mapping prefix that serves the same client build. */
const CLIENT_DISCORD_PATH = (import.meta.env.VITE_GAME_CLIENT_DISCORD_PATH as string | undefined)?.replace(/\/+$/, '') || '';

export function isInDiscordFrame(): boolean {
  if (window === window.parent) return false;
  return window.location.hostname.endsWith('.discordsays.com');
}

export function hubReachable(hub: HubInfo, inDiscord: boolean): boolean {
  return !inDiscord || !!hub.discordPath;
}

/**
 * The iframe src for the game client, pointed at `hub`, or null when it
 * can't be loaded here (no client configured, or the hub has no Discord
 * mapping while we're inside Discord).
 *
 * The hub goes in `?hub=`. Our client build (game-client/) prefills its hub
 * picker with it; the player confirms. Inside Discord the hub URL carries the
 * mapping path, which the patched client resolves its lobby and sockets under.
 */
export function gameClientSrc(hub: HubInfo, inDiscord: boolean): string | null {
  if (inDiscord) {
    if (!CLIENT_DISCORD_PATH || !hub.discordPath) return null;
    const origin = window.location.origin;
    return `${origin}${CLIENT_DISCORD_PATH}/?hub=${encodeURIComponent(origin + hub.discordPath)}`;
  }
  if (!CLIENT_URL) return null;
  return `${CLIENT_URL}/?hub=${encodeURIComponent(hub.url)}`;
}

export const gameClientConfigured = (inDiscord: boolean): boolean =>
  inDiscord ? !!CLIENT_DISCORD_PATH : !!CLIENT_URL;
