#!/usr/bin/env bash
set -euo pipefail

: "${SSHPASS:?SSHPASS must be set for password authentication}"
printf '%s\n' "$SSHPASS"
