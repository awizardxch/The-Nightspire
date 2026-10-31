#!/usr/bin/env bash
# Builds the chia-gaming player app and hub at our pinned commit, with the
# patches in patches/ applied. See docs/GAME_HUB.md.
#
#   ./build.sh            sources + full deploy build (WASM, player app, hub)
#   ./build.sh prepare    sources only (used by e2e/run.sh and for tests)
#
# Outputs of the deploy build (upstream tools/build-deploy.sh):
#   .build/chia-gaming/deploy_player_app/chia-gaming-*.tgz   player app (static)
#   .build/chia-gaming/deploy_hub/chia-gaming-hub-*.tgz      hub frontend + service
set -euo pipefail

COMMIT=76f0fb8c646e7030c43d2f0a89dd4743445c173b
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/.build/chia-gaming"

# The app and the client must agree on the revision, or channels can't open.
if ! grep -q "CHIA_GAMING_COMMIT = '$COMMIT'" "$HERE/../src/lib/gameHub.ts"; then
  echo "build.sh: COMMIT does not match CHIA_GAMING_COMMIT in src/lib/gameHub.ts" >&2
  exit 1
fi

if [ ! -d "$SRC/.git" ]; then
  mkdir -p "$SRC"
  git -C "$SRC" init -q
  git -C "$SRC" remote add origin https://github.com/Chia-Network/chia-gaming
fi
git -C "$SRC" fetch -q --depth 1 origin "$COMMIT"
# Reset tracked files to the pinned commit; build outputs (ignored) are kept.
git -C "$SRC" checkout -q --force FETCH_HEAD
git -C "$SRC" clean -qfd
for patch in "$HERE"/patches/*.patch; do
  echo "applying $(basename "$patch")"
  git -C "$SRC" apply "$patch"
done

case "${1:-deploy}" in
  prepare) ;;
  deploy)
    (cd "$SRC" && pnpm install --frozen-lockfile && ./tools/build-deploy.sh)
    ;;
  *) echo "usage: $0 [prepare|deploy]" >&2; exit 1 ;;
esac
