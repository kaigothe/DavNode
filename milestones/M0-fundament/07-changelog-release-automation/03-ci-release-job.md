# Sub-Task: CI-Release-Job

## Kontext
Baut auf der bestehenden CI-Pipeline
([GitHub Actions: Lint & Test](../05-ci-pipeline/01-github-actions-lint-test.md))
und der [semantic-release-Konfiguration](02-semantic-release-config.md)
auf.

## Aufgabe
- Neuen Job (oder neue Workflow-Datei
  `.github/workflows/release.yml`) anlegen, der bei Push auf `main`
  **nach** erfolgreichem Lint/Build/Test-Job läuft (`needs:` auf den
  bestehenden CI-Job)
- Job führt `npx semantic-release` aus, mit `GITHUB_TOKEN` (Standard-
  Action-Token reicht für `@semantic-release/github`, kein
  zusätzliches Secret nötig)
- Job läuft **nicht** auf Pull-Request-Events, nur auf Push nach `main`
  (Releases entstehen nur aus gemergtem Code)

## Akzeptanzkriterien
- [ ] Workflow führt bei einem Push auf `main` mit mindestens einem
      `feat:`- oder `fix:`-Commit seit dem letzten Release tatsächlich
      einen Release durch (neuer Git-Tag, `CHANGELOG.md`-Eintrag,
      GitHub-Release sichtbar)
- [ ] Ein Push auf `main` **ohne** releaseauslösende Commits (z.B. nur
      `docs:`/`chore:`) führt zu keinem neuen Release (semantic-release
      erkennt das selbst, kein Zusatzcode nötig)
- [ ] Release-Job läuft nicht bei Pull-Request-Events

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 17
