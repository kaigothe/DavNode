#!/usr/bin/env bash
# Runs Apple's CalDAVTester/CardDAVTester suites and judges the result (M11, milestones/M11-client-compatibility/
# 06-conformance-suite-ci/02-caldavtester-cardavtester-ci-integration.md).
#
# Usage: scripts/conformance/run-caldavtester.sh [workdir]
# Needs a built workspace; it starts (and stops) the server itself, once per
# test file, see below.
#
# CalDAVTester is Python 2 code, so it runs in a container built from
# caldavtester.Dockerfile; docker is therefore required (present on GitHub's
# runners). Two checkouts, pinned to the commits below, are made into
# <workdir>/cdt.
#
# By default only the test files that contain baseline tests
# (caldavtester-baseline.txt) are run, and any baseline test that no longer
# passes fails the script — the CI gate. Set CALDAVTESTER_SURVEY=1 to run
# every CalDAV and CardDAV file instead (slow); the logs then regenerate the
# baseline and docs/conformance.md (see evaluate-caldavtester.mjs).
#
# Environment (optional):
#   CONFORMANCE_PORT, CONFORMANCE_TENANT, CONFORMANCE_USER, CONFORMANCE_PASSWORD
#   CONFORMANCE_HOST         host name the container uses to reach the server
#                            (default localhost; with --network host that is
#                            the runner itself)
#   CONFORMANCE_DOCKER_ARGS  extra `docker run` args (default --network host;
#                            on Docker Desktop use CONFORMANCE_HOST=host.docker.internal
#                            and CONFORMANCE_DOCKER_ARGS="")
set -euo pipefail

CALDAVTESTER_REF=bed21e5924275552c1561febc8203a9f194cf737
PYCALENDAR_REF=a12dd4e1ce8822b022d4abf2cfe6cc93902ff03f

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workdir="${1:-$root/.conformance}"
scripts="$root/scripts/conformance"
export CONFORMANCE_HOST="${CONFORMANCE_HOST:-localhost}"
docker_args="${CONFORMANCE_DOCKER_ARGS---network host}"

checkout() { # dir url ref
  local dir="$workdir/cdt/$1"
  if [ ! -d "$dir/.git" ]; then
    mkdir -p "$dir" && git -C "$dir" init -q && git -C "$dir" remote add origin "$2"
  fi
  git -C "$dir" fetch -q --depth 1 origin "$3"
  git -C "$dir" checkout -q FETCH_HEAD
}
mkdir -p "$workdir/cdt"
checkout ccs-caldavtester https://github.com/apple/ccs-caldavtester.git "$CALDAVTESTER_REF"
checkout ccs-pycalendar https://github.com/apple/ccs-pycalendar.git "$PYCALENDAR_REF"
docker build -q -t davnode-caldavtester -f "$scripts/caldavtester.Dockerfile" "$workdir/cdt" >/dev/null

baseline="$scripts/caldavtester-baseline.txt"
if [ "${CALDAVTESTER_SURVEY:-0}" = "1" ]; then
  files=$(cd "$workdir/cdt/ccs-caldavtester/scripts/tests" && ls CardDAV/*.xml CalDAV/*.xml | grep -v '\.dtd$')
else
  # Only the files that contain baseline tests.
  files=$(sed -e 's/#.*//' -e '/^[[:space:]]*$/d' "$baseline" | sed 's/::.*//' | sort -u)
fi

logs="$workdir/caldavtester-logs"
rm -rf "$logs" && mkdir -p "$logs"
for file in $files; do
  # Every test file gets a brand-new server and database. The suites leave
  # state behind (and fail to clean up when they fail), and calendars cannot
  # be deleted over DAV yet, so a shared server would make each file's
  # outcome depend on the files that ran before it.
  "$scripts/stop-server.sh" "$workdir" || true
  "$scripts/start-server.sh" "$workdir" >/dev/null
  node "$scripts/provision-users.mjs" "$workdir/users.json" >/dev/null
  node "$scripts/make-serverinfo.mjs" \
    "$workdir/cdt/ccs-caldavtester/scripts/server/serverinfo.xml" \
    "$workdir/users.json" "$workdir/serverinfo.xml" >/dev/null
  log="$logs/$(echo "$file" | tr '/' '_').log"
  # shellcheck disable=SC2086
  docker run --rm $docker_args -v "$workdir/serverinfo.xml:/serverinfo.xml:ro" \
    davnode-caldavtester timeout 60 python testcaldav.py -s /serverinfo.xml \
    --print-details-onfail "$file" >"$log" 2>&1 || true
  echo "$file: $(grep -E '^(OK|PASSED|FAILED) \(' "$log" | tail -1 || echo 'no summary')"
done

"$scripts/stop-server.sh" "$workdir" || true
node "$scripts/evaluate-caldavtester.mjs" "$logs" "$baseline"
