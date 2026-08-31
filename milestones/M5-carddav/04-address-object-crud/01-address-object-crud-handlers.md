# Sub-Task: AddressObject-CRUD-Handler

## Kontext
Strukturell identisch zu
[M2 GET](../../M2-webdav-core/06-resource-crud/02-get.md)/
[PUT](../../M2-webdav-core/06-resource-crud/03-put.md)/
[DELETE](../../M2-webdav-core/06-resource-crud/04-delete.md), angewendet
auf `AddressObject`/`AddressObjectContent` statt `FileResource`/
`FileContent`. Diese Aufgabe beschreibt **nur die Unterschiede** zum
WebDAV-Vorbild — für alles andere (ETag-Erzeugung per SHA-256,
`If-Match`/`If-None-Match`, `collection_changes`-Äquivalent,
`409` bei fehlendem Adressbuch) gilt dasselbe Verhalten wie dort.

## Aufgabe
- `packages/server/src/http/routes/carddav/{get,put,delete}.route.ts`
  (oder in bestehende generische Routen integriert, falls die
  Content-Type-Weiche das sauber erlaubt)
- **GET**: `Content-Type: text/vcard; charset=utf-8` statt dem
  generischen `FileResource`-`contentType`
- **PUT**:
  - Request-Body muss valides vCard sein (nutzt
    [vCard-Parser-Wrapper](../02-vcard-parsing-and-index/01-vcard-parser-wrapper.md))
    — Parse-Fehler → `400 Bad Request` **vor** jedem Schreibvorgang
  - Die `UID`-Property im vCard-Body muss **innerhalb des Adressbuchs**
    eindeutig sein: legt der Request eine **neue** `AddressObject`-URL
    mit einer `UID` an, die im selben Adressbuch bereits unter einer
    **anderen** URL existiert → `409 Conflict` (RFC 6352 §6.3.2)
  - Bei Neuanlage: [Default-Owner-ACE](../../M3-webdav-acl/01-ace-entities-and-privileges/03-default-owner-ace-utility.md)
    wird angelegt (parametrisiert für `address_object_aces`, siehe
    [Große Aufgabe 5](../05-acl-lock-sync-reuse/00-overview.md))
  - Nach erfolgreichem Schreiben:
    [AddressObjectIndex-Befüllung](../02-vcard-parsing-and-index/02-address-object-index-population.md)
    wird aufgerufen
  - Ziel-Adressbuch existiert nicht → `409` (wie MKCOL/PUT in M2)
- **DELETE**: entfernt `AddressObject` + `AddressObjectContent` +
  zugehörige `AddressObjectIndex`-Zeilen + `AddressObjectProperty`-
  Zeilen transaktional

## Akzeptanzkriterien
- [ ] PUT eines validen vCards legt Kontakt an, GET liefert ihn mit
      `Content-Type: text/vcard`
- [ ] PUT mit ungültigem vCard-Inhalt liefert `400`, kein Schreibvorgang
- [ ] PUT mit einer `UID`, die im selben Adressbuch bereits unter einer
      anderen URL existiert, liefert `409`
- [ ] Nach PUT existieren passende `AddressObjectIndex`-Zeilen (Cross-
      Check mit der vorherigen Aufgabe)
- [ ] DELETE entfernt Content, Index und Dead-Properties vollständig
      (keine verwaisten Zeilen)

## Nachtrag (sobald M8 existiert)
Sobald [M8 — Quota](../../M8-quota/00-setting-goal.md) existiert, rufen
PUT und DELETE `applyQuotaDelta` auf (siehe
[M8-AddressObject-Retrofit](../../M8-quota/03-carddav-caldav-quota-integration/01-address-object-retrofit.md)).
Bis M8 existiert, gibt es keinen Quota-Check.

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6352
