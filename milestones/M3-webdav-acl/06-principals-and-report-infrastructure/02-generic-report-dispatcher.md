# Sub-Task: Generischer REPORT-Dispatcher

## Kontext
REPORT ist eine einzelne HTTP-Methode, die je nach XML-Root-Element im
Request-Body ein anderes "Report"-Verhalten auslöst (RFC 3253 §3.6, von
RFC3744, RFC6578, RFC4791, RFC6352 jeweils mit eigenen Report-Typen
genutzt). Ein genereller Dispatcher jetzt vermeidet, dass jeder
Meilenstein (M4 sync-collection, M5/M6 CalDAV/CardDAV) seine eigene
REPORT-Routing-Logik baut.

## Aufgabe
- `packages/server/src/http/routes/report.route.ts`: eine einzelne
  Express-Route für die HTTP-Methode `REPORT`, die das Root-XML-Element
  des Bodys liest (z.B. `{DAV:}principal-property-search`) und an einen
  registrierten Handler weiterreicht
- `packages/core/src/webdav/report-registry.ts`: Registry nach dem
  gleichen Muster wie die Auth-Provider-Registry (M1) und die
  Property-Provider-Registry (M2) — Handler registrieren sich unter
  `{namespace}{localName}`
- Unbekannter Report-Typ → `415 Unsupported Media Type` mit
  `<D:supported-report/>`-Fehlerbedingung (RFC3253 §3.6)
- In dieser Aufgabe wird **nur** die Dispatcher-Infrastruktur gebaut;
  der erste konkrete Report
  (`principal-property-search`) folgt im nächsten Sub-Task

## Akzeptanzkriterien
- [ ] Ein registrierter Dummy-Report-Handler wird bei passendem
      Root-Element aufgerufen (Test)
- [ ] Ein nicht registrierter Report-Typ liefert `415`
- [ ] Dispatcher macht keine Annahmen über den konkreten Report-Inhalt
      (funktioniert später auch für sync-collection/M4 und
      calendar-query/M6, ohne selbst geändert zu werden)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 3253 §3.6
