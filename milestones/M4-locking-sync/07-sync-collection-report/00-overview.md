# Große Aufgabe: sync-collection-REPORT

## Ziel
Clients können per `sync-collection`-REPORT nur die Änderungen seit
ihrem letzten Sync abrufen (RFC 6578), statt jedes Mal die gesamte
Collection per PROPFIND neu zu laden. Nutzt die seit M2 mitgeschriebenen
`collection_changes`-Einträge und `syncSeq`-Zähler sowie den
REPORT-Dispatcher aus M3.

## Sub-Tasks
1. [Sync-Token-Format & Validierung](01-sync-token-format-and-validation.md)
2. [sync-collection-Handler](02-sync-collection-handler.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6578
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Wiederkehrendes Muster (`sync_seq`/`*_changes`)
