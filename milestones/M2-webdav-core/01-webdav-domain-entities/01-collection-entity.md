# Sub-Task: Collection-Entity

## Kontext
Wurzel der WebDAV-Baum-Hierarchie je Tenant (Ordner). Siehe
[planning/05-data-model.md](../../../planning/05-data-model.md).

## Aufgabe
- `Collection`-Entity in
  `packages/core/src/entities/collection.entity.ts`: `id` (UUID),
  `tenantId` (FK → Tenant), `parentCollectionId` (nullable, self-FK →
  Collection — `null` bedeutet Root-Collection des Tenants),
  `ownerPrincipalId` (FK → Principal), `displayName`, `syncSeq`
  (Integer, Default `0` — wird ab M4 für Sync-Token genutzt, in M2 nur
  das Feld anlegen und bei jeder Kind-Änderung hochzählen, siehe
  [Resource-CRUD](../06-resource-crud/00-overview.md)), `createdAt`,
  `updatedAt`
- Migration mit FK auf `tenants`, `principals`, Self-FK auf
  `collections`; Index auf `(tenant_id, parent_collection_id)` (für
  schnelles Kind-Listing bei PROPFIND Depth:1)
- Pro Tenant darf es **genau eine** Root-Collection geben
  (`parent_collection_id IS NULL`) — als Unique-Index auf
  `(tenant_id)` gefiltert auf `parent_collection_id IS NULL` (partieller
  Index, DB-abhängig; falls der gewählte Treiber das nicht sauber
  unterstützt: Anwendungslogik-Prüfung im Service als Fallback
  dokumentieren)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite/Postgres/MySQL
- [ ] Ein zweiter Versuch, eine zweite Root-Collection für denselben
      Tenant anzulegen, wird abgelehnt (Test)
- [ ] `(tenant_id, parent_collection_id)`-Index vorhanden

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
