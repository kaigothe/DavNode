# Sub-Task: calendar-query-REPORT

## Kontext
RFC 4791 §7.8, die fachlich anspruchsvollste REPORT-Methode. Kombiniert
einen groben, DB-indexierten Vorfilter mit einer präzisen
Recurrence-Auswertung — zwei Phasen, damit nicht bei jeder Anfrage alle
Kalenderobjekte vollständig geparst/expandiert werden müssen.

## Aufgabe
- `packages/core/src/caldav/calendar-query-report.ts`: parst
  `<C:filter>` mit verschachtelten `<C:comp-filter name="VCALENDAR">`
  → `<C:comp-filter name="VEVENT">`, darin optional
  `<C:time-range start="..." end="..."/>` und/oder
  `<C:prop-filter name="SUMMARY">` mit `<C:text-match>` (gleiche
  Match-Types wie bei
  [M5 addressbook-query](../../M5-carddav/06-carddav-reports/02-addressbook-query-report.md):
  `equals`/`contains`/`starts-with`/`ends-with`)
- **Phase 1 (grober DB-Filter)**: SQL-Query auf `CalendarObject` mit
  `dtstart <= rangeEnd AND (recurrence_span_end IS NULL OR
  recurrence_span_end >= rangeStart)` — liefert alle Objekte, die
  **möglicherweise** eine Instanz im Zeitraum haben (Overlap auf
  Spannenebene, noch nicht instanzgenau)
- **Phase 2 (präzise Prüfung)**: für jedes Objekt aus Phase 1
  `expandOccurrences` aus der
  [Recurrence-Expansion-Utility](../../02-icalendar-parsing-and-time-range-index/02-recurrence-expansion-utility.md)
  aufrufen; nur Objekte mit **mindestens einer** tatsächlichen Instanz
  im Zeitraum bleiben im Ergebnis (ein wöchentliches Event kann die
  Spanne überlappen, ohne im konkret angefragten kurzen Zeitraum
  tatsächlich eine Instanz zu haben — Phase 1 filtert nur grob vor)
- `<C:prop-filter>`-Bedingungen (falls vorhanden) werden **zusätzlich**
  auf dem Master-Event geprüft (kein separater Index wie bei CardDAV
  nötig — `SUMMARY` o.ä. wird für die vergleichsweise seltenen
  Property-Filter direkt aus dem geparsten Objekt gelesen, nicht
  vorindexiert, da Zeit-Filter der weit überwiegende Anwendungsfall ist)
- Antwort: `207 Multi-Status`, ein `<D:response>` pro **Ressource**
  (nicht pro Instanz — RFC4791 gibt bei wiederkehrenden Terminen das
  gesamte Objekt zurück, es sei denn `<C:expand>` wurde angefragt, siehe
  [calendar-multiget](01-calendar-multiget-report.md))

## Akzeptanzkriterien
- [ ] `time-range`-Filter findet einen einmaligen Termin im Zeitraum
- [ ] `time-range`-Filter findet einen wiederkehrenden Termin, dessen
      **nächste** Instanz im Zeitraum liegt, auch wenn `dtstart` (erste
      Instanz) weit davor liegt
- [ ] `time-range`-Filter findet **keinen** wiederkehrenden Termin,
      dessen Spanne den Zeitraum zwar überlappt, der aber keine
      tatsächliche Instanz darin hat (Phase-2-Test — reiner
      Phase-1-Treffer reicht nicht)
- [ ] `prop-filter` auf `SUMMARY` mit `contains` findet passende Termine
- [ ] Ein per `EXDATE` ausgeschlossenes Vorkommen im angefragten
      Zeitraum führt **nicht** zu einem Treffer, wenn es die einzige
      Instanz in diesem Zeitraum wäre

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4791 §7.8, §9.9
