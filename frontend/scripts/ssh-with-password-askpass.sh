#!/usr/bin/env bash
set -euo pipefail

: "${SSHPASS:?SSHPASS must be set for password authentication}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export SSH_ASKPASS="$SCRIPT_DIR/ssh-password-askpass.sh"
export SSH_ASKPASS_REQUIRE=force
export DISPLAY="${DISPLAY:-codex-deploy}"

exec ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password "$@"
