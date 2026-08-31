# Sub-Task: AddressObject- & AddressObjectContent-Entity

## Kontext
Content-Split wie bei `FileResource`/`FileContent` (M2) und
`CalendarObject`/`CalendarObjectContent` (M6, später). Siehe
[planning/05-data-model.md](../../../planning/05-data-model.md).

## Aufgabe
- `AddressObject`-Entity
  (`packages/core/src/entities/address-object.entity.ts`): `id` (UUID),
  `tenantId` (FK → Tenant), `addressbookId` (FK → AddressbookCollection),
  `uid` (vCard `UID`-Property, **unique innerhalb des Adressbuchs**),
  `etag`, `ownerPrincipalId` (FK → Principal), `createdAt`, `updatedAt`
- `AddressObjectContent`-Entity: `id` (UUID), `addressObjectId` (FK,
  unique), `vcardData` (Blob/Text)
- Migrationen für beide Tabellen; Unique-Index auf
  `(addressbook_id, uid)`

## Akzeptanzkriterien
- [ ] Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] `(addressbook_id, uid)` ist unique (Test: gleiche `UID` in
      **verschiedenen** Adressbüchern ist erlaubt, im **selben**
      Adressbuch nicht)
- [ ] Löschen eines `AddressObject` hinterlässt keine verwaiste
      `AddressObjectContent`-Zeile

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Addressbook-Domäne
