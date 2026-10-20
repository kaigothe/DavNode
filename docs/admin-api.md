# Admin API

The REST API manages tenants, users, groups and quotas. It is described by an
OpenAPI 3 document that is checked against the code in CI: every route must be
documented and vice versa.

- [`admin-api.openapi.yaml`](https://github.com/kaigothe/DavNode/blob/main/docs/admin-api.openapi.yaml)
  — import it into Swagger UI, Postman or a client generator.
- Paths live under `/admin/{tenant}`; authentication is the same as for the
  DAV endpoints. Server-wide operations need the `server_admin` role.
- Errors are `{"error": {"code": "...", "message": "..."}}`.
- The lists of tenants, users and groups accept `limit` (1–500), `offset` and
  `q` (a case-insensitive search) and answer with a `total`; without them the
  whole list is returned.
- `GET /admin/{tenant}/me` tells a client who it is (role, tenant and which
  optional features are on) and works for every role; `GET …/providers` shows
  the configured authentication providers.
- `GET /admin/{tenant}/users/{userId}/groups` lists the groups a user belongs
  to, directly or through other groups, with the way in.
- With `DAVNODE_ADMIN_UI_LOG_VIEW=true`, `GET /admin/{tenant}/logs` returns the
  most recent server log lines from an in-memory buffer (server administrators
  only; filter with `level`, `q`, `limit` and `after`).
- With `DAVNODE_ADMIN_UI_CONTENT_VIEW=true` read-only routes list the
  calendars, events (in a time window of at most a year), address books and
  contacts of a user. Every read is logged. They do not exist otherwise.

The [Admin UI](admin-ui.md) is a browser front end for this API.

Example:

```bash
curl -u admin:password -X POST https://dav.example.com/admin/demo/users \
  -H 'content-type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"…"}'
```
