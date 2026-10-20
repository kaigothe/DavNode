# Fact sheet for evaluators

Facts for an IT or security review, with where each is documented or
tested. Gaps are listed explicitly. Reviewed against DavNode 1.29.

## What it is

Self-hosted WebDAV (files), CalDAV (calendars, invitations) and CardDAV
(contacts) server in Node.js 22, AGPL-3.0, developed in the open at
github.com/kaigothe/DavNode. One maintainer.

## Capabilities

| Area                    | Fact                                                                                   | Evidence                                   |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
| Standards               | WebDAV class 1+2, ACL, sync, quota, CalDAV, scheduling, CardDAV, discovery             | README "Supported standards"; CI           |
| Conformance             | litmus 104/104; CalDAVTester/CardDAVTester 222 tests as regression baseline            | [conformance](conformance.md); CI          |
| Real clients            | **Not yet verified on real devices**; matrix in progress                               | [compatibility](client-compatibility.md)   |
| Multi-tenancy           | Tenants isolate users, groups, data and quotas by URL prefix and database keys         | automated tests                            |
| Authorisation           | ACLs (RFC 3744) per user/group; roles `server_admin`, `tenant_admin`, user             | tests; [security](security.md)             |
| Authentication          | Basic (argon2id), Digest (SHA-256), OAuth2/OIDC bearer tokens; failed-login rate limit | README; tests                              |
| Transport               | HTTP only; TLS via reverse proxy (reference setup with Caddy, automatic certificates)  | README "Production deployment"             |
| Data store              | PostgreSQL, MySQL or SQLite; all content in the database                               | README                                     |
| Backup / restore        | Runbook per engine; weekly CI restore test                                             | [backup](operations/backup.md); CI         |
| Upgrades                | Automatic forward migrations; CI test from the previous release                        | [upgrade](upgrade.md)                      |
| Observability           | JSON logs with request ids, Prometheus metrics, `/healthz`                             | [handbook](operations/handbook.md)         |
| Supply chain            | Signed container images, SBOM, provenance, Dependabot, CodeQL                          | [verify image](operations/verify-image.md) |
| Vulnerability reporting | Private reporting via GitHub, 7-day acknowledgement target                             | [SECURITY.md](../SECURITY.md)              |

## Known gaps (as of this review)

- **No audit log** of administrative actions (an administrator reading a
  user's data through the admin UI is logged, nothing else is).
- **No encryption at rest** by DavNode (use database/disk encryption).
- **No clustering**; rate limiter and Digest nonces are in memory.
- **No web interface for end users.** Administrators get an optional
  [admin UI](admin-ui.md) for tenants, users, groups and quotas.
- **Throughput** is bounded by per-request password hashing: about 20–35
  requests/s on a laptop (see [handbook](operations/handbook.md#sizing)).
- Brute-force protection is per address, not distributed.
- Young project; one maintainer; no commercial SLA ([maintenance](maintenance.md),
  [support](support.md)).
