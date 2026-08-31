# Sub-Task: Vitest-Setup

## Kontext
Vitest ist das festgelegte Test-Framework
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 7).

## Aufgabe
- Vitest als Dev-Dependency im Root (für alle Workspaces nutzbar)
  einrichten
- `vitest.config.ts` im Root mit Workspace-fähiger Konfiguration
  (Vitest-Workspaces-Feature, das alle drei Packages abdeckt)
- `test`-Script in jedem Package-`package.json` sowie ein
  aggregierendes `test`-Script im Root
- Je Package eine minimale Beispiel-Testdatei (`src/index.test.ts`), die
  den Platzhalter-Export aus der Aufgabe "Monorepo-Scaffold" prüft

## Akzeptanzkriterien
- [ ] `npm test --workspaces` (oder äquivalentes Root-Script) führt alle
      drei Beispiel-Tests aus und sie sind grün
- [ ] Ein absichtlich fehlschlagender Test zeigt einen roten Testlauf
      (Testinfrastruktur funktioniert tatsächlich)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 7
