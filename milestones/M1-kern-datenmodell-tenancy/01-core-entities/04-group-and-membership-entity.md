# Sub-Task: Group- & GroupMembership-Entity

## Kontext
Gruppen sind von Anfang an als ACL-Grant-Ziel vorgesehen
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 5).
Mitglieder werden über `Principal` referenziert (nicht direkt über
`User`), wodurch verschachtelte Gruppen (eine Gruppe als Mitglied einer
anderen Gruppe) möglich sind — siehe
[planning/05-data-model.md](../../../planning/05-data-model.md).

## Aufgabe
- `Group`-Entity in `packages/core/src/entities/group.entity.ts`: `id`
  (UUID), `principalId` (FK → Principal, unique), `tenantId` (FK →
  Tenant), `name` (unique pro Tenant), `description` (nullable)
- `GroupMembership`-Entity in
  `packages/core/src/entities/group-membership.entity.ts`: `id` (UUID),
  `groupId` (FK → Group), `memberPrincipalId` (FK → Principal) —
  Kombination `(group_id, member_principal_id)` ist unique (keine
  doppelten Mitgliedschaften)
- Migration für beide Tabellen
- **Wichtig**: Zyklen-Erkennung (Gruppe A enthält B, B enthält A) wird
  **nicht** hier, sondern als Anwendungslogik im
  [Repository-/Service-Layer](../04-repository-service-layer/00-overview.md)
  umgesetzt (DB-Constraints allein können transitive Zyklen nicht
  verhindern) — hier nur als expliziten Kommentar im Entity-Code
  vermerken, damit es beim Bau des Service-Layers nicht vergessen wird

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite
- [ ] `(group_id, member_principal_id)` ist unique
- [ ] Ein Kommentar im `GroupMembership`-Entity verweist auf die noch
      ausstehende Zyklen-Prüfung im Service-Layer

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Core/Tenancy
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5
