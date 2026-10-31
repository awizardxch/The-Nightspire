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
| **The Nightspire** | this app: game catalog, hub picker, embeds the client | Vercel at `play.awizard.dev` (web) + Discord Activity |
| **chia-gaming client** | upstream `front-end`, built at the pinned commit | the same Vercel project, at **`play.awizard.dev/games`** |
| **BOW hub** | upstream `hub/hub-service`: lobby page at `/`, `/ws/hub` matchmaking, `/ws/game` relay | a VPS, e.g. `https://hub.awizard.dev` |

Everything is under `play.awizard.dev` except the hub. The hub runs on two
long-lived WebSockets, which Vercel can neither host nor proxy, so it needs its
own server and address.
| Other hubs | any server running upstream `hub-service` at the same revision | anywhere |

Hosting or joining a game happens in the client, on the hub it's pointed at.
A player is on one hub at a time. Channels don't belong to a hub, so moving
between hubs never touches funds.

## Configuration (`.env.local` / Vercel env)

```env
# Built-in hubs: name|origin|discord-path, comma separated; first is the default.
VITE_GAME_HUBS=BOW Hub|https://hub.awizard.dev|/hub/bow
# Where the client build is served on the web.
VITE_GAME_CLIENT_URL=https://play.awizard.dev/games
# Path of the client inside Discord. /games sits under the Activity's own "/"
# mapping, so it needs no mapping of its own.
VITE_GAME_CLIENT_DISCORD_PATH=/games
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
`deploy_player_app/*.tgz` (the client) and `deploy_hub/*.tgz` (hub frontend +
service for the BOW hub).

### How the client gets to `/games` (automated)

1. **Tag.** `scripts/game-client-tag.mjs` names the release
   `game-client-<hash>`, hashed from `game-client/build.sh` (which pins the
   chia-gaming commit) and `game-client/patches/`. Same inputs, same tag, so
   CI and Vercel agree without a version number committed anywhere.
2. **Build and publish** (`.github/workflows/game-client.yml`). On a push to
   `main` that changes those inputs, CI builds the client and hub (~30
   minutes), verifies the archives, and publishes the GitHub release with
   `player-app.tgz`, `hub.tgz` and `SHA256SUMS.txt`. If the release already
   exists, it skips the build. Pull requests build but never publish.
3. **Fetch** (`scripts/fetch-game-client.mjs`, run as npm `prebuild`). Every
   Vercel build downloads that release, checks the SHA-256, and unpacks it
   into `public/games/` (gitignored). Vite copies it into the deploy, so the
   client is served at `/games`. A checksum mismatch always fails the build.
4. **Redeploy.** Vercel finishes in about a minute, long before CI, so the
   first deploy after a client change has no `/games` (the build log says
   so). The workflow's last step calls a Vercel deploy hook so the site
   redeploys once the release exists.

**One-time setup:** in Vercel, Project → Settings → Git → Deploy Hooks,
create a hook for `main`. Add its URL to the GitHub repository secrets as
`VERCEL_DEPLOY_HOOK_URL`. Without it, the workflow warns and you redeploy by
hand.

Knobs for `fetch-game-client.mjs`: `GAME_CLIENT_SKIP=1` (don't fetch),
`GAME_CLIENT_REQUIRED=1` (fail instead of building without `/games`),
`GAME_CLIENT_BASE_URL` (fetch from a mirror or a local test server).

The patch made the client's assets page-relative, so it runs under `/games/`
as it would at a root. `vercel.json` allows `'self'` in `frame-ancestors`, so
the Games tab can embed it on the web as well as in Discord.

`npm run dev` can't show it: the Vite dev server answers `/games/` with the
app's own `index.html`. Check it with `npm run build` and a static server
over `dist/`, which is how Vercel serves it.

## The client patches (`game-client/patches/`)

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
3. **Embedding under a path (`0002`).** Upstream's player refuses to start
   in any frame (`window.top !== window` → "This is a player URL, not a hub
   URL"), which also stops a site from embedding a player it hosts. With
   the patch, a framed player runs only if its parent is a same-origin page
   that isn't itself a player. That covers The Nightspire at `/` embedding
   `/games/`, on the web and inside Discord.
   - **Other sites can't pass the check:** reading `window.parent.location`
     throws cross-origin, and `vercel.json`'s `frame-ancestors` (`'self'` plus
     Discord) stops them framing `/games` at all.
   - **A player URL entered as a hub is still refused**, because it loads
     under the player's own directory.
   - **A player at a site root is unchanged:** every same-origin path
     starts with `/`.

   Checked with the real build: Play starts the client in the Games tab with
   the hub prefilled, Connect loads the real hub's lobby inside it, and a
   nested player and a cross-origin frame are both refused.

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
| `/` | `play.awizard.dev` (The Nightspire, and the client at `/games`) |
| `/hub/bow` | `hub.awizard.dev` (HTTP and WebSocket) |
| `/walletconnect` | `relay.walletconnect.org` (already in use) |

Add one `/hub/<name>` mapping per partner hub that should be playable from
Discord, plus a matching entry in `VITE_GAME_HUBS`.

## What the Discord build wagers

Discord's policy bans wagering anything of real-world value, including
virtual currency with a market value. The Discord build therefore uses a
dedicated no-value game CAT; LOVE stands in during development. The token
must not be buyable, sellable or redeemable: no DEX pools and no swaps.
