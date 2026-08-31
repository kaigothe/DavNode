# Große Aufgabe: vCard-Parsing & Suchindex

## Ziel
vCard-Inhalte werden beim Schreiben geparst und in eine durchsuchbare
Indextabelle zerlegt (`AddressObjectIndex`), damit
`addressbook-query`-Filter (Große Aufgabe 6) nicht bei jeder Anfrage
alle vCard-Blobs laden und parsen müssen (löst die in
[planning/05-data-model.md](../../../planning/05-data-model.md) als
"zurückgestellt auf M5" markierte Lücke, siehe Runde 20).

## Sub-Tasks
1. [vCard-Parser-Wrapper](01-vcard-parser-wrapper.md)
2. [AddressObjectIndex-Befüllung](02-address-object-index-population.md)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6350
