# Positioning

Internal reference for how DavNode is described in the README, the
documentation site and announcements. Every claim below is backed by a test,
a conformance suite or documentation in this repository.

## One sentence

> DavNode is a self-hosted WebDAV, CalDAV and CardDAV server for files,
> calendars and contacts, with per-user and per-group access control,
> multiple tenants and quotas, storing everything in one database.

German: _DavNode ist ein selbst gehosteter WebDAV-, CalDAV- und
CardDAV-Server für Dateien, Kalender und Kontakte – mit Rechteverwaltung pro
Nutzer und Gruppe, Mandanten und Quotas, alles in einer Datenbank._

## Three reasons to choose it

1. **One database, one backup.** Files, calendars and contacts all live in
   PostgreSQL, MySQL or SQLite; a database backup is a complete backup
   ([backup runbook](operations/backup.md), tested weekly in CI).
2. **Built for several organisations or teams on one server.** Tenants,
   users and groups, ACLs (RFC 3744), quotas (RFC 4331) and a REST admin API.
3. **Standards first, checked in CI.** All 104 litmus tests pass; 222
   CalDAVTester/CardDAVTester tests are held as a regression baseline
   ([conformance](conformance.md)).

## Who it is for

| Audience                                 | Fit now                                                         |
| ---------------------------------------- | --------------------------------------------------------------- |
| Self-hosters, small teams, associations  | **Primary.** Docker image, one compose file, automatic HTTPS.   |
| IT service providers hosting for clients | Good: tenants, quotas, admin API. Evaluate with the fact sheet. |
| Node.js developers embedding DAV         | Later. The packages are not published to npm yet.               |

## Not a fit (say so plainly)

- **Not a groupware suite.** No web calendar, mail, office or sharing UI;
  use a CalDAV/CardDAV/WebDAV client. If you want that, use Nextcloud.
- **One server instance.** Rate limiting and Digest nonces are in memory;
  there is no clustering.
- **Only a small admin interface.** Users, groups, quotas and tenants can be
  managed in a [web UI](admin-ui.md) (off by default); there is no web
  interface for end users.
- **Client compatibility is being verified.** See the
  [compatibility matrix](client-compatibility.md) for what is confirmed.
- **No encryption at rest, no audit log** of administrative actions yet
  (apart from the log of an administrator reading a user's data).

## Wording rules

- Do not write "production ready" or name clients as supported unless the
  compatibility matrix shows a verified result.
- Compare with other projects factually and with dated sources
  ([comparison](comparison.md)).
