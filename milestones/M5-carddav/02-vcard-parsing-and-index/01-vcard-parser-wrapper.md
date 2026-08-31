# Sub-Task: vCard-Parser-Wrapper

## Kontext
vCard-Text-Format mit Line-Folding, Multi-Value-Properties und
TYPE-Parametern (RFC 6350 für vCard 4.0; viele reale Clients senden noch
vCard 3.0/RFC 2426). Ein selbstgeschriebener Parser lohnt sich nicht —
eine etablierte Bibliothek nutzen.

## Aufgabe
- Eine gepflegte npm-Bibliothek für vCard-Parsing auswählen und als
  Dependency von `@davnode/core` ergänzen (bei Umsetzung aktuellen
  Ökosystem-Stand prüfen, z.B. `vcard4`/`vcf`-artige Pakete — konkrete
  Wahl hier nicht festgeschrieben, da sich npm-Paketlandschaft seit
  Planungsstand ändern kann)
- `packages/core/src/carddav/vcard-parser.ts`: dünner Wrapper um die
  gewählte Bibliothek mit einer eigenen, stabilen internen
  Repräsentation (`ParsedVCard`), damit ein späterer Bibliothekswechsel
  nicht den gesamten restlichen Code betrifft
- Parser akzeptiert vCard 3.0 **und** 4.0 grob (Basis-Kompatibilität,
  siehe Abgrenzung in
  [00-setting-goal.md](../00-setting-goal.md)) — wirft bei
  offensichtlich fehlerhaftem Input einen klaren Fehler (→ `400 Bad
  Request` beim PUT, siehe
  [AddressObject-CRUD](../04-address-object-crud/00-overview.md))
- Extrahiert mindestens: `UID`, `FN`, `N`, `EMAIL` (mehrfach möglich),
  `TEL` (mehrfach möglich), `ORG`, `NICKNAME`

## Akzeptanzkriterien
- [ ] Ein valides vCard-4.0-Beispiel wird korrekt geparst (alle oben
      genannten Felder extrahiert)
- [ ] Ein valides vCard-3.0-Beispiel wird ebenfalls akzeptiert
- [ ] Ein vCard ohne `UID` wird als Fehler erkannt (UID ist für
      CardDAV-Objektidentität zwingend, siehe
      [AddressObject-Entity](../01-addressbook-domain-entities/02-address-object-and-content-entity.md))
- [ ] Offensichtlich kaputtes Eingabe-Format wirft einen erkennbaren
      Fehler, keinen rohen Parser-Crash

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6350
