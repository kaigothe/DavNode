# Sub-Task: addressbook-query-REPORT

## Kontext
RFC 6352 §8.6. Registriert sich beim REPORT-Dispatcher für
`{CARD:}addressbook-query`. Nutzt
[AddressObjectIndex](../02-vcard-parsing-and-index/00-overview.md) statt
vCard-Blobs zur Query-Zeit zu laden/parsen.

## Aufgabe
- `packages/core/src/carddav/addressbook-query-report.ts`: parst
  `<C:filter test="anyof"|"allof">` (Default `anyof`, RFC6352 §10.5) mit
  einem oder mehreren `<C:prop-filter name="...">`, je mit entweder
  `<C:text-match match-type="...">Text</C:text-match>` (unterstützte
  `match-type`: `equals`, `contains`, `starts-with`, `ends-with` — alle
  vier über SQL `LIKE`/Gleichheit auf `AddressObjectIndex.property_value`
  abbildbar) oder `<C:is-not-defined/>` (Kontakt hat diese Property
  **nicht**)
- `test="allof"`: alle `prop-filter`-Bedingungen müssen zutreffen
  (SQL AND); `test="anyof"`: mindestens eine (SQL OR)
- Filter-Auswertung ausschließlich über `AddressObjectIndex` — **kein**
  Laden/Parsen der vCard-Blobs für die Filter-Entscheidung selbst (nur
  für die finale Response, falls `CARD:address-data` angefragt ist)
- Zusätzlicher optionaler `<C:limit>` (RFC6352 §8.6.1) — Anzahl
  Ergebnisse begrenzen, Server darf serverseitiges Limit erzwingen (fest
  gewählte Obergrenze, z.B. 5000, gegen unbegrenzt große Antworten)
- Antwort: `207 Multi-Status`, gleiche Property-Auswahl-Logik wie
  `addressbook-multiget`

## Akzeptanzkriterien
- [ ] `contains`-Filter auf `EMAIL` findet Kontakte mit passender
      Teilzeichenkette, unabhängig von Groß-/Kleinschreibung
- [ ] `test="allof"` mit zwei Bedingungen liefert nur Kontakte, die
      **beide** erfüllen; `test="anyof"` liefert die Vereinigung
- [ ] `<C:is-not-defined/>` auf `NICKNAME` findet Kontakte ohne
      `NICKNAME`-Property
- [ ] Filter-Auswertung nutzt nachweislich den Index, nicht die
      Blob-Spalte (Test/Review-Punkt: Query-Plan bzw. Code-Pfad prüfen)
- [ ] `<C:limit>` wird respektiert, serverseitiges Hard-Limit greift
      auch ohne Client-Limit

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6352 §8.6
