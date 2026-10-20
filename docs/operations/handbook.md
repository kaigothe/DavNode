# Operations handbook

Everything an operator needs, in one place. Details live in the README
(configuration tables, production deployment), the
[backup runbook](backup.md), [upgrade guide](../upgrade.md) and
[security model](../security.md).

## Day-to-day

| Task               | How                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Is it up?          | `GET /healthz` → `200 {"status":"ok"}`; `503` when the database does not answer                    |
| Logs               | JSON lines on stdout with `requestId`; `docker compose logs -f app`; level via `DAVNODE_LOG_LEVEL` |
| Metrics            | `GET /admin/{tenant}/metrics` (server administrator), Prometheus format                            |
| Backup             | [Runbook](backup.md); the database is the only state                                               |
| Upgrade            | [Upgrade guide](../upgrade.md)                                                                     |
| Quota out of sync? | `POST /admin/{tenant}/quota/recompute`; a job also runs nightly (`DAVNODE_QUOTA_RECONCILE_CRON`)   |
| Reset a password   | `POST /admin/{tenant}/users/{userId}/password`                                                     |

## Sizing

Measured with `scripts/loadtest/run.mjs` (20 virtual users, mixed
`PUT`/`GET`/`PROPFIND` of 10 KB files, DavNode with SQLite on one Apple
silicon laptop, 8 cores, no network): **roughly 20–35 requests per second**,
median latency 0.2–0.5 s and the 95th percentile above 2 s under 20 concurrent
users, with about 300–370 MiB of memory.

An authenticated request cost about 27 ms more than an unauthenticated one
(`/healthz`) in the same setup. DavNode verifies the password of every
request (argon2id, deliberately expensive) and does not cache the result, so
**throughput is bounded by password hashing**, not by the database. For
planning this means:

- A handful of users with normal clients is far below the limit; a client
  syncs in short bursts.
- Many users syncing at the same moment (office start, hundreds of accounts)
  will queue. Plan for the figures above on a similar machine, test with your
  own hardware, and prefer OAuth2 bearer tokens or fewer, longer-lived
  connections if you need more.
- Reducing the cost per request (a short-lived cache of verified
  credentials) is on the roadmap discussion, not implemented.

Run the test yourself:

```bash
node scripts/loadtest/run.mjs http://localhost:8080 demo admin 'password' --users 20 --seconds 20
```

Memory limits in the reference compose files (512 MB for the app, 1 GB for
PostgreSQL) are starting values.

## Troubleshooting

**Clients get `401`.** Wrong password, or the user name needs the tenant:
`user@tenant` unless `DAVNODE_DEFAULT_TENANT` is set. Digest users need their
password set again after enabling Digest or changing the realm.

**`/admin-ui/` answers `404`.** The [admin UI](../admin-ui.md) is off by
default; set `DAVNODE_ADMIN_UI_ENABLED=true`.

**`429 Too Many Requests`.** Too many failed logins from one address
(`DAVNODE_AUTH_RATE_LIMIT_*`). Behind a proxy set `DAVNODE_BEHIND_TLS_PROXY`
so the real client address is used instead of the proxy's.

**`507 Insufficient Storage`.** A user or tenant quota is full. Raise it via
the admin API or delete data; recompute if the numbers look wrong.

**Windows Explorer cannot connect.** Basic over plain HTTP is refused by
Windows; use HTTPS. See [client compatibility](../client-compatibility.md).

**Server does not start: invalid variable.** The message names the variable.

**Start fails on migrations.** Restore the backup you took before upgrading
and report the log at the project's issue tracker.

**Certificates are not issued (Caddy).** The domain must point to the host
and ports 80/443 must be reachable from the internet.

**Where is my data?** In the database (PostgreSQL/MySQL volume, or the SQLite
file under `/app/data` in the image). Nothing else needs a backup.
