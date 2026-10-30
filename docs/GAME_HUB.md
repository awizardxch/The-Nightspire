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

## Building the client and hub

We don't run the stock client: `game-client/` carries one patch against the
pinned commit, and `game-client/build.sh` applies it and runs upstream's
deploy build (WASM, player app, hub):

```bash
cd game-client
./build.sh            # clone at 76f0fb8c, apply patches/, run tools/build-deploy.sh
```

It refuses to build if its commit differs from `CHIA_GAMING_COMMIT` in
`src/lib/gameHub.ts`. Outputs land in `game-client/.build/chia-gaming/`:
`deploy_player_app/*.tgz` (static files for `VITE_GAME_CLIENT_URL`) and
`deploy_hub/*.tgz` (hub frontend + service for the BOW hub). The client host
must not send `X-Frame-Options` or a `frame-ancestors` that excludes The
Nightspire.

## The client patch (`game-client/patches/0001-…`)

1. **Hubs under a path.** The stock client treats a hub as a bare origin
   (lobby at `/`, `/ws/hub` and `/ws/game` at the root), which can't work
   behind a Discord URL mapping. With the patch, a hub URL may carry a path,
   e.g. `https://<app>.discordsays.com/hub/bow`, and the lobby page and both
   sockets resolve under it. Root hubs behave exactly as before: same
   canonical URL, same session credential (pinned by a test). Two hubs on one
   origin get different sessions. `build-meta.json` and `basePath` became
   page-relative, so one hub deploy serves both `hub.awizard.dev/` and the
   Discord mapping.
2. **`?hub=` prefills the hub picker.** The Nightspire passes the chosen hub
   as `?hub=<url>`. The client fills it into its hub picker, and the player
   presses Connect next to upstream's hub warning. A link never connects a
   player on its own, because the hub renders its own UI inside the client.
   If the player is already connected to a saved hub, the client reconnects
   to that one; `?hub=` is used the next time the picker shows.

Checks: front-end jest suite (1,350 tests; only `sha256bytes` fails, as it does
upstream without a WASM build) and `game-client/e2e/run.sh`, which puts the
real lobby and the client's real relay connection behind a proxy that maps
`/hub/bow/*` with the prefix stripped, matches two players, and confirms the
hub delivers `advisory_start` over `/hub/bow/ws/game`. The same run at a hub
root passes too. Not yet tested: a full game in the WASM client, and real
Discord (the proxy only imitates its URL mappings).

The patch is general (any hub behind a reverse proxy benefits), so it's a
candidate for an upstream PR to Chia-Network/chia-gaming.

Still open for Discord: the client's WalletConnect relay needs the same
treatment `index.html` gives The Nightspire (a `/walletconnect` mapping and a
WebSocket rewrite in the client's own page).

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
