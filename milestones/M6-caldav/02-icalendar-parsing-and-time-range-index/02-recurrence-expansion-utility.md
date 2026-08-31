# Sub-Task: Recurrence-Expansion-Utility

## Kontext
Kernstück der CalDAV-Zeitlogik. Wird von der
[Index-Befüllung](03-calendar-object-index-population.md) (Berechnung
von `recurrence_span_end`) **und** von
[calendar-query](../../06-caldav-reports/02-calendar-query-report.md)
(präzise Prüfung, ob eine Ressource im angefragten Zeitraum wirklich
eine Instanz hat) genutzt.

## Aufgabe
- `packages/core/src/caldav/expand-recurrence.ts`: Funktion
  `expandOccurrences(parsedObject: ParsedCalendarObject, rangeStart: Date, rangeEnd: Date): Occurrence[]`
  — liefert alle tatsächlichen Vorkommen (Start/Ende) innerhalb des
  angefragten Zeitraums:
  1. Basis-Vorkommen aus `RRULE` (falls vorhanden) plus `RDATE`
     berechnen, begrenzt auf `[rangeStart, rangeEnd]` (die
     Bibliotheks-Iterator-Funktion aus
     [iCalendar-Parser-Wrapper](01-icalendar-parser-wrapper.md) nutzen —
     **kein** eigener RRULE-Interpreter)
  2. Durch `EXDATE` ausgeschlossene Vorkommen entfernen
  3. Vorkommen, für die ein `RECURRENCE-ID`-Override existiert, durch
     dessen (ggf. verschobene) Zeit **ersetzen** — das Override kann
     dabei auch außerhalb des ursprünglichen RRULE-Rhythmus liegen
     (z.B. ein einzelner Termin um zwei Tage verschoben)
  4. Kein `RRULE`: einzelnes Vorkommen aus `dtstart`/`dtend` des Masters
     (falls im Zeitraum)
- `computeRecurrenceSpanEnd(parsedObject): Date | null` — für die
  Index-Befüllung: `UNTIL` direkt übernehmen; bei `COUNT` die
  `COUNT`-te Instanz berechnen (bibliotheksgestützt, endliche
  Berechnung); ohne beides: `null` (unbegrenzt)

## Akzeptanzkriterien
- [ ] Wöchentliches `RRULE` über 3 Monate liefert für einen 1-Monats-
      Zeitraum genau die Vorkommen in diesem Monat
- [ ] Ein `EXDATE` entfernt genau die betroffene Instanz, keine andere
- [ ] Ein `RECURRENCE-ID`-Override mit verschobener Zeit taucht **an
      der neuen Zeit** auf, nicht an der ursprünglich errechneten
- [ ] `computeRecurrenceSpanEnd` liefert `null` für `FREQ=DAILY` ohne
      `UNTIL`/`COUNT`, und ein konkretes Datum für `COUNT=10`
- [ ] Zeitzone-Behandlung: ein `RRULE` mit `TZID` liefert Vorkommen in
      der korrekten lokalen Zeit, nicht UTC-verschoben (Test mit
      DST-Übergang, z.B. Wechsel Sommer-/Winterzeit innerhalb der
      Wiederholungsserie)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 5545 §3.3.10, RFC 4791 §9.9
