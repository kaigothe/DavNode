# Große Aufgabe: Resource-CRUD (MKCOL/GET/PUT/DELETE)

## Ziel
Die grundlegenden Datei-Operationen funktionieren spezifikationskonform
inkl. ETag-Erzeugung/-Prüfung (Conditional Requests) und korrekter
Konfliktbehandlung (RFC4918: PUT/MKCOL dürfen keine fehlenden
Zwischen-Collections automatisch anlegen).

Jede hier gebaute mutierende Operation (MKCOL/PUT/DELETE) schreibt
zusätzlich einen `collection_changes`-Eintrag und erhöht `syncSeq` auf
der Eltern-Collection — Vorarbeit für das Sync-Token-REPORT in M4, damit
das dort nicht nachträglich in jeden Handler eingebaut werden muss.

## Sub-Tasks
1. [MKCOL](01-mkcol.md)
2. [GET](02-get.md)
3. [PUT](03-put.md)
4. [DELETE](04-delete.md)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Wiederkehrendes Muster (`sync_seq`/`*_changes`)
