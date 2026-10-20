#!/usr/bin/env bash
# Upgrade test (M13, milestones/M13-open-source-launch/06-documentation-site/
# 02-upgrade-guide): proves that data written by the previous release survives
# the schema migrations of the current code.
#
#   1. build the previous release (git tag) in a temporary worktree;
#   2. start it on a fresh SQLite file, bootstrap a tenant, seed users, a
#      group, a calendar event, a contact and a file (scripts/demo/seed.mjs);
#   3. stop it, start the CURRENT build on the same file (migrations run on
#      start) and check that the users, the file, the event and the contact
#      are all still there, byte for byte (SHA-256).
#
# Usage: scripts/upgrade-test/run.sh [previous-git-ref]   (default: newest tag)
# Needs: git, node 22, curl, and a built current workspace
# (npm run build --workspaces).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="${UPGRADE_TEST_DIR:-$root/.upgrade-test}"
port="${UPGRADE_TEST_PORT:-8097}"
ref="${1:-$(git -C "$root" describe --tags --abbrev=0)}"
base="http://127.0.0.1:$port"
tenant=demo
admin=admin
password='upgrade-Test-pw1'
db="$work/upgrade.sqlite"
server_pid=""

rm -rf "$work" && mkdir -p "$work"
cleanup() {
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true
  git -C "$root" worktree remove --force "$work/old" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "UPGRADE TEST FAILED: $*" >&2; exit 1; }

start_server() { # $1 = directory holding a built workspace
  # A leftover server on the port would answer the health check below.
  ! curl -fsS "$base/healthz" >/dev/null 2>&1 || fail "port $port is already in use"
  (cd "$1" && exec env DAVNODE_DB_TYPE=better-sqlite3 DAVNODE_DB_FILE="$db" \
    DAVNODE_HTTP_PORT="$port" DAVNODE_HTTP_HOST=127.0.0.1 \
    DAVNODE_DEFAULT_TENANT="$tenant" DAVNODE_AUTH_RATE_LIMIT_MAX=0 \
    node packages/server/dist/index.js) >>"$work/server.log" 2>&1 &
  server_pid=$!
  for _ in $(seq 1 60); do
    curl -fsS "$base/healthz" >/dev/null 2>&1 && return 0
    sleep 1
  done
  cat "$work/server.log" >&2
  fail "server from $1 did not become healthy"
}
stop_server() { kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; server_pid=""; }

echo "== building previous release $ref"
git -C "$root" worktree add --detach "$work/old" "$ref" >/dev/null
(cd "$work/old" && npm ci --no-audit --no-fund >/dev/null && npm run build --workspaces >/dev/null)

echo "== starting $ref, seeding data"
start_server "$work/old"
(cd "$work/old" && DAVNODE_DB_TYPE=better-sqlite3 DAVNODE_DB_FILE="$db" \
  node packages/core/dist/cli/bootstrap.js --tenant-slug="$tenant" --tenant-name=Demo \
  --username="$admin" --email=admin@example.com --password="$password" >/dev/null)
node "$root/scripts/demo/seed.mjs" "$base" "$tenant" "$admin" "$password" >/dev/null

principal="$(curl -fsS -u "$admin:$password" "$base/admin/$tenant/users" |
  node -e 'const u=JSON.parse(require("fs").readFileSync(0,"utf8")).users.find((x)=>x.username==="alice");console.log(u.principalId)')"
# <credentials> <object>: alice's calendar and contacts are not readable by
# the administrator, so each object is read by its owner.
objects=(
  "$admin:$password files/welcome.txt"
  "alice:demo-password-1 calendars/$principal/work/kickoff.ics"
  "alice:demo-password-1 addressbooks/$principal/contacts/bob.vcf"
)
fetch() { # <credentials> <url>; any HTTP error fails the whole test
  curl -fsS -u "$1" "$2" || fail "GET $2 failed"
}
fingerprint() { # prints "<object> <sha256>" for every seeded object
  local entry body
  for entry in "${objects[@]}"; do
    body="$(fetch "${entry%% *}" "$base/dav/$tenant/${entry#* }")" || exit 1
    printf '%s %s\n' "${entry#* }" "$(printf '%s' "$body" | shasum -a 256 | cut -d' ' -f1)"
  done
  body="$(fetch "$admin:$password" "$base/admin/$tenant/users")" || exit 1
  printf '%s' "$body" |
    node -e 'for (const u of JSON.parse(require("fs").readFileSync(0,"utf8")).users) console.log("user", u.username, u.email, u.role)' | sort
}
fingerprint >"$work/before.txt" || fail "cannot read the seeded data"
stop_server

echo "== starting the current build on the same database"
start_server "$root"
fingerprint >"$work/after.txt" || fail "cannot read the data after the upgrade"
stop_server

[ "$(wc -l <"$work/before.txt")" -ge 6 ] || fail "expected at least 6 checked items"
if ! diff -u "$work/before.txt" "$work/after.txt"; then
  fail "data differs after upgrading from $ref"
fi
grep -q "Applied" "$work/server.log" || echo "(no pending migrations between $ref and HEAD)"
echo "UPGRADE TEST PASSED: $(wc -l <"$work/before.txt") checked items survived the upgrade from $ref"
