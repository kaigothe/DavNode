# Sub-Task: PROPPATCH-Handler

## Kontext
Nutzt die Infrastruktur aus
[WebDAV-XML- & Property-Infrastruktur](../03-webdav-xml-property-infrastructure/00-overview.md)
(insbesondere `isLiveProperty` aus der Property-Provider-Abstraktion) und
die Dead-Properties-Tabellen aus
[Dead-Properties-Tabellen](../01-webdav-domain-entities/03-dead-properties-tables.md).

## Aufgabe
- `packages/server/src/http/routes/proppatch.route.ts`: parst den
  Request-Body in `set`-/`remove`-Anweisungen (mehrere pro Request
  möglich)
- **Atomarität (RFC4918 §9.2, wichtigster Punkt dieser Aufgabe)**: alle
  `set`/`remove`-Anweisungen eines Requests werden in einer
  DB-Transaktion verarbeitet — entweder werden **alle** übernommen, oder
  **keine** (z.B. wenn eine Anweisung eine Live-Property betrifft und
  damit fehlschlägt, dürfen bereits "erfolgreich" verarbeitete
  Dead-Property-Änderungen im selben Request **nicht** bestehen bleiben)
- Versuch, eine Live-Property zu setzen/entfernen → gesamter Request
  schlägt fehl, betroffene Property bekommt `403 Forbidden`
  (`cannot-modify-protected-property`), alle anderen Properties im
  selben Request bekommen `424 Failed Dependency` (RFC4918-Standard-
  verhalten für "wäre erfolgreich gewesen, aber der Request wurde als
  Ganzes abgelehnt")
- `remove` einer nicht existierenden Dead-Property ist **kein** Fehler
  (RFC4918: idempotent, Erfolg wird gemeldet)
- Antwort: `207 Multi-Status` mit `<D:propstat>` pro Property (Status
  `200` für erfolgreich, `403`/`424` wie oben)

## Akzeptanzkriterien
- [ ] Ein Request mit ausschließlich gültigen Dead-Property-Änderungen
      wird vollständig übernommen (Test: erneutes PROPFIND zeigt die
      neuen Werte)
- [ ] Ein Request, der eine Live-Property **und** eine gültige
      Dead-Property in derselben Anfrage ändern will, lehnt **beide**
      ab (Atomaritäts-Test: Dead-Property-Änderung ist nach dem Request
      **nicht** wirksam)
- [ ] `remove` einer nicht vorhandenen Property liefert `200`, keinen
      Fehler
- [ ] Zwei PROPPATCH-Requests auf dieselbe Property (unterschiedliche
      Werte) überschreiben sich korrekt (kein Duplikat in der
      `*_properties`-Tabelle)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4918
