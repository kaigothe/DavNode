# Sub-Task: ACE-, Lock- & Change-Tabellen

## Kontext
Gleiches Muster wie WebDAV (M2/M3/M4) und Addressbook (M5) — bewusst
knapp gehalten, da etabliert.

## Aufgabe
- `CalendarAce`/`CalendarObjectAce` (Felder wie
  [M3-ACE-Entities](../../M3-webdav-acl/01-ace-entities-and-privileges/01-ace-entities.md))
- `CalendarLock`/`CalendarObjectLock` (Felder wie
  [M4-Lock-Entities](../../M4-locking-sync/01-lock-entities/01-lock-entities.md))
- `CalendarChange` (Felder wie `collection_changes`)
- Migrationen für alle sechs Tabellen
- `privilege` nutzt weiterhin dasselbe
  [Privilege-Katalog-Enum aus M3](../../M3-webdav-acl/01-ace-entities-and-privileges/02-privilege-catalog.md),
  **erweitert** um `CALDAV:read-free-busy` (neu in dieser Milestone,
  siehe [free-busy-query](../../06-caldav-reports/03-free-busy-query-report.md))

## Akzeptanzkriterien
- [ ] Alle sechs Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] Unique-/Index-Constraints entsprechen den WebDAV-/Addressbook-
      Vorbildern

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Calendar-Domäne
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 11, 12
