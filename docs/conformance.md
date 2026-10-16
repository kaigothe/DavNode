# Conformance testing

DavNode is checked against two independent test suites in CI. This page
says what they cover, how to run them, what they found, and where DavNode
deliberately or knowingly differs from what they expect.

## litmus (WebDAV, RFC 4918)

[litmus](http://www.webdav.org/neon/litmus/) runs the `basic`, `copymove`,
`props`, `locks` and `http` suites against the WebDAV file tree. The CI job
`litmus` runs it on every push and fails on any failing or skipped test not
listed in `scripts/conformance/litmus-expected-failures.txt` (currently
empty). **All 104 litmus 0.13 tests pass** (two harmless warnings:
`DELETE` with a fragment in the URI, and a `423` where litmus would accept
`412`).

Running litmus against DavNode found, and these commits fixed, real
defects: a trailing slash in a collection URL (`MKCOL /coll/`) answered
`409`; a malformed `PROPFIND`/`PROPPATCH`/`MKCOL` body answered `500` or was
silently accepted; `COPY`/`MOVE` onto a locked resource replaced it and
deleted its lock; `LOCK` on an unmapped URL did not create the empty
resource RFC 4918 section 7.3 requires; and only lock tokens were read from
the `If` header, never its entity-tag or `Not` conditions.

```
npm run build --workspaces
scripts/conformance/start-server.sh      # throw-away SQLite DB and tenant
scripts/conformance/run-litmus.sh        # needs the `litmus` package
scripts/conformance/stop-server.sh
```

## CalDAVTester / CardDAVTester (CalDAV, CardDAV)

Apple's [CalDAVTester](https://github.com/apple/ccs-caldavtester) (an
archived project, pinned in `run-caldavtester.sh`) is a large scripted
suite written against CalendarServer. It is **not** plug and play and
DavNode does not, and should not, pass all of it: many tests assert
CalendarServer specifics (see below). It runs in a `python:2.7` container
because it is Python 2 code.

Because "everything must pass" can never be true and "ignore the result" is
useless, the CI job `caldavtester` is a **ratchet**:
`scripts/conformance/caldavtester-baseline.txt` lists the individual tests
that pass today, and the job fails if any of them stops passing. Every test
file runs against a brand-new server and database, because the suites leave
state behind. A test that starts passing is reported; add it with

```
CALDAVTESTER_SURVEY=1 scripts/conformance/run-caldavtester.sh   # every file, slow
node scripts/conformance/evaluate-caldavtester.mjs .conformance/caldavtester-logs \
  scripts/conformance/caldavtester-baseline.txt --write-baseline
```

`make-serverinfo.mjs` translates CalendarServer's URL scheme to DavNode's
(everything below `/dav/{tenant}/`, homes addressed by principal id) and
`caldavtester-features.txt` declares which of the suite's optional features
DavNode has; tests needing others are skipped by the suite itself.

**Current result** (219 tests pass, 407 fail, 70 are skipped because a
feature is not offered, and a further 110 files consist only of such
skipped tests): the table at the end lists it per file. The failures are not
individually triaged; the causes that were examined are these.

### Defects this found, now fixed

- `DAV:current-user-principal`, `DAV:principal-collection-set` and
  `DAV:principal-URL` did not exist and `PROPFIND` on `/dav/{tenant}/` was
  not routed, so a client given only a base URL could not find its data.
- `DAV:supported-report-set` and `DAV:sync-token` were missing from
  collections, so clients could not detect `sync-collection` support.
- `DELETE` on a calendar or addressbook answered `405`; clients could not
  delete one.
- No `OPTIONS` handling existed at all (no `DAV:` compliance header).

### Known differences, not fixed

- **Stricter than CalendarServer on purpose.** `sync-collection` without
  `DAV:sync-level` is `400` (RFC 6578 makes it mandatory); a `DTSTART`/`DTEND`
  with mixed value types is `403 valid-calendar-data` where CalendarServer
  silently repairs it; `Depth: infinity` on principal collections is refused.
- **No VTODO/VJOURNAL** (planning/03-open-questions.md), so every test that
  writes a task fails, and DavNode has no `tasks` collection.
- **`addressbook-query` filters only the indexed properties** (`FN`, `N`,
  `EMAIL`, `TEL`, `ORG`, `NICKNAME`); other properties such as `NOTE` or
  `PHOTO`, and `is-not-defined`, answer `403 supported-filter` (RFC 6352
  permits this). Extending the index is the fix.
- **URL scheme.** Principals are addressed by principal id, never by user
  name (`/principals/users/user01` does not exist); principal hrefs have no
  trailing slash; an addressbook is addressed by its display name, not by
  the URL it was created at.
- **Discovery.** `/.well-known/caldav` and `/carddav` answer `302` and
  require Basic authentication (planning/01-decisions.md, Runde 26); the
  suite expects `301` and an answer without credentials.
- **CalendarServer-only extensions** DavNode does not offer: calendar
  sharing and delegation (`calendar-user-proxy`), managed attachments and
  the dropbox, the timezone service, VAVAILABILITY, jCal/jCard, directory
  gateway, group vCards (`X-ADDRESSBOOKSERVER-KIND`), bulk `POST`,
  `Prefer` headers, podding.
- **Scheduling.** DavNode implements implicit scheduling (RFC 6638, M7) but
  the `implicit*` suites exercise CalendarServer's specific behaviour
  (auto-accept, travel time, private events, ...) and mostly fail.

### Results per file

| Test file                                   | Passing | Failing |
| ------------------------------------------- | ------: | ------: |
| `CalDAV/acl.xml`                            |       0 |       1 |
| `CalDAV/aclreports.xml`                     |       0 |       1 |
| `CalDAV/alarm-dismissal.xml`                |       8 |       1 |
| `CalDAV/attachments.xml`                    |       3 |       5 |
| `CalDAV/conditional.xml`                    |       1 |       2 |
| `CalDAV/copymove.xml`                       |       0 |       5 |
| `CalDAV/ctag.xml`                           |      17 |       3 |
| `CalDAV/current-user-principal.xml`         |       1 |       2 |
| `CalDAV/delete.xml`                         |       0 |       1 |
| `CalDAV/duplicate_uids.xml`                 |       1 |       1 |
| `CalDAV/encodedURIs.xml`                    |       6 |      12 |
| `CalDAV/errors.xml`                         |      20 |      24 |
| `CalDAV/floating.xml`                       |       8 |       6 |
| `CalDAV/freebusy.xml`                       |       4 |       0 |
| `CalDAV/get.xml`                            |       1 |       0 |
| `CalDAV/ical-client.xml`                    |       4 |       2 |
| `CalDAV/implicitacls.xml`                   |       4 |       0 |
| `CalDAV/implicitallday.xml`                 |       0 |       1 |
| `CalDAV/implicitattendeedelete.xml`         |       0 |       1 |
| `CalDAV/implicitbadclients.xml`             |       0 |       1 |
| `CalDAV/implicitbatchrefresh.xml`           |       0 |       1 |
| `CalDAV/implicitcalendartransp.xml`         |       5 |      16 |
| `CalDAV/implicitcancels.xml`                |       0 |       1 |
| `CalDAV/implicitcompatibility.xml`          |       0 |       1 |
| `CalDAV/implicitdefaultcalendar.xml`        |       1 |      17 |
| `CalDAV/implicitdeletecalendar.xml`         |       0 |       1 |
| `CalDAV/impliciterrors.xml`                 |       1 |       4 |
| `CalDAV/implicitfreebusy.xml`               |       0 |       1 |
| `CalDAV/implicitimip.xml`                   |       0 |       1 |
| `CalDAV/implicitlarge.xml`                  |       0 |       1 |
| `CalDAV/implicitoptions.xml`                |       0 |       2 |
| `CalDAV/implicitpartstatchange.xml`         |       0 |       1 |
| `CalDAV/implicitprivateevents.xml`          |       0 |       1 |
| `CalDAV/implicitpublicproperties.xml`       |       0 |       1 |
| `CalDAV/implicitrecur1.xml`                 |       0 |       1 |
| `CalDAV/implicitrecur2.xml`                 |       0 |       1 |
| `CalDAV/implicitreschedule.xml`             |       0 |       1 |
| `CalDAV/implicitscenario1.xml`              |       0 |       1 |
| `CalDAV/implicitscenario2.xml`              |       0 |       1 |
| `CalDAV/implicitscenario3.xml`              |       0 |       1 |
| `CalDAV/implicitscheduleagent.xml`          |       0 |       1 |
| `CalDAV/implicitscheduletag.xml`            |       0 |       1 |
| `CalDAV/implicitsecurity.xml`               |       0 |       1 |
| `CalDAV/implicitsequence.xml`               |       0 |       1 |
| `CalDAV/implicittimezones.xml`              |       0 |       1 |
| `CalDAV/implicittodo.xml`                   |       0 |       1 |
| `CalDAV/implicitxdash.xml`                  |       0 |       1 |
| `CalDAV/mkcalendar.xml`                     |      11 |       9 |
| `CalDAV/nonascii.xml`                       |       5 |       7 |
| `CalDAV/options.xml`                        |       4 |       0 |
| `CalDAV/pretest.xml`                        |       6 |       0 |
| `CalDAV/propfind.xml`                       |      13 |      13 |
| `CalDAV/proppatch.xml`                      |       1 |       7 |
| `CalDAV/put.xml`                            |      10 |      27 |
| `CalDAV/quota.xml`                          |       8 |       8 |
| `CalDAV/recurrenceput.xml`                  |      12 |       7 |
| `CalDAV/reports.xml`                        |       0 |       1 |
| `CalDAV/scheduleimplicit-compatability.xml` |       3 |       3 |
| `CalDAV/schedulenomore.xml`                 |       0 |       1 |
| `CalDAV/schedulepost.xml`                   |       3 |      24 |
| `CalDAV/scheduleprops.xml`                  |       2 |      10 |
| `CalDAV/servertoserverincoming.xml`         |       0 |      13 |
| `CalDAV/servertoserveroutgoing.xml`         |       0 |       2 |
| `CalDAV/sync-report.xml`                    |       4 |      28 |
| `CalDAV/timezones.xml`                      |      11 |       3 |
| `CalDAV/vtodos.xml`                         |       0 |       1 |
| `CalDAV/well-known.xml`                     |       0 |      10 |
| `CardDAV/ab-client.xml`                     |       2 |       1 |
| `CardDAV/aclreports.xml`                    |       0 |       1 |
| `CardDAV/copymove.xml`                      |       0 |       3 |
| `CardDAV/current-user-principal.xml`        |       1 |       2 |
| `CardDAV/directory.xml`                     |       0 |       7 |
| `CardDAV/errorcondition.xml`                |       1 |      11 |
| `CardDAV/errors.xml`                        |       1 |       9 |
| `CardDAV/get.xml`                           |       1 |       2 |
| `CardDAV/mkcol.xml`                         |       1 |       2 |
| `CardDAV/nonascii.xml`                      |       2 |       5 |
| `CardDAV/propfind.xml`                      |      11 |       5 |
| `CardDAV/proppatch.xml`                     |       0 |       7 |
| `CardDAV/put.xml`                           |      14 |       4 |
| `CardDAV/reports.xml`                       |       7 |      32 |
| `CardDAV/sync-report.xml`                   |       0 |       1 |
| `CardDAV/well-known.xml`                    |       0 |      10 |

`0 | 1` means the file could not run at all (an error in the suite's own
setup, for example for features it needs from the server).
