# Sub-Task: Root-Collection-Bootstrap

## Kontext
Das CLI-Bootstrap-Skript aus M1
([milestones/M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling](../../M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling/01-cli-bootstrap-script.md))
kannte die `Collection`-Entity noch nicht (die existiert erst ab M2) und
hat daher keine WebDAV-Root-Collection angelegt. Ohne Root-Collection
kann kein Client per PROPFIND/MKCOL/PUT gegen `/dav/{tenant}/files/`
etwas anfangen.

## Aufgabe
- `packages/core/src/cli/bootstrap.ts` (aus M1) erweitern: nach dem
  Anlegen von Tenant + Admin-User zusätzlich eine Root-Collection
  anlegen (`parentCollectionId: null`, `ownerPrincipalId` = Principal
  des soeben angelegten Admin-Users, `displayName`: z.B. Tenant-Name)
- Idempotenz-Verhalten beibehalten: wiederholter Aufruf mit demselben
  `tenant-slug` bricht weiterhin kontrolliert ab (siehe M1-Akzeptanz-
  kriterien), jetzt inklusive der Prüfung, dass auch keine
  Root-Collection doppelt entsteht

## Akzeptanzkriterien
- [ ] Nach `npm run bootstrap -- ...` existiert für den neuen Tenant
      genau eine Root-Collection, deren Eigentümer der Bootstrap-Admin-
      User ist
- [ ] Bestehende M1-Akzeptanzkriterien des Bootstrap-Skripts (Idempotenz,
      keine Klartext-Logs) bleiben erfüllt

## Nachtrag (Runde 19, sobald M3 existiert)
Sobald [M3 — WebDAV ACL](../../M3-webdav-acl/00-setting-goal.md)
implementiert ist, ist RFC 3744 default-deny: ohne ACE ist auch der
Eigentümer ausgesperrt. Dieser Codepfad muss dann zusätzlich
`createOwnerAllAce('collection', rootCollection.id, adminUser.principalId)`
aufrufen (siehe
[M3-Default-Owner-ACE-Utility](../../M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md)).
Bis M3 existiert, ist der Zugriff über die M2-Platzhalter-Autorisierung
sichergestellt — dieser Nachtrag ist kein Blocker für M2 selbst.

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 18, 19
