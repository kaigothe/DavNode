# Sub-Task: Group-CRUD

## Kontext
Dünner REST-Wrapper um
[GroupService aus M1](../../../M1-kern-datenmodell-tenancy/04-repository-service-layer/03-group-service.md)
— keine neue Geschäftslogik.

## Aufgabe
- `POST /admin/{tenantSlug}/groups` — `name`, `description`
- `GET /admin/{tenantSlug}/groups` / `GET .../groups/{groupId}`
- `DELETE /admin/{tenantSlug}/groups/{groupId}` — nutzt
  `GroupService.deleteGroup` (M1, entfernt bereits sauber alle
  `GroupMembership`-Zeilen) — **keine** Bestätigungspflicht nötig
  (deutlich kleinerer Blast-Radius als Tenant-/User-Löschung: eine
  Gruppe hat keine eigenen Ressourcen, nur Mitgliedschaften und
  ggf. ACEs, die sie als Principal referenzieren)
- Löschen einer Gruppe, die noch in ACEs referenziert wird (z.B. eine
  Collection gewährt der Gruppe Zugriff): ACEs werden **nicht**
  automatisch entfernt, verweisen danach auf eine nicht mehr
  existierende Gruppen-Principal-Zeile — **Achtung**: da `Principal`
  über `ON DELETE CASCADE` von `Group` abhängt (siehe
  [Tenant-Löschung](../../03-tenant-management/02-tenant-deletion.md)-
  Audit), werden ACEs, die auf diesen Principal verweisen, ebenfalls
  automatisch mitgelöscht (falls deren FK ebenfalls kaskadiert) — im
  selben Audit sicherstellen, dass das gewünschte Verhalten ist
  (verwaiste Grants verschwinden, statt als tote Referenz stehen zu
  bleiben)

## Akzeptanzkriterien
- [ ] `POST`/`GET`/`DELETE` funktionieren wie erwartet
- [ ] Löschen einer Gruppe mit bestehenden ACE-Grants entfernt auch
      diese ACEs (keine toten Principal-Referenzen)
- [ ] Doppelter Gruppenname im selben Tenant liefert `409`

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5
