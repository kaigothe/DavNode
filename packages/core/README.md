# @davnode/core

The DAV-protocol-independent core library: TypeORM entities, the ACL
engine, and shared services — no dependency on Express or any other HTTP
framework. See [planning/04-architecture.md](../../planning/04-architecture.md)
for the overall repo layout.

## Database migrations

Schema changes go through TypeORM migrations, never `synchronize: true`
(disabled explicitly in [`src/db/data-source.ts`](src/db/data-source.ts)).
Migrations live in `src/migrations/` and are compiled to `dist/migrations/`
like any other source file.

All migration commands build the package first, since the TypeORM CLI runs
against the compiled `dist/db/cli-data-source.js`, and read the same
`DAVNODE_DB_*` environment variables as the application itself (see
[`src/db/data-source.ts`](src/db/data-source.ts) for the full list).

```bash
# Generate a migration from the current entity definitions (diffs the
# target database against src/entities/). Requires a reachable database.
npm run migration:generate -- src/migrations/AddSomeTable

# Apply all pending migrations.
npm run migration:run

# Revert the most recently applied migration.
npm run migration:revert
```

Example against a local SQLite file:

```bash
DAVNODE_DB_TYPE=better-sqlite3 DAVNODE_DB_FILE=./dev.sqlite npm run migration:run
```

## Special principals

The RFC 3744 special principals (`DAV:all`, `DAV:authenticated`,
`DAV:unauthenticated`, `DAV:owner`, `DAV:self`) are **per-tenant, not
global singletons**: each tenant gets its own five `Principal` rows
(`kind: 'special'`), not one shared row reused across all tenants. This
matters because ACEs reference a `principal_id` directly — sharing a
single `DAV:all` row across tenants would let an ACE granted against one
tenant's "all" apply to every tenant.

These rows aren't created by any entity or migration in this package;
they're populated by the seed/bootstrap tooling when a tenant is created
(see [milestones/M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling](../../milestones/M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling/00-overview.md)).
See [`src/principals/special-principals.ts`](src/principals/special-principals.ts)
for the supported `specialKind` values and their RFC 3744 XML element
mapping.
