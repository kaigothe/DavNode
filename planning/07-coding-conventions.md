# Coding-Konventionen

Ergänzung zu [01-decisions.md](01-decisions.md) Runde 17. Gilt ab sofort
für alle Code-Aufgaben in `milestones/`, auch rückwirkend für bereits
ausgearbeitete Sub-Tasks (M1), die noch nicht implementiert sind.

## Sprache
Code (Identifiers, Kommentare, Commit-Messages, Log-Ausgaben) ist
durchgehend **Englisch** — unabhängig davon, dass die Planungsdokumente
unter `planning/`/`milestones/` auf Deutsch verfasst sind.

## TSDoc-Kommentarpflicht
- Jede exportierte Funktion, Klasse, Methode und jedes Interface in
  `packages/*/src/` bekommt einen TSDoc-Kommentar (`/** ... */`) mit
  mindestens einer Kurzbeschreibung; bei nicht-trivialen Parametern/
  Rückgabewerten zusätzlich `@param`/`@returns`
- Interne/private Hilfsfunktionen: TSDoc empfohlen, aber nicht zwingend
  — die Pflicht gilt für die öffentliche API der Packages (das, was
  `@davnode/core` als Library nach außen zeigt)
- Durchgesetzt über ESLint (`eslint-plugin-tsdoc` bzw. entsprechende
  jsdoc-Regeln für exportierte Member) — siehe
  [milestones/M0-fundament/02-typescript-linting-testing](../milestones/M0-fundament/02-typescript-linting-testing/00-overview.md)

## Doc-Generierung
TypeDoc erzeugt aus den TSDoc-Kommentaren eine statische API-Doku über
alle drei Packages hinweg — siehe
[milestones/M0-fundament/06-code-documentation](../milestones/M0-fundament/06-code-documentation/00-overview.md).

## Commit-Konvention & Releases
- Commits folgen Conventional Commits (`feat:`, `fix:`, `chore:`,
  `docs:`, `BREAKING CHANGE:` ...), durchgesetzt via commitlint +
  Husky-Hook
- semantic-release wertet diese Commits aus und erzeugt automatisch
  Versionsnummer, `CHANGELOG.md`, Git-Tag und GitHub-Release bei jedem
  Push auf `main` — siehe
  [milestones/M0-fundament/07-changelog-release-automation](../milestones/M0-fundament/07-changelog-release-automation/00-overview.md)
- Eine gemeinsame Versionsnummer für das gesamte Repo (kein
  Independent-Versioning je Package), solange die Packages `private`
  bleiben — siehe [01-decisions.md](01-decisions.md) Runde 17
