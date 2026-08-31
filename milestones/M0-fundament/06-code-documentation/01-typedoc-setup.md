# Sub-Task: TypeDoc-Setup

## Kontext
TypeDoc ist das gewählte Tool zur Doku-Generierung aus TSDoc-Kommentaren
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 17).

## Aufgabe
- TypeDoc als Dev-Dependency im Root installieren
- `typedoc.json` im Root mit `entryPointStrategy: "packages"` (liest die
  drei Workspace-Packages automatisch anhand ihrer `package.json`
  `main`/`types`-Felder ein, statt Pfade hart zu verdrahten)
- Ausgabe-Verzeichnis: `docs/api/` (generiert, **nicht** eingecheckt —
  Ergänzung in `.gitignore`)
- `docs`-Script im Root-`package.json` (`typedoc` mit der Config)
- Kurzer Smoke-Test: `npm run docs` läuft durch und erzeugt mindestens
  eine `index.html` pro Package im Ausgabeverzeichnis

## Akzeptanzkriterien
- [ ] `npm run docs` erzeugt HTML-Doku für alle drei Packages ohne
      Fehler/Warnungen zu fehlenden Entry-Points
- [ ] `docs/api/` ist in `.gitignore` (kein generierter Output im Git-
      Verlauf)
- [ ] Der TSDoc-Kommentar des `VERSION`-Exports (aus der
      TSDoc-Enforcement-Aufgabe) taucht sichtbar in der generierten Doku
      auf

## Referenzen
- [planning/07-coding-conventions.md](../../../planning/07-coding-conventions.md)

## Später (nicht Teil dieser Aufgabe)
- Automatische Veröffentlichung der generierten Doku (z.B. GitHub Pages)
  in CI — siehe [planning/03-open-questions.md](../../../planning/03-open-questions.md)
