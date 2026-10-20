# Security model

A short description of what DavNode protects and what it leaves to the
operator. Report problems as described in [SECURITY.md](../SECURITY.md).

## Authentication

- **Basic** (argon2id password hashes), **Digest** (RFC 7616, SHA-256) and
  **OAuth2 bearer tokens** (JWT validated against your OIDC provider's JWKS).
  Choose with `DAVNODE_AUTH_PROVIDERS`. Always use HTTPS: Basic sends the
  password with every request.
- Wrong password, unknown user and unknown tenant produce the same `401`.
- Failed logins are rate limited per client address
  (`DAVNODE_AUTH_RATE_LIMIT_*`), shared by all three schemes.

## Authorisation

- Every request is bound to one tenant; data of other tenants is not
  reachable through the DAV or admin URLs.
- File, calendar and address book access is decided by ACLs (RFC 3744) per
  user and group. The admin API distinguishes `server_admin`,
  `tenant_admin` and ordinary users.
- Quotas per user and tenant bound storage use.

## Transport and headers

- DavNode speaks plain HTTP; terminate TLS in a reverse proxy and set
  `DAVNODE_BEHIND_TLS_PROXY=true` so HSTS and client addresses are right.
  The reference deployment uses Caddy with automatic certificates.
- Standard security headers are sent; CORS is restricted (see the README).
- Calendar feed URLs (`.ics`) contain a secret token and need no login;
  treat them like passwords and rotate by requesting a new token.

## Admin UI

- The [admin UI](admin-ui.md) is off by default (`DAVNODE_ADMIN_UI_ENABLED`).
  It is served by the server itself on the same origin, so CORS stays off; it
  sends the user's credentials with every request and keeps them in the tab's
  session storage, with no cookies and no server-side session.
- A Content Security Policy applies to `/admin-ui/` only.
- The recent server log can be shown to server administrators with
  `DAVNODE_ADMIN_UI_LOG_VIEW`; it is kept in memory only. The log never holds
  passwords or `Authorization` headers.
- Reading users' calendars and contacts needs a second switch
  (`DAVNODE_ADMIN_UI_CONTENT_VIEW`); every such read is written to the log
  with the administrator and the user, never the content.

## Data

- All content lives in one database; the backup runbook is in
  [operations/backup.md](operations/backup.md). Encryption at rest is the
  operator's responsibility (database or disk level).
- `/healthz` needs no login and exposes only `{"status":"ok"}`. Metrics at
  `/admin/{tenant}/metrics` need a server administrator and contain no user
  content (request counts, auth failures, quota usage per tenant).

## Supply chain

Release images are built in GitHub Actions, signed with cosign (keyless) and
ship with an SBOM and build provenance; see
[operations/verify-image.md](operations/verify-image.md). Dependencies are
updated by Dependabot and scanned by CodeQL.

## Not covered

- No audit log of administrative actions yet.
- No protection against distributed brute-force attacks.
- No multi-instance operation (nonce store and rate limiter are in memory).
