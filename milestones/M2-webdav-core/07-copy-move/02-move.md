# Sub-Task: MOVE

## Kontext
RFC 4918 §9.9. Im Unterschied zu COPY wird die Quelle entfernt und die
**Identität** der Ressource bleibt erhalten (kein neuer Eigentümer).

## Aufgabe
- `packages/server/src/http/routes/move.route.ts`: gleiche
  Header-Auswertung wie COPY (`Destination`, `Overwrite`), **aber**:
  `Depth`-Header ist bei MOVE nur als `infinity` gültig (RFC4918 §9.9.3)
  — jeder andere Wert (insb. `0`) → `400 Bad Request`
- Gleiche Tenant-Grenzen-Regel wie COPY (`403` bei Tenant-Wechsel)
- **Owner bleibt erhalten**: anders als bei COPY behält die verschobene
  Ressource ihren ursprünglichen `ownerPrincipalId` (es ist dieselbe
  Ressource, nur an neuer Stelle — kein Owner-Wechsel)
- Intern: MOVE = Verschieben der Zeile(n) auf die neue
  Eltern-Collection/den neuen Namen (kein Copy+Delete auf DB-Ebene, um
  z.B. `id`/`createdAt` zu erhalten), rekursiv für Collections
- Ziel-Eltern-Collection existiert nicht → `409 Conflict`
- Ziel existiert bereits: `Overwrite: F` → `412`; `Overwrite: T` →
  Ersetzen, Antwort `204` statt `201`
- Bei Erfolg: `collection_changes`-Einträge auf **beiden** betroffenen
  Eltern-Collections (Quelle: `deleted`, Ziel: `added`)

## Akzeptanzkriterien
- [ ] MOVE einer Datei an einen neuen Ort: Datei ist am neuen Pfad
      abrufbar, am alten Pfad `404`, `id` und `createdAt` unverändert
- [ ] MOVE mit `Depth: 0` liefert `400`
- [ ] MOVE einer Collection verschiebt die gesamte Teil-Hierarchie
- [ ] Eigentümer der verschobenen Ressource ist nach dem MOVE
      unverändert derselbe wie vorher
- [ ] MOVE über Tenant-Grenzen hinweg liefert `403`

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
