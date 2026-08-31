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
(`feat:`, `fix:`, `chore:`, `docs:`, `BREAKING CHANGE:` ...).
