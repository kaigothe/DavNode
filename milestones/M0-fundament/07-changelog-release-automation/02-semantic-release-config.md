# Sub-Task: semantic-release-Konfiguration

## Kontext
Eine gemeinsame Versionsnummer für das gesamte Repo (kein
Independent-Versioning je Package), siehe
[planning/01-decisions.md](../../../planning/01-decisions.md) Runde 17.
Baut auf [Conventional-Commits-Enforcement](01-conventional-commits-enforcement.md)
auf.

## Aufgabe
- `semantic-release` als Dev-Dependency im Root, `.releaserc.json` (oder
  `release.config.js`) mit den Standard-Plugins:
  - `@semantic-release/commit-analyzer` (Versionsbump aus Commits ableiten)
  - `@semantic-release/release-notes-generator`
  - `@semantic-release/changelog` (schreibt `CHANGELOG.md` im Root)
  - `@semantic-release/npm` — **mit `npmPublish: false`**, da Packages
    `private` bleiben (v1 nutzt nur die lokale `version`-Feld-
    Aktualisierung in den `package.json`-Dateien, kein Registry-Publish)
  - `@semantic-release/git` (committet `CHANGELOG.md` + Versionsbumps
    zurück ins Repo)
  - `@semantic-release/github` (erstellt GitHub-Release + Tag)
- Branch-Konfiguration: nur `main` löst Releases aus
- Root-`package.json`-Version wird von semantic-release verwaltet — bei
  den drei Workspace-Packages (`core`/`server`/`admin-api`) wird die
  Versionsnummer **synchron mitgezogen** (gleiche Versionsnummer wie
  Root), damit die "eine gemeinsame Version"-Entscheidung auch für die
  Packages selbst gilt

## Akzeptanzkriterien
- [ ] `npx semantic-release --dry-run` läuft lokal ohne Konfigurationsfehler
      durch (kein echter Release, nur Validierung)
- [ ] Konfiguration verweist explizit auf `npmPublish: false`
- [ ] Alle drei Package-Versionsnummern werden bei einem simulierten
      Release synchron aktualisiert (Test/Dry-Run-Nachweis)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 17
