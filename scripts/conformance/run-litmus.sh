#!/usr/bin/env bash
# Runs litmus against a server started with start-server.sh and evaluates the
# result against litmus-expected-failures.txt.
#
# Usage: scripts/conformance/run-litmus.sh [workdir]
# Needs the `litmus` binary (Debian/Ubuntu package "litmus"). The raw output
# is kept in <workdir>/litmus.log.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workdir="${1:-$root/.conformance}"
port="${CONFORMANCE_PORT:-8080}"
tenant="${CONFORMANCE_TENANT:-ci}"
user="${CONFORMANCE_USER:-ci}"
password="${CONFORMANCE_PASSWORD:-ci-password}"
url="${LITMUS_URL:-http://127.0.0.1:$port/dav/$tenant/files/}"

mkdir -p "$workdir"
# -k: keep going after a failing suite, so one failure does not hide the rest.
# litmus exits 0 whatever happens, so the verdict comes from the evaluation.
(cd "$workdir" && litmus -k "$url" "$user" "$password") >"$workdir/litmus.log" 2>&1 || true
grep -E '^<- summary' "$workdir/litmus.log" || true
node "$root/scripts/conformance/evaluate-litmus.mjs" \
  "$workdir/litmus.log" "$root/scripts/conformance/litmus-expected-failures.txt"
