# Sub-Task: Dead-Properties-Tabellen

## Kontext
Gleiches Muster wie WebDAV (Runde 18) und Addressbook (M5).

## Aufgabe
- `CalendarProperty`- und `CalendarObjectProperty`-Entities, analog zu
  `AddressbookProperty`/`AddressObjectProperty` aus M5: `id`,
  `<resource>Id` (FK), `namespace`, `name`, `value`
- Migrationen; Unique-Index auf `(<resource>_id, namespace, name)`

## Akzeptanzkriterien
- [ ] Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] Gleiche Property zweimal gesetzt überschreibt statt zu duplizieren

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 18
