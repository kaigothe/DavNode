# Sub-Task: addressbook-multiget-REPORT

## Kontext
RFC 6352 §8.7. Registriert sich beim
[REPORT-Dispatcher aus M3](../../M3-webdav-acl/06-principals-and-report-infrastructure/02-generic-report-dispatcher.md)
für `{CARD:}addressbook-multiget`. Typisches Client-Muster: erst
`sync-collection` (M4/Große Aufgabe 5) für die Liste der Hrefs, dann
`addressbook-multiget` für die tatsächlichen Inhalte der geänderten
Kontakte.

## Aufgabe
- `packages/core/src/carddav/addressbook-multiget-report.ts`: parst
  eine Liste von `<D:href>`-Elementen + `<D:prop>` (welche Properties
  zurückkommen sollen, meist `getetag` + `CARD:address-data`)
- Für jeden Href: liegt er innerhalb des angefragten Adressbuchs und
  existiert er → `200` mit den angefragten Properties (inkl.
  `CARD:address-data` = roher vCard-Inhalt aus `AddressObjectContent`);
  existiert er nicht (z.B. zwischenzeitlich gelöscht) → `404`
- Hrefs außerhalb des angefragten Adressbuchs werden ignoriert bzw. mit
  `404` beantwortet (keine Cross-Adressbuch-Auflösung)
- Antwort: `207 Multi-Status`, nutzt den Multistatus-Builder aus M2

## Akzeptanzkriterien
- [ ] Multiget mit drei existierenden Hrefs liefert drei `200`-Einträge
      mit korrektem `CARD:address-data`
- [ ] Multiget mit einem zwischenzeitlich gelöschten Href liefert dafür
      `404`, die anderen bleiben `200`
- [ ] Href aus einem anderen Adressbuch liefert `404`, kein Datenleck

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6352 §8.7
