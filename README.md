# DavNode

A modern, open-source WebDAV server with CalDAV and CardDAV extensions
and user-based ACLs. The initial focus is a clean, correct
implementation of the open standards (WebDAV/CalDAV/CardDAV RFCs);
client-specific quirks (Apple Calendar/Contacts, Google, Microsoft) are
addressed in a later phase to maximize compatibility with common DAV
clients.

## License

DavNode is licensed under the [GNU Affero General Public License v3.0](LICENSE)
(AGPL-3.0-only).

## Status

**Current version: v1.7.0.** WebDAV Class 1, WebDAV Class 2 (locking),
RFC 6578 sync, and RFC 3744 ACLs are implemented and working — see
[CHANGELOG.md](CHANGELOG.md) for the full history. DavNode can already
be mounted by standard WebDAV clients for file storage with per-user/
group access control and locking. CalDAV/CardDAV support is not yet
implemented.

## Roadmap

DavNode is built incrementally, one milestone at a time, with each
milestone shipping a runnable, testable increment. Full task
breakdowns live under [milestones/](milestones/); design rationale,
architecture, and data model live under [planning/](planning/).

| Milestone | Task | Description | Status |
|---|---|---|---|
| **M0 — Project Foundation** | | Repo, tooling, and infrastructure scaffolding — no runtime behavior yet | ✅ Done |
| | Monorepo scaffold | npm workspaces layout (core/server/admin-api) | ✅ Done |
| | TypeScript, linting, testing | Strict TS, ESLint/Prettier, Vitest | ✅ Done |
| | TypeORM & database setup | DB-agnostic DataSource (Postgres/SQLite/MySQL) + migrations | ✅ Done |
| | Docker setup | Dockerfile + Docker Compose | ✅ Done |
| | CI pipeline | GitHub Actions: lint, build, tests | ✅ Done |
| | Code documentation | TSDoc → TypeDoc API docs | ✅ Done |
| | Changelog & release automation | Conventional Commits → semantic-release | ✅ Done |
| **M1 — Core Data Model & Tenancy** | | Tenant/user/group data model and the first (Basic Auth) auth provider | ✅ Done |
| | Core entities | Tenant, User, Group, Principal | ✅ Done |
| | Credential & auth interface | Basic Auth + pluggable provider interface | ✅ Done |
| | Principal URL schema | Principal ↔ DAV URL mapping | ✅ Done |
| | Repository/service layer | Shared Tenant/User/Group services | ✅ Done |
| | Seed/bootstrap tooling | CLI to create first tenant + admin | ✅ Done |
| **M2 — WebDAV Core (Class 1)** | | First runnable server — full WebDAV Class 1 file operations | ✅ Done |
| | WebDAV domain entities | Collection, FileResource, FileContent | ✅ Done |
| | Express server bootstrap | Real HTTP server in `@davnode/server` | ✅ Done |
| | XML & property infrastructure | Shared multistatus/property XML plumbing | ✅ Done |
| | PROPFIND | Read collection/resource metadata | ✅ Done |
| | PROPPATCH | Set/remove dead properties | ✅ Done |
| | Resource CRUD | MKCOL/GET/PUT/DELETE + ETags | ✅ Done |
| | COPY/MOVE | Copy/move files and collections | ✅ Done |
| **M3 — WebDAV ACL (RFC 3744)** | | Real per-user/group access control, replacing the M2 owner-only placeholder | ✅ Done |
| | ACE entities & privileges | ACE tables + privilege vocabulary | ✅ Done |
| | Group membership reverse lookup | Resolve a principal's (transitive) groups | ✅ Done |
| | ACL evaluation engine | Grant/deny privilege resolution | ✅ Done |
| | ACL HTTP method | Set access rights via `ACL` method | ✅ Done |
| | ACL properties | RFC 3744/5397 live properties on PROPFIND | ✅ Done |
| | Principals & REPORT infrastructure | Principals collection + generic REPORT dispatcher | ✅ Done |
| | Replace placeholder authorization | Swap M2's owner-only rule for real ACL checks | ✅ Done |
| **M4 — Locking (Class 2) & Sync** | | WebDAV Class 2 locking plus efficient incremental client sync | ✅ Done |
| | Lock entities | `collection_locks`/`file_locks` tables | ✅ Done |
| | Lock evaluation | Effective-lock resolution incl. inheritance | ✅ Done |
| | LOCK method | Create/refresh locks | ✅ Done |
| | UNLOCK method | Release a held lock | ✅ Done |
| | Lock enforcement middleware | Mutating methods honor lock tokens | ✅ Done |
| | Lock properties | `supportedlock`/`lockdiscovery` | ✅ Done |
| | sync-collection REPORT | Incremental client sync (RFC 6578) | ✅ Done |
| **M5 — CardDAV (RFC 6352)** | | Contact/addressbook synchronization | 🔜 Next |
| | Addressbook domain entities | Addressbook/AddressObject entities | 🔜 Planned |
| | vCard parsing & index | Parse vCards into a searchable index | 🔜 Planned |
| | Addressbook home & extended MKCOL | Per-user addressbook home collection | 🔜 Planned |
| | AddressObject CRUD | GET/PUT/DELETE for individual contacts | 🔜 Planned |
| | ACL/lock/sync reuse | Wire addressbooks into M3/M4 infrastructure | 🔜 Planned |
| | CardDAV REPORTs | `addressbook-query`/`-multiget` | 🔜 Planned |
| **M6 — CalDAV (RFC 4791)** | | Calendar synchronization (excluding scheduling) | ⏳ Planned |
| | Calendar domain entities | Calendar/CalendarObject entities | ⏳ Planned |
| | iCalendar parsing & time-range index | Parse events incl. recurrence | ⏳ Planned |
| | Calendar home & MKCALENDAR | Per-user calendar home collection | ⏳ Planned |
| | CalendarObject CRUD | GET/PUT/DELETE for individual events | ⏳ Planned |
| | ACL/lock/sync reuse | Wire calendars into M3/M4 infrastructure | ⏳ Planned |
| | CalDAV REPORTs | `calendar-query`/`-multiget`, free-busy-query | ⏳ Planned |
| | ICS feed export | Read-only `.ics` subscription feed per calendar | ⏳ Planned |
| **M7 — CalDAV Scheduling (RFC 6638)** | | Meeting invitations and free/busy via iTIP | ⏳ Planned |
| | Scheduling data model | Scheduling inbox/outbox entities | ⏳ Planned |
| | iTIP message generation | Build REQUEST/REPLY/CANCEL messages | ⏳ Planned |
| | Organizer invite workflow | Deliver invites to attendees | ⏳ Planned |
| | Attendee reply workflow | Deliver PARTSTAT replies to organizer | ⏳ Planned |
| | Cancel workflow | Deliver cancellations, clean up copies | ⏳ Planned |
| | Scheduling outbox / free-busy | Bulk free/busy queries via POST | ⏳ Planned |
| | Scheduling privileges & routes | Inbox/outbox collections + privileges | ⏳ Planned |
| **M8 — Quota Enforcement** | | Per-user/tenant storage limits | ⏳ Planned |
| | Quota counter utility | Atomic, race-free user/tenant counters | ⏳ Planned |
| | WebDAV quota integration | Enforce limits on PUT/DELETE | ⏳ Planned |
| | CardDAV/CalDAV quota integration | Same enforcement for contacts/events | ⏳ Planned |
| | Quota properties | `quota-available-bytes`/`quota-used-bytes` | ⏳ Planned |
| | Quota recompute | Periodic reconciliation job | ⏳ Planned |
| **M9 — Admin/Management API** | | REST API for managing tenants, users, groups, and quota | ⏳ Planned |
| | Role model | Real `server_admin`/`tenant_admin`/user roles | ⏳ Planned |
| | Admin API scaffold | Express router mounted in `@davnode/server` | ⏳ Planned |
| | Tenant management | CRUD for tenants + quota limits | ⏳ Planned |
| | User management | CRUD for users within a tenant | ⏳ Planned |
| | Group management | CRUD for groups + membership | ⏳ Planned |
| | Quota management | Full admin route replacing the M8 stopgap | ⏳ Planned |
| **M10 — Extended Auth Providers** | | Digest Auth and OAuth2/Bearer support | ⏳ Planned |
| | Credential entity retrofit | Add Digest/OAuth2 columns | ⏳ Planned |
| | Digest Auth core | HA1-based verification | ⏳ Planned |
| | Digest Auth HTTP | Challenge/response handling | ⏳ Planned |
| | OAuth2 core | JWT/JWKS validation against an OIDC provider | ⏳ Planned |
| | OAuth2 HTTP | Bearer token handling (RFC 6750) | ⏳ Planned |
| | Provider management | Enable/configure auth providers per tenant | ⏳ Planned |
| **M11 — Client Compatibility** | | Fixes for real-world Apple/Google/Microsoft client quirks | ⏳ Planned |
| | Well-known discovery | `/.well-known/caldav` and `/carddav` (RFC 6764) | ⏳ Planned |
| | Apple compatibility | `getctag` and other Apple client quirks | ⏳ Planned |
| | vCard 3.0 compatibility | Accept vCard 3.0 alongside 4.0 | ⏳ Planned |
| | Windows mini-redirector compatibility | Explorer WebDAV client support | ⏳ Planned |
| | Google compatibility | Fixes found via real-world testing | ⏳ Planned |
| | Conformance suite in CI | litmus/CalDAVtester/CardDAVtester in CI | ⏳ Planned |
| **M12 — Hardening & Production Readiness** | | Deployment, observability, backups, and security review | ⏳ Planned |
| | Health checks & production deployment | Health endpoint + production Compose reference | ⏳ Planned |
| | Observability | Structured logs + metrics endpoint | ⏳ Planned |
| | Security hardening | Rate limiting and related fixes | ⏳ Planned |
| | Backup & restore | Tested backup/restore runbook per DB engine | ⏳ Planned |
| | Documentation | Standalone English user/contributor docs | ⏳ Planned |
