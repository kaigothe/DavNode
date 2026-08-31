# Sub-Task: tsconfig strict je Package

## Kontext
TypeScript im strict-Modus ist für Core und Server verbindlich festgelegt
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 5) —
wichtig, da `@davnode/core` als Library für andere Projekte gedacht ist
und gute Typen braucht.

## Aufgabe
- `tsconfig.base.json` im Root mit gemeinsamen Compiler-Optionen:
  `strict: true`, `target`/`module` passend zu Node 22 (ESM
  empfehlenswert, mit kurzer Begründung als Kommentar im File),
  `declaration: true`, `sourceMap: true`, `skipLibCheck: true`
- Je Package ein `tsconfig.json`, das `tsconfig.base.json` per `extends`
  referenziert und `rootDir`/`outDir` (`src`/`dist`) setzt
- `build`-Script (`tsc -b` oder pro Package `tsc`) in jedem
  Package-`package.json`
- Sicherstellen, dass `npm run build --workspaces` alle drei Packages
  fehlerfrei kompiliert

## Akzeptanzkriterien
- [ ] `npm run build --workspaces` läuft ohne TypeScript-Fehler durch
- [ ] `strict: true` aktiv (kein Package überschreibt das lockernd)
- [ ] `core` erzeugt `.d.ts`-Dateien (wichtig für Library-Nutzung durch
      Dritte)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5
