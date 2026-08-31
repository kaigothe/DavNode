# Sub-Task: Conventional-Commits-Enforcement

## Kontext
semantic-release bestimmt Versionsbumps und Changelog-Einträge
ausschließlich anhand des Commit-Message-Formats (Conventional Commits:
`feat:`, `fix:`, `chore:`, `docs:`, `BREAKING CHANGE:` ...). Ohne
Durchsetzung verlässt sich das komplett auf Disziplin — daher technische
Prüfung vor jedem Commit.

## Aufgabe
- `commitlint` mit der Standard-Konfiguration
  `@commitlint/config-conventional` als Dev-Dependency im Root
  einrichten (`commitlint.config.js`)
- Husky als Git-Hook-Manager einrichten, `commit-msg`-Hook, der
  `commitlint` auf die Commit-Message anwendet
- `npm run prepare`-Script (Standard-Husky-Konvention), das die Hooks
  bei `npm install` installiert
- Kurzer Abschnitt in `CONTRIBUTING.md` (neu, im Root), der das
  Commit-Format mit Beispielen erklärt (`feat(core): add tenant entity`,
  `fix(server): ...`, `BREAKING CHANGE: ...`)

## Akzeptanzkriterien
- [ ] Ein Commit mit ungültiger Message (z.B. `"wip"` ohne Typ) wird vom
      `commit-msg`-Hook abgelehnt
- [ ] Ein Commit im Format `feat(core): ...` wird akzeptiert
- [ ] `npm install` installiert die Husky-Hooks automatisch (frischer
      Checkout + `npm install` reicht, kein manueller Zusatzschritt)

## Referenzen
- [planning/07-coding-conventions.md](../../../planning/07-coding-conventions.md)
