# Sub-Task: ACE-, Lock- & Change-Tabellen

## Kontext
Gleiches Muster wie bei der WebDAV-Domäne — an dieser Stelle bewusst
knapp gehalten, da das Muster durch M3/M4 bereits etabliert ist. Bei
Unklarheiten dienen die dort verlinkten Dateien als Vorlage.

## Aufgabe
- `AddressbookAce`/`AddressObjectAce` (Felder wie
  [M3-ACE-Entities](../../M3-webdav-acl/01-ace-entities-and-privileges/01-ace-entities.md):
  `id`, `<resource>Id`, `principalId`, `privilege`, `grantDeny`,
  `protected`, `position`, `createdAt`)
- `AddressbookLock`/`AddressObjectLock` (Felder wie
  [M4-Lock-Entities](../../M4-locking-sync/01-lock-entities/01-lock-entities.md):
  `id`, `<resource>Id`, `principalId`, `token`, `scope`, `depth` (nur
  bei `AddressbookLock`), `timeoutSeconds`, `expiresAt`, `ownerInfo`,
  `createdAt`)
- `AddressbookChange` (Felder wie `collection_changes`: `id`,
  `addressbookId`, `addressObjectId` (nullable, denormalisierte
  `uid`/Name für Löschungen), `action`, `seq`)
- Migrationen für alle sechs Tabellen, gleiche Index-Strategie wie die
  WebDAV-Vorbilder (`position` bei ACEs, `token` bei Locks, `seq` bei
  Changes)
- **Wichtig**: `privilege` nutzt dasselbe
  [Privilege-Katalog-Enum aus M3](../../M3-webdav-acl/01-ace-entities-and-privileges/02-privilege-catalog.md)
  — keine eigene, separate Privilege-Liste für CardDAV in M5 (CardDAV-
  spezifische Privileges sind ohnehin nicht in RFC 6352 definiert)

## Akzeptanzkriterien
- [ ] Alle sechs Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] Unique-/Index-Constraints entsprechen 1:1 den WebDAV-Vorbildern
      (Cross-Check gegen M2/M3/M4-Dateien)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Addressbook-Domäne
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 11, 12
