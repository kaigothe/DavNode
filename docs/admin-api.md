# Admin API

The REST API manages tenants, users, groups and quotas. It is described by an
OpenAPI 3 document that is checked against the code in CI: every route must be
documented and vice versa.

- [`admin-api.openapi.yaml`](https://github.com/kaigothe/DavNode/blob/main/docs/admin-api.openapi.yaml)
  — import it into Swagger UI, Postman or a client generator.
- Paths live under `/admin/{tenant}`; authentication is the same as for the
  DAV endpoints. Server-wide operations need the `server_admin` role.
- Errors are `{"error": {"code": "...", "message": "..."}}`.

Example:

```bash
curl -u admin:password -X POST https://dav.example.com/admin/demo/users \
  -H 'content-type: application/json' \
  -d '{"username":"alice","email":"alice@example.com","password":"…"}'
```
