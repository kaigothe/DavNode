# Sub-Task: npm-Workspaces initialisieren

## Kontext
DavNode nutzt npm Workspaces als Monorepo-Tooling (kein pnpm/Turborepo),
siehe [planning/01-decisions.md](../../../planning/01-decisions.md) Runde 7.

## Aufgabe
- Root-`package.json` im Projekt-Root anlegen mit:
  - `name`: `davnode` (Root-Package, wird nicht veröffentlicht —
    `"private": true`)
  - `workspaces`: `["packages/*"]`
  - `engines.node`: `>=22` (Node 22 LTS, siehe Runde 7)
- Verzeichnis `packages/` anlegen (leer, wird im nächsten Sub-Task befüllt)
- `.gitignore` für Node/TypeScript-Projekte anlegen (`node_modules`,
  `dist`, `.env`, `coverage`, Editor-Artefakte)
- `.nvmrc` mit der Node-22-LTS-Version anlegen

## Akzeptanzkriterien
- [ ] `npm install` im Root läuft ohne Fehler (auch wenn `packages/`
      noch leer ist)
- [ ] Root-`package.json` enthält `"private": true` und `workspaces`
- [ ] `.gitignore` vorhanden und deckt `node_modules`/`dist`/`.env` ab

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 7
