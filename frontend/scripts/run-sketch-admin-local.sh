#!/bin/zsh
set -eu

ROOT="/Users/bytedance/ui"
ENV_FILE="$HOME/.config/michel-writer/local.env"
NODE="/Users/bytedance/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

if [[ ! -r "$ENV_FILE" ]]; then
  print -u2 "Missing $ENV_FILE"
  exit 78
fi

set -a
source "$ENV_FILE"
set +a

export ADMIN_PORT="${ADMIN_PORT:-8787}"
cd "$ROOT"
exec "$NODE" admin-server.mjs
