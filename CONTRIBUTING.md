# Contributing to DavNode

## Code language

Code (identifiers, comments, commit messages, log output) is written in
English throughout, even though the planning documents under `planning/`
and `milestones/` are in German.

## TSDoc comments

Every exported function, class, method, and interface in `packages/*/src/`
must have a TSDoc comment (`/** ... */`) with at least a short description.
Internal, non-exported helpers don't require one. This is enforced by
ESLint (`jsdoc/require-jsdoc`, `jsdoc/require-description`,
`tsdoc/syntax`) — `npm run lint` fails on missing or malformed
documentation, but cannot check that a comment is actually written in
English, so that part relies on this convention.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:`, `BREAKING CHANGE:` ...). This is
enforced by a `commit-msg` git hook (commitlint + Husky), installed
automatically by `npm install` — a commit with an invalid message (e.g.
`wip`) is rejected before it's created.

The scope in parentheses is typically a package name without the `@davnode/`
prefix (`core`, `server`, `admin-api`) or another area of the repo (`repo`
for tooling/config changes that aren't scoped to one package).

```
feat(core): add tenant entity
fix(server): correct WWW-Authenticate header casing
chore(repo): bump typescript to 6.0.4
docs(core): document the migration workflow

feat(core): replace is_admin flag with a role enum

BREAKING CHANGE: User.is_admin is removed; use User.role instead.
```

semantic-release uses this history to determine version bumps and
generate `CHANGELOG.md` automatically — see
[milestones/M0-fundament/07-changelog-release-automation](milestones/M0-fundament/07-changelog-release-automation/00-overview.md).
