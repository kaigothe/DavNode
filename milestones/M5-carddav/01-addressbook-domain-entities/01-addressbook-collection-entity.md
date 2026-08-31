# Sub-Task: AddressbookCollection-Entity

## Kontext
**Kein** selbstreferenzierendes `parent_collection_id` — Adressbücher
verschachteln sich nicht (Klarstellung Runde 20, siehe
[00-setting-goal.md](../00-setting-goal.md)).

## Aufgabe
- `AddressbookCollection`-Entity
  (`packages/core/src/entities/addressbook-collection.entity.ts`): `id`
  (UUID), `tenantId` (FK → Tenant), `ownerPrincipalId` (FK → Principal),
  `displayName`, `description` (nullable, Text —
  `CARD:addressbook-description`), `syncSeq` (Integer, Default `0`),
  `createdAt`, `updatedAt`
- Migration mit FK auf `tenants`, `principals`; Index auf
  `(tenant_id, owner_principal_id)` (schnelles Auflisten aller
  Adressbücher eines Nutzers für die virtuelle Home-Collection, siehe
  [Addressbook-Home & Extended-MKCOL](../../03-addressbook-home-and-extended-mkcol/00-overview.md))
- Ein Nutzer kann **mehrere** Adressbücher besitzen (kein Unique-
  Constraint auf `owner_principal_id` — anders als bei der
  WebDAV-Root-Collection aus M2, die pro Tenant einzigartig sein musste)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite/Postgres/MySQL
- [ ] Zwei Adressbücher desselben Owners können nebeneinander existieren
      (Test)
- [ ] `(tenant_id, owner_principal_id)`-Index vorhanden

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Addressbook-Domäne
