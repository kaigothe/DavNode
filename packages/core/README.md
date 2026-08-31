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
