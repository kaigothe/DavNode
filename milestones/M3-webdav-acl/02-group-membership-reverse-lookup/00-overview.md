# Große Aufgabe: Group-Membership-Reverse-Lookup

## Ziel
Die ACL-Evaluation-Engine muss für einen gegebenen Principal alle
Gruppen kennen, in denen er (auch transitiv, über verschachtelte
Gruppen) Mitglied ist — das ist die Umkehrrichtung dessen, was
[M1s GroupMembershipService](../../M1-kern-datenmodell-tenancy/04-repository-service-layer/04-group-membership-service.md)
bisher kann (`resolveEffectiveMembers`: Gruppe → Mitglieder). Diese
Lücke wurde bei der M3-Detailplanung entdeckt.

## Sub-Tasks
1. [resolveGroupsForPrincipal](01-resolve-groups-for-principal.md)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 5 (Gruppen)
