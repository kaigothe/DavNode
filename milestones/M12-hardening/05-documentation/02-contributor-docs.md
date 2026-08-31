# Sub-Task: Contributor-Dokumentation

## Kontext
[M0s Conventional-Commits-Aufgabe](../../../M0-fundament/07-changelog-release-automation/01-conventional-commits-enforcement.md)
hat bereits einen `CONTRIBUTING.md`-Abschnitt zum Commit-Format
angelegt — diese Aufgabe vervollständigt die Datei.

## Aufgabe
- `CONTRIBUTING.md` ergänzen: lokales Dev-Setup (`npm install`, Tests
  ausführen, `npm run docs` für die TypeDoc-API-Doku aus
  [M0](../../../M0-fundament/06-code-documentation/00-overview.md)),
  Code-Stil-Verweis auf
  [planning/07-coding-conventions.md](../../../planning/07-coding-conventions.md)
  (TSDoc-Pflicht, Englisch, siehe Runde 17) — **als Zusammenfassung
  formuliert**, nicht als bloßer Link, damit Contributor nicht ins
  interne `planning/`-Archiv wechseln müssen, um die Grundregeln zu
  kennen
- Kurze, **englische** Architektur-Zusammenfassung (Package-Struktur
  `core`/`server`/`admin-api`, Schichtung, ACL-/Lock-/Sync-Muster) —
  eigenständig verständlich, keine Voraussetzung, `planning/04-architecture.md`
  gelesen zu haben (das bleibt internes deutsches Planungsdokument)
- PR-Prozess: Referenz auf die Meilenstein-/Sub-Task-Struktur unter
  `milestones/` als Arbeitsgrundlage, Erwartung an Tests/TSDoc pro PR

## Akzeptanzkriterien
- [ ] `CONTRIBUTING.md` ist vollständig auf Englisch
- [ ] Ein neuer Contributor kann anhand der Datei allein von "Repo
      geklont" bis "erster lokaler Testlauf grün" kommen
- [ ] Architektur-Zusammenfassung ist eigenständig verständlich (kein
      "siehe planning/..." als einzige Erklärung)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 17, 27
