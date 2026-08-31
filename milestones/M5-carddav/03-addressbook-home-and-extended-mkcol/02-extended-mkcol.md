# Sub-Task: Extended-MKCOL

## Kontext
RFC 5689: MKCOL mit einem `<D:mkcol>`-Body statt leerem Body, der
gewünschte Resourcetypes/Properties für die neue Collection angibt.
Erweitert [M2s MKCOL-Handler](../../M2-webdav-core/06-resource-crud/01-mkcol.md)
(dort als Nachtrag bereits referenziert).

## Aufgabe
- `packages/server/src/http/routes/mkcol.route.ts` (aus M2) erweitern:
  Body vorhanden **und** enthält `<D:mkcol>` mit `resourcetype`, der
  `CARD:addressbook` enthält → statt einer `Collection` wird eine
  `AddressbookCollection` unter `/dav/{tenant}/addressbooks/{userId}/{name}/`
  angelegt (`ownerPrincipalId` = anfragender Principal); `displayname`/
  `CARD:addressbook-description` aus dem Body übernehmen, falls
  mitgeschickt
- Ziel-Pfad muss unterhalb der **eigenen** Addressbook-Home-Collection
  liegen (`{userId}` im Pfad muss dem anfragenden Principal
  entsprechen) — sonst `403`
- Body ohne `CARD:addressbook` im `resourcetype` und außerhalb des
  Addressbook-Home-Pfads: bestehendes M2-Verhalten (leere
  `415`-Behandlung bzw. reguläre Collection) bleibt unverändert
- Antwort: `201 Created` mit `<D:mkcol-response>`-Body (RFC5689 §5.1,
  meldet zurück, welche Properties gesetzt wurden)
- Bei Erfolg: [Default-Owner-ACE](../../M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md)-
  Prinzip auch hier anwenden (`createOwnerAllAce('addressbook', ...)`,
  parametrisiert über die neue ACE-Tabelle aus
  [Große Aufgabe 5](../05-acl-lock-sync-reuse/00-overview.md))

## Akzeptanzkriterien
- [ ] Extended-MKCOL mit `CARD:addressbook`-Resourcetype unter der
      eigenen Home-Collection legt ein neues, per PROPFIND sichtbares
      Adressbuch an
- [ ] Extended-MKCOL außerhalb der eigenen Home-Collection liefert `403`
- [ ] Neu angelegtes Adressbuch hat eine Default-Owner-ACE (Owner kann
      sofort Kontakte anlegen, kein Default-Deny-Lockout)
- [ ] Reguläres MKCOL (ohne `CARD:addressbook`-Body) im WebDAV-Baum
      verhält sich weiterhin wie in M2 beschrieben (Regressionstest)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 5689
