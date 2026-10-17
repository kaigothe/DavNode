# Contributing to DavNode

Thank you for helping. This file takes you from a fresh clone to a green
test run, explains how the code is organised and what a good pull request
looks like. Everything you need is here; the German documents under
`planning/` and `milestones/` are the project's internal planning archive
and are not required reading.

## Getting started

You need **Node.js 22** (see `.nvmrc`) and, only if you want to run against
PostgreSQL or MySQL, **Docker**.

```bash
git clone https://github.com/kaigothe/DavNode.git
cd DavNode
npm install                      # also installs the git hooks (Husky)
npm run build --workspaces       # compile all three packages
npm test                         # all tests; SQLite in memory, no setup
npm run lint                     # ESLint, including the documentation rules
npm run docs                     # API documentation (TypeDoc) into docs/api
```

Tests build their own in-memory SQLite database, so they need no running
services. The test run takes a minute or two. A rare "fetch failed" or
"other side closed" in an HTTP route test is a flaky port reuse between
tests; run the file again before suspecting your change.

To run the server by hand against a real database:

```bash
docker compose --profile mysql up -d postgres mysql   # development databases
DAVNODE_DB_TYPE=postgres DAVNODE_DB_HOST=127.0.0.1 DAVNODE_DB_PORT=5432 \
DAVNODE_DB_NAME=davnode DAVNODE_DB_USER=davnode DAVNODE_DB_PASSWORD=davnode \
  node packages/server/dist/index.js
```

(The first start applies the schema migrations.) The README lists every
environment variable, and its quick start shows the `bootstrap.js` command
that creates a first tenant and administrator; run it with the same
`DAVNODE_DB_*` variables.

## How the code is organised

An npm-workspaces monorepo with three packages:

| Package                                     | Role                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` (`@davnode/core`)           | Everything that is not HTTP: TypeORM entities and migrations, services (tenants, users, groups), the ACL engine, locking, sync, the CalDAV/CardDAV/WebDAV logic, authentication providers, quota. **No dependency on Express.** |
| `packages/server` (`@davnode/server`)       | The Express application: tenant resolution, authentication middleware, one route file per DAV method and resource family, request logging, metrics, the process entry point. Calls into `core`.                                 |
| `packages/admin-api` (`@davnode/admin-api`) | An Express `Router` for the REST admin API; `server` mounts it under `/admin/{tenant}` in the same process.                                                                                                                     |

Dependencies point one way: `server` and `admin-api` depend on `core`,
never the reverse, and share its services instead of duplicating business
logic.

Ideas that recur throughout the code:

- **Multi-tenancy by path.** Every DAV URL starts `/dav/{tenant}/`; a
  middleware resolves the tenant, then authentication resolves the user, and
  routes receive `req.tenant` and `req.principal`.
- **Three resource domains** — WebDAV files, CardDAV address books, CalDAV
  calendars — each with its own entities (a collection, its objects and the
  ACE, lock, property and change-log tables that belong to them) but sharing
  one set of mechanisms: the **ACL engine** (`hasPrivilege`-style functions
  per domain, evaluated in routes through the ACL authorization middleware),
  **lock enforcement** (a covering token in the `If` header, checked by the
  lock-enforcement middleware), and the **change log** with a per-collection
  `syncSeq` that feeds `sync-collection` and `getctag`.
- **Properties** come from _property providers_ registered into a
  per-resource-tree registry; PROPFIND asks the registry, PROPPATCH asks it
  which names are protected. Add a live property by writing a provider and
  registering it where the tree's registry is built.
- **REPORTs** register themselves into a report registry keyed by element
  namespace and name.
- **Authentication is split.** `core` has an `AuthProvider` interface
  (`verify(input)` returns a principal or `null`; no HTTP). `server` has the
  HTTP half per scheme (header parsing, challenges) in middleware that can
  run side by side ("chained" mode). Adding a scheme means a provider plus a
  middleware.
- **Quota** is a running counter changed through `applyQuotaDelta` inside the
  same transaction as the write; a periodic job recomputes the truth.
- **Errors and bodies.** Services throw typed errors (`NotFoundError`,
  `DuplicateEntryError`, ...) that error-handling middleware maps to status
  codes; a malformed request body is an `InvalidRequestBodyError` (400).
- **Logging** goes through the logger the server creates; `core` logs via a
  small sink the server fills. Never log credentials; the logger redacts
  known secret fields as a second line of defence.

## Database changes

Entities change the schema, and **each of the three engines has its own
migration history** (`packages/core/src/migrations/{sqlite,postgres,mysql}/`).
After changing an entity, generate a migration for each engine, restyle it
(class and method TSDoc, `import type`), register the SQLite one in
`migrations/sqlite/index.ts`, and prove it per engine: run, revert, run
again, and check that `migration:generate` then reports no changes.
`packages/core/README.md` has the commands. MySQL is special: DDL is not
transactional, so a failed run leaves a half-migrated database, and it will
not drop an index that backs a foreign key.

## Code conventions

- **English everywhere in code**: identifiers, comments, log output and
  commit messages.
- **TSDoc on every exported function, class, method and interface** under
  `packages/*/src/`, with at least a short description (`@param`/`@returns`
  where they add something). Internal helpers do not need one. `npm run
lint` enforces presence and syntax (`jsdoc/require-jsdoc`,
  `tsdoc/syntax`); it cannot check the language or whether the comment is
  any good — that is for review. Keep a backtick code span on one line of a
  comment; a span that wraps breaks the TSDoc parser.
- **Comments explain why**, in particular where RFC behaviour, a security
  decision or a surprising limitation shaped the code.
- Strict TypeScript, ESLint and Prettier (`npm run format`); run Prettier
  only on the files you change.
- Prefer a failing test first for a bug, and test behaviour through the
  public route or service rather than internals.

## Tests and checks

CI (`.github/workflows/ci.yml`) runs lint, build, the test suite, the litmus
WebDAV conformance suite and Apple's CalDAVTester/CardDAVTester (a ratchet
over the tests that pass today). See [docs/conformance.md](docs/conformance.md)
to run and extend the conformance jobs, and
[docs/operations/backup.md](docs/operations/backup.md) for the weekly
restore test. A change that makes a baseline conformance test fail must fix
the regression, not edit the baseline.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `BREAKING CHANGE:` ...). A
`commit-msg` hook (commitlint + Husky), installed by `npm install`, rejects
anything else. Avoid body lines that start with a word and a colon
(`Note: ...`): commitlint reads them as footers and warns.

The scope in parentheses is typically a package name without the `@davnode/`
prefix (`core`, `server`, `admin-api`) or another area (`repo` for tooling).

```
feat(core): add tenant entity
fix(server): correct WWW-Authenticate header casing
chore(repo): bump typescript to 6.0.4
docs(core): document the migration workflow

feat(core): replace is_admin flag with a role enum

BREAKING CHANGE: User.is_admin is removed; use User.role instead.
```

semantic-release derives the version, `CHANGELOG.md`, tag and GitHub release
from this history on every push to `main`, so a `feat` or `fix` commit is a
release note: describe the user-visible effect.

## Pull requests

1. Open an issue or comment on an existing one for anything beyond a small
   fix, so the approach can be agreed first.
2. Work in small, reviewable commits, each leaving the tests green.
3. A change brings **its tests** and **its TSDoc**; new configuration brings
   its entry in the README's configuration tables and `.env.prod.example`.
4. Run `npm run lint` and `npm test` before pushing; CI runs them again.
5. Explain in the description what changed and why, and what you checked
   (for protocol behaviour, which RFC section or conformance test).

The project's own work is organised as milestones under `milestones/` (a
goal document per milestone and a sub-task file per task, in German). They
are the history of why things are the way they are and a good place to look
for the intent behind a feature, but a pull request does not have to follow
that format.
