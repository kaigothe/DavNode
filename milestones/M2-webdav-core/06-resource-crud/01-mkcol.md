# Sub-Task: MKCOL

## Kontext
Legt eine neue Collection an. RFC4918 §9.3: MKCOL darf **keine**
Zwischen-Collections automatisch erzeugen.

## Aufgabe
- `packages/server/src/http/routes/mkcol.route.ts`: legt unter dem
  Ziel-Pfad eine neue `Collection` an, `ownerPrincipalId` = anfragender
  Principal, `parentCollectionId` = aufgelöste Eltern-Collection
- Eltern-Collection existiert nicht → `409 Conflict` (nicht automatisch
  anlegen, nicht `404`)
- Ziel-Pfad existiert bereits (egal ob Collection oder FileResource) →
  `405 Method Not Allowed`
- Request-Body vorhanden (MKCOL ohne Body ist der Normalfall; falls ein
  Body mitgeschickt wird, den der Server nicht versteht) → `415
  Unsupported Media Type` (RFC4918 §9.3.1)
- Bei Erfolg: `collection_changes`-Eintrag auf der Eltern-Collection
  (Aktion `added`), `syncSeq` der Eltern-Collection wird erhöht
- Antwort: `201 Created`

## Akzeptanzkriterien
- [ ] MKCOL unter einer existierenden Eltern-Collection liefert `201`,
      Collection ist danach per PROPFIND sichtbar
- [ ] MKCOL mit fehlender Eltern-Collection liefert `409`
- [ ] MKCOL auf einen bereits existierenden Pfad liefert `405`
- [ ] `collection_changes`-Eintrag und `syncSeq`-Erhöhung sind nach
      erfolgreichem MKCOL nachweisbar (Test liest die Tabelle direkt)

## Nachtrag (Runde 19, sobald M3 existiert)
Sobald [M3 — WebDAV ACL](../../M3-webdav-acl/00-setting-goal.md)
implementiert ist, muss MKCOL zusätzlich
`createOwnerAllAce('collection', newCollection.id, req.principal.id)`
aufrufen (RFC 3744 ist default-deny, siehe
[M3-Default-Owner-ACE-Utility](../../M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md)).
Bis M3 existiert, ist der Zugriff über die M2-Platzhalter-Autorisierung
sichergestellt.

## Nachtrag (Runde 20, sobald M5 existiert)
CardDAV erzeugt Adressbücher spezifikationskonform über **Extended
MKCOL** (RFC 5689): ein MKCOL-Request mit einem `<D:mkcol>`-Body, der
`CARD:addressbook` als zusätzlichen Resourcetype anfordert. Sobald
[M5 — CardDAV](../../M5-carddav/00-setting-goal.md) existiert, muss
dieser Handler einen Body erkennen und in dem Fall statt einer
`Collection` eine `AddressbookCollection` anlegen (siehe
[M5-Extended-MKCOL](../../M5-carddav/03-addressbook-home-and-extended-mkcol/02-extended-mkcol.md)).
Ohne erkannten `CARD:addressbook`-Body bleibt das bisherige Verhalten
(einfache `Collection`) unverändert. Analoges gilt später für
`CALDAV:calendar` in M6.

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 19, 20
