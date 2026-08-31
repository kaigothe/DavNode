# Sub-Task: TSDoc-Kommentarpflicht (ESLint-Enforcement)

## Kontext
Alle exportierten Funktionen/Klassen/Interfaces sollen englische
TSDoc-Kommentare bekommen, damit sich später eine API-Dokumentation
generieren lässt
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 17,
[planning/07-coding-conventions.md](../../../planning/07-coding-conventions.md)).
Baut auf der ESLint-Konfiguration aus
[ESLint & Prettier](02-eslint-prettier.md) auf.

## Aufgabe
- `eslint-plugin-tsdoc` (validiert TSDoc-Syntax in Kommentaren) sowie
  eine Regel, die fehlende Dokumentation auf **exportierten** Members
  erkennt (z.B. `eslint-plugin-jsdoc` mit `require-jsdoc`/
  `require-description`, beschränkt auf `export`-Deklarationen —
  interne/private Funktionen sind **nicht** pflichtig, siehe
  [planning/07-coding-conventions.md](../../../planning/07-coding-conventions.md))
- Regel als `error` (nicht nur `warn`) in der ESLint-Konfiguration, damit
  `npm run lint` bei fehlender Doku fehlschlägt
- Sprache wird nicht automatisch erzwungen (ESLint kann nicht prüfen, ob
  ein Kommentar auf Englisch ist) — stattdessen kurzer Hinweis in
  `packages/*/README.md` bzw. einer `CONTRIBUTING.md` im Root, dass
  Kommentare verbindlich auf Englisch zu verfassen sind
- Bestehende Platzhalter-Exports aus M0 Big Task 1 (`VERSION`-Konstante)
  bekommen als Nachweis einen TSDoc-Kommentar

## Akzeptanzkriterien
- [ ] `npm run lint` schlägt fehl, wenn eine exportierte Funktion ohne
      TSDoc-Kommentar hinzugefügt wird (Test: absichtlich eine
      undokumentierte exportierte Funktion einfügen, Lint muss rot sein)
- [ ] Interne, nicht-exportierte Hilfsfunktionen ohne TSDoc-Kommentar
      lösen **keinen** Lint-Fehler aus
- [ ] Der `VERSION`-Export in allen drei Packages hat einen TSDoc-
      Kommentar

## Referenzen
- [planning/07-coding-conventions.md](../../../planning/07-coding-conventions.md)
