---
layout: home
hero:
  name: DavNode
  text: Files, calendars and contacts on your own server
  tagline: A self-hosted WebDAV, CalDAV and CardDAV server with tenants, access control and quotas. Everything in one database, so one backup is a complete backup.
  image:
    src: /logo.svg
    alt: DavNode
  actions:
    - theme: brand
      text: Quick start
      link: https://github.com/kaigothe/DavNode#quick-start
    - theme: alt
      text: Compared with others
      link: /comparison
features:
  - title: Standards first
    details: WebDAV, CalDAV with scheduling, CardDAV. All 104 litmus tests pass and 222 CalDAVTester tests guard against regressions.
  - title: Built for several teams
    details: Tenants, users and groups, ACLs, quotas and a REST admin API on PostgreSQL, MySQL or SQLite.
  - title: Operable
    details: Health check, metrics, structured logs, a tested backup and restore runbook, signed container images and a reference deployment with automatic HTTPS.
---

## Status

DavNode is young. The implementation is complete and heavily tested, but it
has **not yet been verified on real client devices**; see the
[compatibility matrix](/client-compatibility). It runs as a single instance,
has no web interface yet (REST API only) and no audit log. Read the
[fact sheet](/enterprise-fact-sheet) before you decide.
