# Game Hub — how The Nightspire plays chia-gaming games

> The Games tab is a hub directory wrapped around the upstream
> [chia-gaming](https://github.com/Chia-Network/chia-gaming) client
> (Apache-2.0). The client does the real work: wallet, channel engine, hub
> lobby, peer relay and on-chain settlement. The Nightspire picks the hub and
> embeds the client.
>
> Pinned revision: `76f0fb8c646e7030c43d2f0a89dd4743445c173b`
> (`CHIA_GAMING_COMMIT` in `src/lib/gameHub.ts`). Our hub and our client
> build must both run it, or referee hashes differ and channels can't open.

## Pieces

| Piece | What it is | Where it runs |
| --- | --- | --- |
| **The Nightspire** | this app: game catalog, hub picker, embeds the client | Vercel (web) + Discord Activity |
| **chia-gaming client** | upstream `front-end`, built at the pinned commit | static host; same build for web and Discord |
| **BOW hub** | upstream `hub/hub-service`: lobby page at `/`, `/ws/hub` matchmaking, `/ws/game` relay | a VPS, e.g. `https://hub.awizard.dev` |
| Other hubs | any server running upstream `hub-service` at the same revision | anywhere |

Hosting or joining a game happens in the client, on the hub it's pointed at.
A player is on one hub at a time. Channels don't belong to a hub, so moving
between hubs never touches funds.

## Configuration (`.env.local` / Vercel env)

```env
# Built-in hubs: name|origin|discord-path, comma separated; first is the default.
VITE_GAME_HUBS=BOW Hub|https://hub.awizard.dev|/hub/bow
# Where the client build is served on the web.
VITE_GAME_CLIENT_URL=https://play.awizard.dev
# Discord URL-mapping prefix that serves the same client build.
VITE_GAME_CLIENT_DISCORD_PATH=/play
```

On the web, players can also add any `https://` hub. Inside Discord, only
hubs with a Discord path are selectable; Discord blocks every other origin.

## Running a hub

```bash
git clone https://github.com/Chia-Network/chia-gaming && cd chia-gaming
git checkout 76f0fb8c646e7030c43d2f0a89dd4743445c173b
# follow upstream DEVELOPMENT.md to build hub/hub-service and hub/hub-frontend
node hub/hub-service/dist/index-rollup.cjs --self https://hub.awizard.dev --dir hub/hub-frontend/dist
```

Put it behind TLS. The hub never sees keys and never signs; it only matches
players and relays frames.

## Building the client

Build upstream `front-end` at the pinned commit (`pnpm run bundle`, see
upstream `DEVELOPMENT.md`; it needs the WASM build first) and serve the
output as static files at `VITE_GAME_CLIENT_URL`.

## Two client changes we have to carry (not done yet)

The stock client has one gap and one blocker:

1. **`?hub=` preselect (gap, web and Discord).** The Nightspire passes the
   chosen hub as `?hub=<origin>`. The stock client ignores it and opens on the
   hub the player last used, so for now players pick the hub again inside the
   client. Patch: on boot, if `hub` is a valid origin, call `connectToHub(hub)`.
2. **Hub base paths (blocker for Discord).** The stock client treats a hub as
   a bare origin: it loads the lobby from `new URL('/', origin)` and opens
   `/ws/hub` and `/ws/game` at the root. Inside Discord, a hub is only
   reachable through a path mapping such as
   `https://<app>.discordsays.com/hub/bow/…`, and the root of that origin is
   The Nightspire. Patch: accept a hub base URL with a path, and resolve the
   lobby, `ws/hub` and `ws/game` relative to it. The same change helps anyone
   hosting a hub under a path, so it's a reasonable upstream PR.

Until (2) lands, the Discord build lists the hubs but the embedded client
can't reach them. On the web, the stock client should work embedded, but this
hasn't been tested yet: the Games tab was checked against a stand-in page,
not a real client build. The client host must not send `X-Frame-Options` or a
`frame-ancestors` that excludes The Nightspire.

The client's WalletConnect relay also needs the same treatment inside Discord
that `index.html` gives The Nightspire: a `/walletconnect` mapping and a
WebSocket rewrite in the client's own page. We host the client build, so we
can add that script to its `index.html`.

## Discord Developer Portal URL mappings

| Prefix | Target |
| --- | --- |
| `/` | The Nightspire (Vercel) |
| `/play` | the client build host |
| `/hub/bow` | `hub.awizard.dev` (HTTP and WebSocket) |
| `/walletconnect` | `relay.walletconnect.org` (already in use) |

Add one `/hub/<name>` mapping per partner hub that should be playable from
Discord, plus a matching entry in `VITE_GAME_HUBS`.

## What the Discord build wagers

Discord's policy bans wagering anything of real-world value, including
virtual currency with a market value. The Discord build therefore uses a
dedicated no-value game CAT; LOVE stands in during development. The token
must not be buyable, sellable or redeemable: no DEX pools and no swaps.
