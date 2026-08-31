# Sub-Task: User-Entity

## Kontext
Siehe [planning/05-data-model.md](../../../planning/05-data-model.md) —
User referenziert genau einen Principal (1:1) und trägt die User-Quota
(zusätzlich zur Tenant-Quota, Runde 15).

## Aufgabe
- `User`-Entity in `packages/core/src/entities/user.entity.ts`: `id`
  (UUID), `principalId` (FK → Principal, **unique**), `tenantId` (FK →
  Tenant, redundant zu `Principal.tenantId`, aber für Query-Performance
  direkt auf `User` — muss beim Anlegen mit dem `tenantId` des
  referenzierten Principals übereinstimmen), `username` (unique **pro
  Tenant**, nicht global), `email`, `quotaLimitBytes` (nullable),
  `quotaUsedBytes` (default 0), `createdAt`
- Migration für `users`-Tabelle: FK auf `principals` (unique) und
  `tenants`, zusammengesetzter Unique-Index auf `(tenant_id, username)`
- Test: zwei User mit demselben `username` in **unterschiedlichen**
  Tenants sind erlaubt; im **selben** Tenant nicht

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite
- [ ] `(tenant_id, username)` ist unique, `username` allein nicht
- [ ] `principal_id` ist unique (ein Principal gehört zu höchstens einem
      User)
- [ ] Test für den Tenant-Scoping-Fall (gleicher Username, andere
      Tenants → erlaubt) vorhanden

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Core/Tenancy
