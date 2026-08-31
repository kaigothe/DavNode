# Sub-Task: AddressObject-Retrofit

## Kontext
**Retrofit von M5**: erweitert
[M5 AddressObject-CRUD](../../../M5-carddav/04-address-object-crud/01-address-object-crud-handlers.md)
um Aufrufe von
[applyQuotaDelta](../../01-quota-counter-utility/01-apply-quota-delta.md).
CardDAV kennt kein COPY/MOVE (nicht in M5 gebaut), daher nur PUT/DELETE
zu berücksichtigen — einfacher als der WebDAV-Fall.

## Aufgabe
- **PUT Neuanlage**: `applyQuotaDelta` mit `deltaBytes = +Byte-Länge
  von vcard_data`, dem anfragenden Principal angelastet — vor dem
  Schreiben von `AddressObjectContent`, in derselben Transaktion
- **PUT Überschreiben**: `deltaBytes = neueGröße - alteGröße`, dem
  Eigentümer des bestehenden `AddressObject` angelastet
- **DELETE**: `deltaBytes = -Byte-Länge` des gelöschten
  `AddressObjectContent`
- Byte-Länge wird als UTF-8-Byte-Länge des vCard-Texts gemessen (nicht
  Zeichenzahl — relevant bei Umlauten/Emoji in Namen/Notizen)

## Akzeptanzkriterien
- [ ] PUT eines vCards, das das Limit überschreiten würde, liefert
      `507`, kein Kontakt wird angelegt
- [ ] DELETE eines Kontakts reduziert `quota_used_bytes` um dessen
      tatsächliche Byte-Länge
- [ ] Ein vCard mit Mehrbyte-UTF-8-Zeichen (z.B. Umlaute) wird korrekt
      nach Byte-Länge, nicht Zeichenzahl, angerechnet

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 12, 15
