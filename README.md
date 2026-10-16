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

**Milestones M0–M10 are complete** (the current version and the full
history are in [CHANGELOG.md](CHANGELOG.md)). Implemented:

- **WebDAV** Class 1 and 2 (locking), RFC 6578 `sync-collection`, and
  RFC 3744 ACLs with per-user/group access control.
- **CardDAV** (RFC 6352): addressbooks, contacts, and the
  `addressbook-query`/`addressbook-multiget` REPORTs.
- **CalDAV** (RFC 4791) with scheduling (RFC 6638, iTIP invitations,
  replies, cancellations, free/busy) and read-only ICS feeds.
- **Quota** enforcement per user and tenant, RFC 4331 quota properties,
  and a periodic reconciliation job.
- **Admin API** (`/admin/{tenantSlug}/...`, REST + JSON, HTTP Basic
  auth): management of tenants, users, groups and group membership, and
  quota, with a `member`/`tenant_admin`/`server_admin` role model. A
  `tenant_admin` manages their own tenant only; creating, listing,
  changing quota limits of and deleting tenants is reserved to
  `server_admin`. Destructive deletions require a confirmation field in
  the request body. The very first tenant and admin user still come
  from the bootstrap CLI (`npm run bootstrap`).

- **Authentication schemes**: HTTP Basic (default), Digest (RFC 7616,
  SHA-256 only) and OAuth2 bearer tokens (RFC 6750). DavNode is only an
  OAuth2 *resource server*: it validates JWTs issued by an external OIDC
  provider and never creates users from tokens — an administrator links
  a user to the provider's `(issuer, subject)` through the Admin API.
  See [Configuring authentication](#configuring-authentication).
- **Client compatibility**: RFC 6764 discovery (`/.well-known/caldav`,
  `/.well-known/carddav`), `getctag`, vCard 3.0 tolerance and the
  `OPTIONS` headers the Windows WebDAV client needs. Setup notes and
  Windows-specific limitations are in
  [docs/client-compatibility.md](docs/client-compatibility.md).

Still to come: real-world client compatibility fixes (M11) and
production hardening (M12).

### Configuring authentication

| Variable | Meaning |
| --- | --- |
| `DAVNODE_AUTH_PROVIDERS` | Comma-separated schemes to offer: `basic`, `digest`, `oauth2`. Default `basic`. |
| `DAVNODE_AUTH_REALM` | Realm used in the challenges. Default `davnode`. Digest credentials embed it, so after changing it each user's password has to be set again. |
| `DAVNODE_OAUTH2_ISSUERS` | Required with `oauth2`: a JSON array of trusted issuers, e.g. `[{"issuer":"https://idp.example.com","audience":"davnode","jwksUri":"https://idp.example.com/jwks"}]`. The JWKS URL is explicit; there is no OIDC discovery. |

With several schemes enabled, an unauthenticated request receives one
`WWW-Authenticate` header line per scheme, and a client may use any of
them. The server refuses to start if the list names an unknown scheme or
if `oauth2` is enabled without any issuer.

Digest needs a stored `HA1` hash per user (computed from the password
and realm), which is weaker than the argon2id hash used for Basic. It is
only stored while `digest` is enabled; users created, or whose password
is set via `POST /admin/{tenantSlug}/users/{userId}/password`, while
Digest is off have no Digest credential and cannot use it until their
password is set again with Digest on. Nonces are kept in memory, so
Digest suits a single server instance.

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
| **M5 — CardDAV (RFC 6352)** | | Contact/addressbook synchronization | ✅ Done |
| | Addressbook domain entities | Addressbook/AddressObject entities | ✅ Done |
| | vCard parsing & index | Parse vCards into a searchable index | ✅ Done |
| | Addressbook home & extended MKCOL | Per-user addressbook home collection | ✅ Done |
| | AddressObject CRUD | GET/PUT/DELETE for individual contacts | ✅ Done |
| | ACL/lock/sync reuse | Wire addressbooks into M3/M4 infrastructure | ✅ Done |
| | CardDAV REPORTs | `addressbook-query`/`-multiget` | ✅ Done |
| **M6 — CalDAV (RFC 4791)** | | Calendar synchronization (excluding scheduling) | ✅ Done |
| | Calendar domain entities | Calendar/CalendarObject entities | ✅ Done |
| | iCalendar parsing & time-range index | Parse events incl. recurrence | ✅ Done |
| | Calendar home & MKCALENDAR | Per-user calendar home collection | ✅ Done |
| | CalendarObject CRUD | GET/PUT/DELETE for individual events | ✅ Done |
| | ACL/lock/sync reuse | Wire calendars into M3/M4 infrastructure | ✅ Done |
| | CalDAV REPORTs | `calendar-query`/`-multiget`, free-busy-query | ✅ Done |
| | ICS feed export | Read-only `.ics` subscription feed per calendar | ✅ Done |
| **M7 — CalDAV Scheduling (RFC 6638)** | | Meeting invitations and free/busy via iTIP | ✅ Done |
| | Scheduling data model | Scheduling inbox/outbox entities | ✅ Done |
| | iTIP message generation | Build REQUEST/REPLY/CANCEL messages | ✅ Done |
| | Organizer invite workflow | Deliver invites to attendees | ✅ Done |
| | Attendee reply workflow | Deliver PARTSTAT replies to organizer | ✅ Done |
| | Cancel workflow | Deliver cancellations, clean up copies | ✅ Done |
| | Scheduling outbox / free-busy | Bulk free/busy queries via POST | ✅ Done |
| | Scheduling privileges & routes | Inbox/outbox collections + privileges | ✅ Done |
| **M8 — Quota Enforcement** | | Per-user/tenant storage limits | ✅ Done |
| | Quota counter utility | Atomic, race-free user/tenant counters | ✅ Done |
| | WebDAV quota integration | Enforce limits on PUT/DELETE | ✅ Done |
| | CardDAV/CalDAV quota integration | Same enforcement for contacts/events | ✅ Done |
| | Quota properties | `quota-available-bytes`/`quota-used-bytes` | ✅ Done |
| | Quota recompute | Periodic reconciliation job | ✅ Done |
| **M9 — Admin/Management API** | | REST API for managing tenants, users, groups, and quota | ✅ Done |
| | Role model | Real `server_admin`/`tenant_admin`/user roles | ✅ Done |
| | Admin API scaffold | Express router mounted in `@davnode/server` | ✅ Done |
| | Tenant management | CRUD for tenants + quota limits | ✅ Done |
| | User management | CRUD for users within a tenant | ✅ Done |
| | Group management | CRUD for groups + membership | ✅ Done |
| | Quota management | Full admin route replacing the M8 stopgap | ✅ Done |
| **M10 — Extended Auth Providers** | | Digest Auth and OAuth2/Bearer support | ✅ Done |
| | Credential entity retrofit | Add Digest/OAuth2 columns | ✅ Done |
| | Digest Auth core | HA1-based verification | ✅ Done |
| | Digest Auth HTTP | Challenge/response handling | ✅ Done |
| | OAuth2 core | JWT/JWKS validation against an OIDC provider | ✅ Done |
| | OAuth2 HTTP | Bearer token handling (RFC 6750) | ✅ Done |
| | Provider management | Enable/configure auth providers per tenant | ✅ Done |
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
