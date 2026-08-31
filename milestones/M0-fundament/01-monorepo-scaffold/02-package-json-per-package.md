# Sub-Task: package.json je Package anlegen

## Kontext
Drei Packages gemäß [planning/04-architecture.md](../../../planning/04-architecture.md):
`@davnode/core` (Express-unabhängig), `@davnode/server` (Express-Wrapper,
hängt von core ab), `@davnode/admin-api` (Verwaltungsschicht, hängt von
core ab).

## Aufgabe
Für jedes der drei Packages (`packages/core`, `packages/server`,
`packages/admin-api`):
- `package.json` mit `name` (`@davnode/core` etc.), `version: 0.0.1`,
  `private: true` (noch nicht auf npm veröffentlichen), `main`/`types`
  auf `dist/index.js`/`dist/index.d.ts`
- `src/index.ts` mit einem minimalen Platzhalter-Export (z.B.
  `export const VERSION = '0.0.1';`)
- `server` und `admin-api` erhalten `@davnode/core` als `dependency`
  (Workspace-Referenz, z.B. `"@davnode/core": "*"` via npm workspaces)
- `core` hat **keine** Abhängigkeit zu express oder einem anderen
  HTTP-Framework (Architekturregel aus
  [planning/04-architecture.md](../../../planning/04-architecture.md))

## Akzeptanzkriterien
- [ ] Alle drei Packages sind über `npm ls --workspaces` sichtbar
- [ ] `server` und `admin-api` können `import { VERSION } from '@davnode/core'`
      nutzen (Workspace-Verlinkung funktioniert)
- [ ] `core`s `package.json` hat keine express-Abhängigkeit

## Referenzen
- [planning/04-architecture.md](../../../planning/04-architecture.md)
