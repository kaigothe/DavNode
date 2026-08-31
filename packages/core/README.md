# @davnode/core

The DAV-protocol-independent core library: TypeORM entities, the ACL
engine, and shared services — no dependency on Express or any other HTTP
framework. See [planning/04-architecture.md](../../planning/04-architecture.md)
for the overall repo layout.

## Database migrations

Schema changes go through TypeORM migrations, never `synchronize: true`
(disabled explicitly in [`src/db/data-source.ts`](src/db/data-source.ts)).

All migration commands build the package first, since the TypeORM CLI runs
against the compiled `dist/db/cli-data-source.js`, and read the same
`DAVNODE_DB_*` environment variables as the application itself (see
[`src/db/data-source.ts`](src/db/data-source.ts) for the full list).

### One migration history per engine

Migrations live in `src/migrations/{sqlite,postgres,mysql}/`, **one
independent history per database engine**, not one shared history — the
`DataSource` picks the matching directory based on `DAVNODE_DB_TYPE`.

This isn't optional: `migration:generate` bakes literal, driver-specific
SQL into whatever migration file it writes (based on whichever database it
diffed against). A migration generated against SQLite uses syntax both
Postgres and MySQL reject outright — e.g. SQLite/Postgres accept
double-quoted identifiers, but MySQL parses those as string literals and
throws a syntax error; SQLite's `DEFAULT (0)`/`datetime('now')` default
syntax doesn't parse on Postgres either. So a single migration file can
never run correctly on more than one engine — the price of `core`'s
DB-independence (any of the three engines is a supported target) is
generating and maintaining each engine's migration history separately.

**Whenever you change an entity, run `migration:generate` three times**,
once per engine, immediately after applying the same change's previous
migrations to that engine (see the per-engine examples below) — not just
against whichever engine you happen to be developing against:

```bash
npm run migration:generate -- src/migrations/sqlite/AddSomeTable
npm run migration:generate -- src/migrations/postgres/AddSomeTable
npm run migration:generate -- src/migrations/mysql/AddSomeTable
```

(The M1 schema predates this split: `migrations/sqlite/` has one migration
per M1 sub-task, since that's genuinely how the schema grew over time, while
`migrations/postgres/` and `migrations/mysql/` each hold a single
`InitialSchema` migration generated retroactively in one shot — Postgres
and MySQL never ran an earlier version of that schema, so there was no real
history to split into separate steps. Every migration from here on is
generated incrementally, in step, across all three directories.)

Other than living in an engine-specific directory, the workflow is the same
for all three:

```bash
# Apply all pending migrations for the configured engine.
npm run migration:run

# Revert that engine's most recently applied migration.
npm run migration:revert
```

Examples, one per engine:

```bash
# SQLite (a local file)
DAVNODE_DB_TYPE=better-sqlite3 DAVNODE_DB_FILE=./dev.sqlite npm run migration:run

# Postgres (e.g. via `docker compose up -d postgres`)
DAVNODE_DB_TYPE=postgres DAVNODE_DB_HOST=localhost DAVNODE_DB_PORT=5432 \
  DAVNODE_DB_NAME=davnode DAVNODE_DB_USER=davnode DAVNODE_DB_PASSWORD=davnode \
  npm run migration:run

# MySQL (e.g. via `docker compose --profile mysql up -d mysql`)
DAVNODE_DB_TYPE=mysql DAVNODE_DB_HOST=localhost DAVNODE_DB_PORT=3306 \
  DAVNODE_DB_NAME=davnode DAVNODE_DB_USER=davnode DAVNODE_DB_PASSWORD=davnode \
  npm run migration:run
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

## Bootstrapping a first tenant + admin user

There's no admin API yet (that's M9), so
[`src/cli/bootstrap.ts`](src/cli/bootstrap.ts) is the only way to create a
tenant and a user to test against — needed from M2 onward. It creates the
tenant (with its per-tenant special principals), a first user with
`role: 'server_admin'`, and that tenant's WebDAV root collection (owned by
the new user), in one run — so there's immediately something to
PROPFIND/MKCOL/PUT against at `/dav/{tenant}/files/`.

```bash
npm run bootstrap -- \
  --tenant-slug=acme \
  --tenant-name="Acme Inc" \
  --username=admin \
  --email=admin@example.com \
  --password=some-strong-password
```

Reads the same `DAVNODE_DB_*` environment variables as everything else in
this package, e.g. against a local SQLite file:

```bash
DAVNODE_DB_TYPE=better-sqlite3 DAVNODE_DB_FILE=./dev.sqlite npm run bootstrap -- --tenant-slug=acme --tenant-name="Acme Inc" --username=admin --email=admin@example.com --password=some-strong-password
```

In Docker, run it inside the running container:

```bash
docker compose exec app npm run bootstrap -- --tenant-slug=acme --tenant-name="Acme Inc" --username=admin --email=admin@example.com --password=some-strong-password
```

The target database must already have all migrations applied (`npm run
migration:run` first) — bootstrapping is a data-seeding step, kept
separate from schema migration.

Running it twice with the same `--tenant-slug` fails with a clear
"Tenant slug ... is already in use" message and a non-zero exit code,
rather than a raw database error or a duplicate tenant.

**Known limitation**: `--password` is passed as a plain command-line
argument, which is visible to other processes/users on the same machine
(e.g. via `ps aux`) for as long as the command runs. Acceptable for v1,
since this script is only for local development and initial bootstrap —
not a general-purpose user-management tool.
