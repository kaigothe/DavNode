# Sub-Task: AddressObjectIndex-Befüllung

## Kontext
Nutzt [vCard-Parser-Wrapper](01-vcard-parser-wrapper.md). Wird von
[AddressObject-CRUD](../04-address-object-crud/00-overview.md) bei
jedem PUT aufgerufen.

## Aufgabe
- `packages/core/src/carddav/index-vcard.ts`: Funktion
  `indexVCard(addressObjectId, parsedVCard)`, die bestehende
  `AddressObjectIndex`-Zeilen für dieses `AddressObject` löscht und aus
  dem geparsten vCard neu befüllt — je Property-Vorkommen eine Zeile
  (z.B. zwei `EMAIL`-Einträge → zwei Indexzeilen mit `property_name =
  'EMAIL'`)
- `property_value` wird für den Vergleich normalisiert (lowercased,
  getrimmt) — Rohwert bleibt unverändert in `AddressObjectContent`
  erhalten, der Index dient **nur** der Suche
- Läuft in derselben Transaktion wie das Schreiben von
  `AddressObjectContent` (Konsistenz: Index und Inhalt dürfen nie
  auseinanderlaufen)

## Akzeptanzkriterien
- [ ] Nach PUT eines vCards mit zwei `EMAIL`-Adressen existieren zwei
      `AddressObjectIndex`-Zeilen mit `property_name = 'EMAIL'`
- [ ] Ein erneutes PUT (Update) ersetzt die Indexzeilen vollständig
      (keine Altlasten von vorherigen Werten)
- [ ] Groß-/Kleinschreibung beim gespeicherten `property_value`
      spielt für spätere Suchen keine Rolle (Normalisierungs-Test)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 20
