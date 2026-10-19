# Announcement draft

_Draft for the maintainer to edit. Replace the bracketed parts with facts
that are true at publication time._

## Title options

- DavNode: a self-hosted WebDAV, CalDAV and CardDAV server in Node.js, with
  tenants, ACLs and a single-database backup
- Show HN: DavNode, one server for files, calendars and contacts

## Body

I built DavNode because [your reason: e.g. I wanted files, calendars and
contacts for several teams from one small server, one database and one
backup, without a full groupware suite].

**What it does**

- Files over WebDAV, calendars over CalDAV (including invitations and
  free/busy), contacts over CardDAV, plus a read-only `.ics` feed for
  Outlook.
- Tenants, users and groups with ACLs, quotas, and a REST admin API.
- PostgreSQL, MySQL or SQLite; everything in the database, so a database
  backup is a complete backup (with a runbook and a weekly automated restore
  test).
- Basic, Digest and OAuth2 login; rate limiting, health check, Prometheus
  metrics, signed container images.
- All 104 litmus tests pass; 222 CalDAVTester/CardDAVTester tests are held as
  a CI regression baseline.

**Try it in five minutes**

```bash
[the exact commands of deploy/README.md, tested]
```

**Honest limits**

- [N] real clients tested so far ([list]); see the compatibility matrix.
- One instance only; no web interface (REST API only); no audit log.
- Every authenticated request verifies the password, so throughput is
  roughly [figure from the handbook] requests/s per machine.
- It is a young project with one maintainer.

**What I would like from you**

Which client should I test next, and what stops you from trying it? A
[client compatibility report](https://github.com/kaigothe/DavNode/issues/new?template=client_compatibility.yml)
is the most useful contribution. AGPL-3.0.

Repo: https://github.com/kaigothe/DavNode
