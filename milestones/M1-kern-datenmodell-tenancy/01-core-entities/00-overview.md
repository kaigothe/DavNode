# Große Aufgabe: Core-Domänen-Entities

## Ziel
Die fünf Basis-Entities aus
[planning/05-data-model.md](../../../planning/05-data-model.md)
(Core/Tenancy-Abschnitt) existieren als TypeORM-Entities in
`@davnode/core` mit passenden Migrationen, aufbauend auf dem
Migrations-Workflow aus M0.

## Sub-Tasks
1. [Tenant-Entity](01-tenant-entity.md)
2. [Principal-Entity](02-principal-entity.md)
3. [User-Entity](03-user-entity.md)
4. [Group- & GroupMembership-Entity](04-group-and-membership-entity.md)

Reihenfolge ist bindend: Principal referenziert Tenant, User/Group
referenzieren Principal, GroupMembership referenziert Group + Principal.

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 10 (Principals), Runde 15 (Tenant-Quota/Slug)
