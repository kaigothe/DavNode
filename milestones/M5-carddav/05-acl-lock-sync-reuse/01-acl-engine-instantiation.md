# Sub-Task: ACL-Engine für Addressbücher instanziieren

## Kontext
Die [ACL-Evaluation-Engine aus M3](../../M3-webdav-acl/03-acl-evaluation-engine/00-overview.md)
wurde von Anfang an generisch über den ACE-Tabellentyp gebaut — hier nur
noch Instanziierung, kein Neubau.

## Aufgabe
- `collect-aces.ts` und `evaluate-privilege.ts` (M3) mit
  `AddressbookAce`/`AddressObjectAce` (aus
  [Große Aufgabe 1](../01-addressbook-domain-entities/04-ace-lock-change-tables.md))
  parametrisieren
- Die [Owner-Only-Middleware-Ersetzung aus M3](../../M3-webdav-acl/07-replace-placeholder-authorization/01-replace-owner-only-middleware.md)
  (Privilege-je-Methode-Tabelle) auf CardDAV-Routen anwenden: GET → `read`,
  PUT (Überschreiben) → `write-content`, PUT (Neuanlage)/Extended-MKCOL
  → `bind` auf der Addressbook-Home-Collection bzw. dem Adressbuch,
  DELETE → `unbind` auf dem Adressbuch
- `createOwnerAllAce`-Utility aus M3 auf die neuen ACE-Tabellen erweitern
  (Funktionssignatur um `'addressbook' | 'address-object'` als
  `resourceType` ergänzen)

## Akzeptanzkriterien
- [ ] Alle CardDAV-CRUD-Operationen (Große Aufgabe 4) laufen über die
      echte ACL-Prüfung, kein Owner-Platzhalter
- [ ] Ein Nutzer ohne `read` auf ein fremdes Adressbuch bekommt `403`
      beim Versuch, dessen Kontakte zu lesen
- [ ] Neu angelegte Adressbücher/Kontakte sind für ihren Eigentümer
      sofort zugänglich (Default-Owner-ACE greift, kein Lockout)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20
