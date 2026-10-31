# Nightspire hub — deployment

The hub is upstream chia-gaming's `hub-service`: the lobby page plus two
WebSockets, `/ws/hub` (matchmaking) and `/ws/game` (relay between players). It
never holds keys or funds; it matches players and passes their messages.

The image takes `hub.tgz` from the **same GitHub release the site uses for
`/games`** (`scripts/game-client-tag.mjs`), so the hub and the client always
run the same chia-gaming build. If they differed, channels couldn't open.

Vercel can't host it, because it needs long-lived WebSockets. Railway can.

## Railway (recommended)

1. **New service.** In your Railway project: New → GitHub Repo →
   `awizardxch/The-Nightspire`.
2. **Settings → Source.**
   - Root directory: leave empty (the repository root, which the Dockerfile
     needs as its build context).
   - Config-as-code file: `hub/railway.json`. That selects `hub/Dockerfile`,
     rebuilds only when the hub or the client build inputs change, and health
     checks `/build-meta.json`.
3. **Variables.** Add `HUB_PUBLIC_URL=https://hub.awizard.dev`.
   - Railway sets `PORT` itself.
   - `HUB_TRUST_PROXY=true` is already set in the image. **Don't turn it off
     behind Railway:** the hub allows 8 connections per client IP, and without
     it every player shares Railway's IP.
4. **Settings → Networking → Custom domain:** `hub.awizard.dev`. Add the CNAME
   record Railway shows at your DNS provider. Railway issues the TLS
   certificate.
5. **Deploy.** Open `https://hub.awizard.dev`, which should show the lobby page,
   and `https://hub.awizard.dev/RELEASE`, which should show the release tag.

## When the client build changes

A change to `game-client/` triggers two things at once:
- **The `game-client` workflow** builds and publishes a new release (~18 min).
- **Railway** rebuilds the hub straight away, before that release exists.

That early hub build fails at the fetch with a 404 naming the release. **The
old hub keeps running**: Railway only swaps in a deployment that built. Once the
release is published, press Redeploy on the hub service in Railway.

## Any other Docker host

```bash
docker build -f hub/Dockerfile -t nightspire-hub .
docker run -d --restart unless-stopped -p 5801:5801 \
  -e HUB_PUBLIC_URL=https://hub.awizard.dev nightspire-hub
```

Put TLS in front of it, with a proxy that forwards WebSockets and sets
`X-Forwarded-For`. For example, a Caddyfile:

```
hub.awizard.dev {
  reverse_proxy localhost:5801
}
```

The hub listens on `::` (upstream's choice), so the host needs IPv6 enabled in
the kernel. It doesn't need an IPv6 address. Railway and typical VPSes have it.

## Wiring it up

- **Vercel** (The Nightspire):
  `VITE_GAME_HUBS=Nightspire Hub|https://hub.awizard.dev|/hub/nightspire`.
  Redeploy after changing it.
- **Discord Developer Portal → Activities → URL Mappings:**
  `/hub/nightspire` → `hub.awizard.dev`.

## What was tested

- `hub/fetch-hub.mjs` against the published release `game-client-842fa3afdcab`:
  the SHA-256 checks out and the files unpack.
- **The image built from those exact files** (mirrored locally, since the
  sandbox's build container couldn't reach GitHub directly):
  - It serves the lobby, `build-meta.json` and `RELEASE`.
  - `service.js` is not web-served.
  - It runs as the unprivileged `node` user.
  - Two clients registered on `/ws/game` using the player app's own
    `HubConnection`.
- **Not tested:** Railway itself, the custom domain, and Discord's mapping to
  the hub.
