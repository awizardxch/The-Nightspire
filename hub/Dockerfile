# The Nightspire hub: upstream chia-gaming hub-service + lobby page, taken from
# the game-client release that matches this checkout (the same build the site
# serves at /games). Build from the repository root:
#
#   docker build -f hub/Dockerfile -t nightspire-hub .
#   docker run -p 5801:5801 -e HUB_PUBLIC_URL=https://hub.awizard.dev nightspire-hub
#
# See hub/README.md for Railway and VPS deployment.

FROM node:24-bookworm-slim AS fetch
WORKDIR /src
COPY scripts/game-client-tag.mjs scripts/
COPY game-client/build.sh game-client/
COPY game-client/patches/ game-client/patches/
COPY hub/fetch-hub.mjs hub/
# Testing only: fetch from a mirror instead of GitHub releases.
ARG GAME_CLIENT_BASE_URL=
RUN GAME_CLIENT_BASE_URL="$GAME_CLIENT_BASE_URL" node hub/fetch-hub.mjs /hub

FROM node:24-bookworm-slim
# Upstream runs `node service.js --dir .`, which also web-serves the server
# bundle. Here the bundle sits outside the served directory.
COPY --from=fetch /hub /srv/www
RUN mv /srv/www/service.js /srv/service.js
WORKDIR /srv
USER node
# The hub sits behind a proxy (Railway, Caddy, Discord's URL mapping). Without
# trusting X-Forwarded-For, every player shares the proxy's IP and the hub's
# per-IP connection limit (8) shuts everyone out.
ENV NODE_ENV=production \
    HUB_TRUST_PROXY=true \
    PORT=5801
EXPOSE 5801
# HUB_PUBLIC_URL is the hub's public address, passed to --self.
CMD ["sh", "-c", "exec node service.js --self \"${HUB_PUBLIC_URL:?set HUB_PUBLIC_URL to the hub's public URL}\" --dir /srv/www"]
