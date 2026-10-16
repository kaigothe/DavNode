#!/usr/bin/env bash
# Stops the server started by start-server.sh.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workdir="${1:-$root/.conformance}"
if [ -f "$workdir/server.pid" ]; then
  kill "$(cat "$workdir/server.pid")" 2>/dev/null || true
  rm -f "$workdir/server.pid"
fi
