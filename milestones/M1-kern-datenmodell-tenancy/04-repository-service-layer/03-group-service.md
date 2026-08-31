# Sub-Task: GroupService

## Kontext
Analog zu [UserService](02-user-service.md), aber für Gruppen. Reine
Gruppen-CRUD — Mitgliederverwaltung ist bewusst ausgelagert in
[GroupMembershipService](04-group-membership-service.md).

## Aufgabe
- `packages/core/src/services/group.service.ts` mit:
  - `createGroup({ tenantId, name, description? }): Promise<Group>` —
    legt `Principal` (`kind: 'group'`) + `Group` in einer Transaktion an
  - `findGroupByName(tenantId, name): Promise<Group | null>`
  - `deleteGroup(groupId): Promise<void>` — muss zugehörige
    `GroupMembership`-Einträge (als Gruppe UND als Mitglied) mit
    entfernen

## Akzeptanzkriterien
- [ ] `createGroup` legt Principal + Group konsistent an
- [ ] Doppelter `name` im selben Tenant wird mit sprechendem Fehler
      abgelehnt
- [ ] `deleteGroup` hinterlässt keine verwaisten
      `GroupMembership`-Zeilen (weder als Gruppe noch als Mitglied)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
