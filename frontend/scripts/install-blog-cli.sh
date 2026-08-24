#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-$(cd "$(dirname "$0")/.." && pwd)/bin/michel-blog.mjs}"
INSTALL_ROOT="${MICHEL_BLOG_CLI_ROOT:-/usr/local/lib/michel-blog}"
BIN_PATH="${MICHEL_BLOG_CLI_BIN:-/usr/local/bin/michel-blog}"

install -d -m 0755 "$INSTALL_ROOT"
install -m 0755 "$SOURCE" "$INSTALL_ROOT/michel-blog.mjs"
ln -sfn "$INSTALL_ROOT/michel-blog.mjs" "$BIN_PATH"

echo "Installed michel-blog at $BIN_PATH"
