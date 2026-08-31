# Sub-Task: resolveGroupsForPrincipal

## Kontext
Erweitert
[GroupMembershipService](../../M1-kern-datenmodell-tenancy/04-repository-service-layer/04-group-membership-service.md)
aus M1 um die Umkehr-Richtung. Muss dieselben Korrektheits-Garantien
bieten wie `resolveEffectiveMembers` (Terminierung auch bei
(fälschlich) vorhandenen Zyklen, Deduplizierung bei Diamant-
Mitgliedschaften).

## Aufgabe
- `resolveGroupsForPrincipal(principalId): Promise<Group[]>` in
  `packages/core/src/services/group-membership.service.ts` ergänzen:
  liefert **alle** Gruppen, in denen der Principal direkt **oder**
  transitiv (über verschachtelte Gruppen) Mitglied ist
- Implementierung: Graph-Traversierung in umgekehrter Kanten-Richtung
  gegenüber `resolveEffectiveMembers`, mit demselben Visited-Set-Schutz
  gegen Zyklen
- Wird von der [ACL-Evaluation-Engine](../03-acl-evaluation-engine/00-overview.md)
  genutzt, um zu prüfen, ob eine ACE, die eine Gruppe als Principal
  referenziert, auf den anfragenden Nutzer zutrifft

## Akzeptanzkriterien
- [ ] Direkte Mitgliedschaft wird gefunden
- [ ] Transitive Mitgliedschaft über zwei verschachtelte Gruppen wird
      gefunden
- [ ] Terminiert auch bei einem (fälschlich) vorhandenen Zyklus in der
      DB (Test analog zu `resolveEffectiveMembers` aus M1)
- [ ] Keine Duplikate bei Diamant-Mitgliedschaften (Principal ist über
      zwei verschiedene Pfade Mitglied derselben Ziel-Gruppe)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5
