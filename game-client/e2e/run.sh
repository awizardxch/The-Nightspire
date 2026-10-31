#!/usr/bin/env bash
# End-to-end check that a hub works behind a path prefix (as with a Discord
# URL mapping) and still works at its root. Needs Node 22 and Playwright.
#
# Lobby: the real hub-frontend in Chromium, embedded by a stand-in parent page.
# Relay: the client's real HubConnection (patched), run in Node.
# Proxy: maps /hub/bow/* to the hub with the prefix stripped, HTTP and WS.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/../.build/chia-gaming"

"$HERE/../build.sh" prepare
(cd "$SRC" && pnpm install --frozen-lockfile >/dev/null)
(cd "$SRC/hub/hub-service" && pnpm run build >/dev/null)
(cd "$SRC/hub/hub-frontend" && pnpm run build:deploy >/dev/null)

rm -rf "$HERE/stage" && mkdir -p "$HERE/stage/app/n1"
cp -r "$SRC/hub/hub-frontend/dist/app/." "$HERE/stage/app/n1/"
cp "$SRC/hub/hub-frontend/public/index.html" "$HERE/stage/index.html"
echo '{"basePath":"app/n1/"}' > "$HERE/stage/build-meta.json"
node "$SRC/tools/verify-stage.mjs" "$HERE/stage"
cp "$SRC/hub/hub-service/dist/index-rollup.cjs" "$HERE/service.cjs"
(cd "$SRC/front-end" && pnpm exec esbuild "$HERE/relay-driver.ts" --bundle --platform=node \
  --format=cjs --outfile="$HERE/relay-driver.cjs" --alias:@=./src --log-level=warning)

cd "$HERE"
PORT=5801 node -r ./ipv4shim.cjs service.cjs --self http://localhost:5801 --dir stage > hub.log 2>&1 &
HUB_PID=$!
node proxy.cjs > proxy.log 2>&1 &
PROXY_PID=$!
trap 'kill $HUB_PID $PROXY_PID 2>/dev/null || true' EXIT
sleep 2

node e2e.cjs
if grep -q UNMAPPED proxy.log; then
  echo "FAIL: the lobby made requests outside the /hub/bow mapping:" >&2
  grep UNMAPPED proxy.log >&2
  exit 1
fi
echo "e2e: ok"
