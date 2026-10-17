#!/usr/bin/env bash
# Backup/restore smoke test (M12, milestones/M12-hardening/04-backup-restore):
# proves that the procedure in docs/operations/backup.md really brings an
# instance back, instead of trusting that it does.
#
#   1. start PostgreSQL and DavNode, bootstrap a tenant, and put one object
#      into EACH of the three domains: a file, a contact, an event;
#   2. back the database up with pg_dump, exactly as the runbook says;
#   3. destroy the instance completely (database container and volume);
#   4. restore the dump into a brand-new database with pg_restore and start
#      DavNode against it WITHOUT running migrations (the restore alone has
#      to be enough);
#   5. check that the admin can log in, that the file, the contact and the
#      event come back byte for byte (SHA-256), and that the quota counters
#      are the same as before.
#
# Exits non-zero, saying what differed, if anything does not match.
#
# RESTORE_TEST_STALE=1 deliberately restores a backup taken BEFORE the event
# was written. The script must then fail; the workflow runs it that way too
# and requires the failure, which tests the verification itself.
#
# Needs: docker, node 22, curl, a built workspace (npm run build --workspaces).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="${RESTORE_TEST_DIR:-$root/.restore-test}"
port="${RESTORE_TEST_PORT:-8099}"
db_port="${RESTORE_TEST_DB_PORT:-55433}"
container=davnode-restoretest-pg
volume=davnode-restoretest-pgdata
tenant=restore
admin=admin
password='restore-Test-pw'
base="http://127.0.0.1:$port"
stale="${RESTORE_TEST_STALE:-0}"

rm -rf "$work" && mkdir -p "$work"
server_pid=""

cleanup() {
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "RESTORE TEST FAILED: $*" >&2; exit 1; }

start_database() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  docker run -d --name "$container" -v "$volume":/var/lib/postgresql/data \
    -e POSTGRES_USER=davnode -e POSTGRES_PASSWORD=davnode -e POSTGRES_DB=davnode \
    -p "127.0.0.1:$db_port:5432" postgres:17-alpine >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$container" pg_isready -U davnode -d davnode >/dev/null 2>&1 && return 0
    sleep 1
  done
  fail "PostgreSQL did not become ready"
}

start_server() { # $1 = DAVNODE_RUN_MIGRATIONS
  stop_server
  (
    cd "$root"
    export DAVNODE_DB_TYPE=postgres DAVNODE_DB_HOST=127.0.0.1 DAVNODE_DB_PORT="$db_port" \
      DAVNODE_DB_NAME=davnode DAVNODE_DB_USER=davnode DAVNODE_DB_PASSWORD=davnode \
      DAVNODE_HTTP_PORT="$port" DAVNODE_HTTP_HOST=127.0.0.1 \
      DAVNODE_RUN_MIGRATIONS="$1" DAVNODE_LOG_LEVEL=warn
    exec node packages/server/dist/index.js
  ) >>"$work/server.log" 2>&1 &
  server_pid=$!
  for _ in $(seq 1 60); do
    curl -sf "$base/healthz" >/dev/null 2>&1 && return 0
    sleep 0.5
  done
  cat "$work/server.log" >&2
  fail "DavNode did not become healthy"
}

stop_server() {
  [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null && wait "$server_pid" 2>/dev/null || true
  server_pid=""
}

api() { curl -sS -u "$admin:$password" "$@"; }
sha() { shasum -a 256 | cut -d' ' -f1; }

# ---- 1. a running instance with data in all three domains -------------------
echo "== starting PostgreSQL and DavNode"
start_database
start_server true
(
  cd "$root"
  DAVNODE_DB_TYPE=postgres DAVNODE_DB_HOST=127.0.0.1 DAVNODE_DB_PORT="$db_port" \
    DAVNODE_DB_NAME=davnode DAVNODE_DB_USER=davnode DAVNODE_DB_PASSWORD=davnode \
    node packages/core/dist/cli/bootstrap.js --tenant-slug="$tenant" --tenant-name=Restore \
    --username="$admin" --email=admin@example.com --password="$password"
) >"$work/bootstrap.log"

principal=$(api "$base/admin/$tenant/users" | node -pe 'JSON.parse(require("fs").readFileSync(0)).users[0].principalId')
[ -n "$principal" ] || fail "could not read the admin's principal id"

printf 'Hello from the file domain, with an umlaut: \xc3\xbc\n' >"$work/file.txt"
printf 'BEGIN:VCARD\r\nVERSION:3.0\r\nUID:restore-contact\r\nFN:Zoe M\xc3\xbcller\r\nN:M\xc3\xbcller;Zoe;;;\r\nEND:VCARD\r\n' >"$work/contact.vcf"
printf 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//DavNode//restore-test//EN\r\nBEGIN:VEVENT\r\nUID:restore-event\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20270101T100000Z\r\nSUMMARY:Restore me\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' >"$work/event.ics"

mkcol_body='<?xml version="1.0"?><D:mkcol xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:carddav"><D:set><D:prop><D:resourcetype><D:collection/><C:addressbook/></D:resourcetype></D:prop></D:set></D:mkcol>'
file_url="$base/dav/$tenant/files/file.txt"
contact_url="$base/dav/$tenant/addressbooks/$principal/book/contact.vcf"
event_url="$base/dav/$tenant/calendars/$principal/work/event.ics"

put() { # url file content-type
  code=$(api -o /dev/null -w '%{http_code}' -X PUT -H "Content-Type: $3" --data-binary "@$2" "$1")
  [ "$code" = 201 ] || fail "PUT $1 answered $code"
}
echo "== seeding a file, a contact and an event"
put "$file_url" "$work/file.txt" text/plain
code=$(api -o /dev/null -w '%{http_code}' -X MKCOL -H 'Content-Type: application/xml' --data "$mkcol_body" "$base/dav/$tenant/addressbooks/$principal/book")
[ "$code" = 201 ] || fail "MKCOL addressbook answered $code"
put "$contact_url" "$work/contact.vcf" text/vcard
code=$(api -o /dev/null -w '%{http_code}' -X MKCALENDAR "$base/dav/$tenant/calendars/$principal/work")
[ "$code" = 201 ] || fail "MKCALENDAR answered $code"

backup() {
  docker exec "$container" pg_dump -U davnode -Fc davnode >"$work/backup.dump"
  [ -s "$work/backup.dump" ] || fail "pg_dump produced an empty file"
}
if [ "$stale" = 1 ]; then
  echo "== (stale-backup mode) backing up BEFORE the event exists"
  backup
  put "$event_url" "$work/event.ics" text/calendar
else
  put "$event_url" "$work/event.ics" text/calendar
fi

# What must survive: checksums of the three objects, and the quota counters.
before_quota=$(api "$base/admin/$tenant/quota" | node -pe 'const q=JSON.parse(require("fs").readFileSync(0));JSON.stringify([q.tenant.quotaUsedBytes,q.users.map(u=>[u.username,u.quotaUsedBytes])])')
sha_file=$(api "$file_url" | sha)
sha_contact=$(api "$contact_url" | sha)
sha_event=$(api "$event_url" | sha)
[ "$sha_file" = "$(sha <"$work/file.txt")" ] || fail "the file does not read back unchanged before the backup"

# ---- 2. backup ---------------------------------------------------------------
if [ "$stale" != 1 ]; then
  echo "== backing up"
  backup
fi

# ---- 3. destroy ----------------------------------------------------------------
echo "== destroying the instance"
stop_server
docker rm -f "$container" >/dev/null
docker volume rm "$volume" >/dev/null
docker ps -a --format '{{.Names}}' | grep -qx "$container" && fail "the old database container still exists"

# ---- 4. restore into a brand-new database --------------------------------------
echo "== restoring into a fresh database"
start_database
docker exec -i "$container" pg_restore -U davnode -d davnode --no-owner --exit-on-error <"$work/backup.dump" \
  || fail "pg_restore reported errors"
# The restore alone must be enough: no migrations are run.
start_server false

# ---- 5. verify -----------------------------------------------------------------------
echo "== verifying"
problems=0
check() { # description expected actual
  if [ "$2" = "$3" ]; then echo "  ok: $1"; else echo "  MISMATCH: $1 (expected $2, got $3)" >&2; problems=$((problems + 1)); fi
}
code=$(api -o /dev/null -w '%{http_code}' "$base/admin/$tenant/users")
check "the admin can log in" 200 "$code"
check "the file is back, byte for byte" "$sha_file" "$(api "$file_url" | sha)"
check "the contact is back, byte for byte" "$sha_contact" "$(api "$contact_url" | sha)"
check "the event is back, byte for byte" "$sha_event" "$(api "$event_url" | sha)"
after_quota=$(api "$base/admin/$tenant/quota" | node -pe 'const q=JSON.parse(require("fs").readFileSync(0));JSON.stringify([q.tenant.quotaUsedBytes,q.users.map(u=>[u.username,u.quotaUsedBytes])])')
check "the quota counters are unchanged" "$before_quota" "$after_quota"

if [ "$problems" -ne 0 ]; then
  fail "$problems check(s) did not match after the restore"
fi
echo "== restore test passed"
