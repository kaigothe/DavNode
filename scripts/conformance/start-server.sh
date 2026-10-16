#!/usr/bin/env bash
# Starts a throw-away DavNode server for the conformance suites (M11,
# milestones/M11-client-compatibility/06-conformance-suite-ci): a fresh
# SQLite database, one tenant with a server_admin (who owns the WebDAV
# root collection), the server in the background.
#
# Usage: scripts/conformance/start-server.sh [workdir]
# Needs a built workspace (npm run build --workspaces). Writes the server
# pid to <workdir>/server.pid and its log to <workdir>/server.log; stop it
# with scripts/conformance/stop-server.sh.
#
# Environment (all optional):
#   CONFORMANCE_PORT      port to listen on        (default 8080)
#   CONFORMANCE_TENANT    tenant slug              (default ci)
#   CONFORMANCE_USER      admin username           (default ci)
#   CONFORMANCE_PASSWORD  admin password           (default ci-password)
#   DAVNODE_AUTH_PROVIDERS  passed through to the server
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workdir="${1:-$root/.conformance}"
port="${CONFORMANCE_PORT:-8080}"
tenant="${CONFORMANCE_TENANT:-ci}"
user="${CONFORMANCE_USER:-ci}"
password="${CONFORMANCE_PASSWORD:-ci-password}"

mkdir -p "$workdir"
rm -f "$workdir/davnode.sqlite" "$workdir/server.pid"

export DAVNODE_DB_TYPE=better-sqlite3
export DAVNODE_DB_FILE="$workdir/davnode.sqlite"
export DAVNODE_HTTP_PORT="$port"
export DAVNODE_HTTP_HOST=0.0.0.0

cd "$root"
npm run migration:run --workspace=@davnode/core >"$workdir/migrate.log" 2>&1
node packages/core/dist/cli/bootstrap.js \
  --tenant-slug="$tenant" --tenant-name="Conformance" \
  --username="$user" --email="$user@example.com" --password="$password" \
  >"$workdir/bootstrap.log"

nohup node packages/server/dist/index.js >"$workdir/server.log" 2>&1 &
echo $! >"$workdir/server.pid"

for _ in $(seq 1 60); do
  if curl -s -o /dev/null -u "$user:$password" "http://127.0.0.1:$port/dav/$tenant/files/"; then
    echo "DavNode is up on port $port (tenant $tenant, user $user)."
    exit 0
  fi
  sleep 0.5
done
echo "DavNode did not come up; server log:" >&2
cat "$workdir/server.log" >&2
exit 1
