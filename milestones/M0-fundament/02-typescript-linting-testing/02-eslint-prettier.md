# Sub-Task: ESLint & Prettier

## Kontext
Konsistenter Code-Stil über das gesamte Monorepo, als Teil des
M0-Fundaments ([planning/02-roadmap.md](../../../planning/02-roadmap.md)).

## Aufgabe
- ESLint mit TypeScript-Unterstützung (`@typescript-eslint`) im Root
  konfigurieren, für alle Workspaces gültig
- Prettier als Formatierungs-Tool ergänzen, ESLint/Prettier-Konflikte
  auflösen (`eslint-config-prettier`)
- `lint`-Script im Root-`package.json` (`eslint . --ext .ts`) und
  `format`-Script (`prettier --write .`)
- Sinnvolle Basis-Regeln aktivieren (keine übermäßig strengen
  Stilregeln, Fokus auf Fehlervermeidung: `no-unused-vars`,
  `no-floating-promises` o.ä.)

## Akzeptanzkriterien
- [ ] `npm run lint` läuft im Root über alle Packages
- [ ] Ein absichtlich fehlerhaftes Test-File (z.B. ungenutzte Variable)
      wird von ESLint erkannt
- [ ] Prettier und ESLint widersprechen sich nicht (kein Regel-Konflikt)

## Referenzen
- [planning/02-roadmap.md](../../../planning/02-roadmap.md) — M0
