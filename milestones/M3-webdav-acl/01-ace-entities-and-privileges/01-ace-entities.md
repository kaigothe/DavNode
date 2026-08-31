# Sub-Task: ACE-Entities

## Kontext
ACEs auf Collection- **und** Objekt-Ebene, je Domäne getrennt (Runde 11,
12). Für die WebDAV-Domäne sind das `collection_aces` (für `Collection`)
und `file_aces` (für `FileResource`).

## Aufgabe
- `CollectionAce`-Entity
  (`packages/core/src/entities/collection-ace.entity.ts`): `id` (UUID),
  `collectionId` (FK → Collection), `principalId` (FK → Principal),
  `privilege` (Enum, siehe [Privilege-Katalog](02-privilege-catalog.md)),
  `grantDeny` (Enum `'grant' | 'deny'`), `protected` (Boolean, Default
  `false` — `true` für system-verwaltete ACEs wie die Default-Owner-ACE,
  die nicht per ACL-Methode entfernt werden dürfen), `position`
  (Integer — legt die Auswertungsreihenfolge **innerhalb** der ACEs
  einer Ressource fest, RFC3744 ist reihenfolge-sensitiv, siehe
  [ACL-Evaluation-Engine](../03-acl-evaluation-engine/00-overview.md)),
  `createdAt`
- `FileAce`-Entity analog für `FileResource`
- Migrationen für beide Tabellen; Index auf `(collection_id, position)`
  bzw. `(file_resource_id, position)` (Auswertungsreihenfolge muss
  effizient sortierbar sein)

## Akzeptanzkriterien
- [ ] Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] Mehrere ACEs für dieselbe Ressource lassen sich mit eindeutiger
      `position` anlegen und in dieser Reihenfolge abfragen (Test)
- [ ] `protected = true`-ACEs sind über das Schema von normalen ACEs
      unterscheidbar (kein Soft-Delete-Mechanismus nötig, nur das Flag)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 11, 12
