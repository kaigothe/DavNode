# Sub-Task: vCard-3.0-Parser-Härtung

## Kontext
[M5s Parser](../../../M5-carddav/02-vcard-parsing-and-index/01-vcard-parser-wrapper.md)
akzeptierte vCard 3.0 bereits "grob" — diese Aufgabe macht das konkret
robust anhand bekannter, in der Praxis auftretender Abweichungen
zwischen vCard 3.0 (RFC 2426) und 4.0 (RFC 6350).

## Aufgabe
- `VERSION:3.0` vs. `VERSION:4.0` explizit verzweigen, nicht nur
  "hoffen, dass es durchrutscht"
- **`ENCODING=QUOTED-PRINTABLE`** dekodieren — in vCard 4.0 nicht mehr
  vorgesehen, aber von manchen älteren Clients (u.a. ältere
  Outlook-Exporte, ältere Adressbuch-Tools) noch für Felder mit
  Sonderzeichen genutzt
- **`TYPE`-Parameter-Syntax**: sowohl `TYPE=HOME;TYPE=VOICE` (mehrere
  Parameter-Instanzen, vCard-3.0-Stil) als auch `TYPE="HOME,VOICE"`/
  `TYPE=HOME,VOICE` (kommagetrennt, vCard-4.0-Stil) korrekt in dieselbe
  interne Repräsentation überführen
- **Unbekannte `X-*`-Extension-Properties** (z.B. Apples `X-ABADR`,
  `X-ABUID`) werden **nicht** verworfen, sondern roh im
  `AddressObjectContent` erhalten (Round-Trip-Fähigkeit: der Client
  bekommt beim nächsten GET exakt das zurück, was er gesendet hat,
  inklusive Extensions, die DavNode selbst nicht interpretiert) — sie
  fließen **nicht** in den Suchindex (M5) ein, da deren Semantik
  unbekannt ist
- Test-Suite mit realen vCard-3.0-Beispielen (aus macOS Contacts.app-
  Exporten älterer Versionen, sofern verfügbar, sonst aus der
  RFC-2426-Spezifikation abgeleitet)

## Akzeptanzkriterien
- [ ] Ein vCard-3.0-Dokument mit `ENCODING=QUOTED-PRINTABLE`-kodierten
      Umlauten wird korrekt dekodiert (Index + Rohinhalt stimmen mit
      dem entkodierten Wert überein)
- [ ] Beide `TYPE`-Syntaxvarianten führen zum selben internen Ergebnis
- [ ] Ein vCard mit `X-ABADR`/anderen unbekannten `X-*`-Properties wird
      angenommen, beim GET unverändert zurückgegeben (Round-Trip-Test)
- [ ] `addressbook-query`-Filter (M5) funktionieren unverändert korrekt
      für vCard-3.0-Dokumente

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md)
