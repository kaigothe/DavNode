# Sub-Task: calendar-multiget-REPORT

## Kontext
RFC 4791 §7.9. Strukturell identisch zu
[M5 addressbook-multiget](../../M5-carddav/06-carddav-reports/01-addressbook-multiget-report.md),
mit `CALDAV:calendar-data` statt `CARD:address-data`.

## Aufgabe
- `packages/core/src/caldav/calendar-multiget-report.ts`: parst eine
  Liste von `<D:href>`-Elementen + `<D:prop>`; für jeden Href: `200` mit
  angefragten Properties (inkl. `CALDAV:calendar-data` = rohes
  `ics_data`) oder `404` bei nicht (mehr) existierendem Href
- `CALDAV:calendar-data` unterstützt optional ein
  `<C:expand start="..." end="...">`-Element (RFC4791 §9.6.5): liefert
  statt des rohen Master+Override-Dokuments **einzeln expandierte**
  Instanzen für den angegebenen Zeitraum (nutzt die
  [Recurrence-Expansion-Utility](../../02-icalendar-parsing-and-time-range-index/02-recurrence-expansion-utility.md))
  — praktisch für Clients, die keine eigene RRULE-Auswertung machen
  wollen

## Akzeptanzkriterien
- [ ] Multiget mit mehreren existierenden Hrefs liefert korrekte
      `CALDAV:calendar-data` je Termin
- [ ] Multiget mit gelöschtem Href liefert `404`, Rest bleibt `200`
- [ ] `<C:expand>` liefert für einen wiederkehrenden Termin mehrere
      einzelne `VEVENT`-Instanzen statt eines RRULE-Dokuments

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4791 §7.9, §9.6.5
