# Sub-Task: sync-collection-Handler

## Kontext
Registriert sich beim
[Generischen REPORT-Dispatcher aus M3](../../M3-webdav-acl/06-principals-and-report-infrastructure/02-generic-report-dispatcher.md)
für `{DAV:}sync-collection`. Nutzt
[Sync-Token-Format & Validierung](01-sync-token-format-and-validation.md).

## Aufgabe
- `packages/core/src/webdav/sync/sync-collection-report.ts`: parst
  `<D:sync-token>`, `<D:sync-level>` (nur `"1"` unterstützt — kein
  rekursiver Sync über mehrere Ebenen, konsistent mit der
  `Depth: infinity`-Ablehnung bei PROPFIND aus M2; anderer Wert → `400`),
  `<D:prop>` (welche Properties pro geänderter Ressource zurückkommen)
- Lädt alle `collection_changes`-Einträge der Ziel-Collection mit
  `seq > decodedToken.seq`, sortiert nach `seq`
- **Deduplizierung**: wurde dieselbe Kind-Ressource mehrfach seit dem
  letzten Sync geändert (z.B. `added` dann `modified`), erscheint sie im
  Ergebnis nur **einmal** mit ihrem aktuellen Zustand — Ausnahme: wurde
  sie hinzugefügt **und** seither wieder gelöscht, erscheint sie **gar
  nicht** (für den Client relevant ist nur der Netto-Effekt)
- Für jede (netto) geänderte/neue Ressource: `<D:response>` mit Status
  `200` und den angefragten Properties (nutzt die Property-Provider aus
  M2/M3); für jede (netto) gelöschte Ressource: `<D:response>` mit
  Status `404` (RFC6578 §3.5, kein Property-Block nötig)
- Antwort enthält am Ende `<D:sync-token>` mit dem **neuen** Token
  (aktueller `syncSeq` der Collection)
- Berechtigungsprüfung: `read` auf der Ziel-Collection (über die
  ACL-Evaluation-Engine aus M3), sonst `403`

## Akzeptanzkriterien
- [ ] Initialer Sync (kein/leeres Token) liefert alle aktuell
      vorhandenen Kinder als `200`-Responses
- [ ] Ein Sync mit einem älteren, aber gültigen Token liefert nur die
      Änderungen seither, nicht die gesamte Collection erneut
- [ ] Eine seit dem letzten Sync gelöschte Ressource erscheint mit `404`
- [ ] Eine seit dem letzten Sync hinzugefügte **und** wieder gelöschte
      Ressource erscheint **nicht** im Ergebnis
- [ ] Der zurückgegebene neue Sync-Token führt bei einem weiteren Sync
      korrekt zu "keine Änderungen" (leeres Ergebnis), falls
      zwischenzeitlich nichts passiert ist

## Nachtrag (Runde 20, sobald M5 existiert)
Dieser Handler ist zunächst konkret auf `collection_changes`
zugeschnitten. Sobald [M5 — CardDAV](../../M5-carddav/00-setting-goal.md)
existiert, wird die Change-Log-Abfrage hinter einer kleinen Abstraktion
(z.B. einem "Change-Log-Repository"-Interface, das pro Domäne die
richtige Tabelle anspricht) versteckt, damit `addressbook_changes`
denselben Handler nutzen kann statt einer Kopie. Für M4 selbst ist das
**kein** Blocker.

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6578
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20
