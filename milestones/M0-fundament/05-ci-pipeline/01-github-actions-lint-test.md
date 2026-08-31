# Sub-Task: GitHub Actions — Lint & Test

## Kontext
GitHub Actions wurde als CI-Plattform festgelegt
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 7).

## Aufgabe
- `.github/workflows/ci.yml` anlegen mit einem Workflow, der bei Push und
  Pull Request auf allen Branches läuft
- Jobs: Node-22-Setup, `npm ci`, `npm run lint`,
  `npm run build --workspaces`, `npm test --workspaces`
- Test-Job als Matrix über die drei DB-Engines ausführen (Postgres/MySQL
  als Service-Container in der Action, SQLite ohne Service), aufbauend
  auf der Großen Aufgabe "TypeORM & Datenbank-Setup" (Sub-Task
  "DB-Engine-Testmatrix")
- Workflow schlägt sichtbar fehl, wenn Lint, Build oder Tests
  fehlschlagen (kein `continue-on-error`)

## Akzeptanzkriterien
- [ ] Workflow läuft bei einem Test-Push tatsächlich durch (grün) auf dem
      aktuellen Stand von M0
- [ ] Ein absichtlich eingebauter Fehler (z.B. Lint-Verstoß) lässt den
      Workflow sichtbar fehlschlagen
- [ ] DB-Matrix deckt Postgres, MySQL und SQLite ab

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 7
