# Sub-Task: Dead-Properties-Tabellen

## Kontext
Gleiches Muster wie bei der WebDAV-Domäne (Runde 18, siehe
[M2-Dead-Properties-Tabellen](../../M2-webdav-core/01-webdav-domain-entities/03-dead-properties-tables.md)).

## Aufgabe
- `AddressbookProperty`- und `AddressObjectProperty`-Entities, analog zu
  `CollectionProperty`/`FileProperty` aus M2: `id`, `<resource>Id` (FK),
  `namespace`, `name`, `value`
- Migrationen; Unique-Index auf `(<resource>_id, namespace, name)`

## Akzeptanzkriterien
- [ ] Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] Gleiche Property zweimal gesetzt überschreibt statt zu duplizieren
      (Test, wie in M2)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Addressbook-Domäne
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 18
