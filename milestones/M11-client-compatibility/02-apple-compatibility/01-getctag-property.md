# Sub-Task: getctag-Property

## Kontext
`{http://calendarserver.org/ns/}getctag` ist kein RFC-Standard, sondern
eine von Apples CalendarServer eingeführte De-facto-Property, die
praktisch alle CalDAV/CardDAV-Clients (nicht nur Apple) inzwischen
nutzen, um mit **einem** PROPFIND zu prüfen, ob sich in einer Collection
überhaupt etwas geändert hat, bevor ein teurer `sync-collection`-REPORT
(M4) folgt. Lässt sich direkt aus dem seit M2 vorhandenen
`sync_seq`-Zähler ableiten — kein neues Tracking nötig.

## Aufgabe
- `packages/core/src/webdav/properties/getctag-provider.ts`:
  registriert `{http://calendarserver.org/ns/}getctag` über den seit M2
  etablierten Property-Provider-Registry-Mechanismus für alle drei
  Collection-Typen (`Collection`, `CalendarCollection`,
  `AddressbookCollection`)
- Wert: `String(collection.syncSeq)` (einfach, monoton steigend,
  ändert sich bei jeder Kind-Änderung — erfüllt die einzige Anforderung
  an ein CTag: "ändert sich, wenn sich der Collection-Inhalt ändert")

## Akzeptanzkriterien
- [ ] PROPFIND mit `prop`-Request für `getctag` liefert den aktuellen
      `syncSeq`-Wert als String
- [ ] Nach einer Änderung an der Collection (z.B. neue Datei/neuer
      Kontakt/neuer Termin) liefert ein erneutes PROPFIND einen
      **anderen** `getctag`-Wert
- [ ] `getctag` funktioniert identisch für alle drei Collection-Typen

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md)
