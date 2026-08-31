# Sub-Task: CalendarObject-Index-Befüllung

## Kontext
Nutzt [iCalendar-Parser-Wrapper](01-icalendar-parser-wrapper.md) und
[Recurrence-Expansion-Utility](02-recurrence-expansion-utility.md). Wird
von [CalendarObject-CRUD](../../04-calendar-object-crud/00-overview.md)
bei jedem PUT aufgerufen.

## Aufgabe
- `packages/core/src/caldav/index-calendar-object.ts`: Funktion
  `indexCalendarObject(calendarObjectId, parsedObject)`, die die
  Time-Range-Index-Spalten auf `CalendarObject` (siehe
  [CalendarObject-Entity](../../01-calendar-domain-entities/02-calendar-object-and-content-entity.md))
  aus dem **Master**-Event befüllt: `dtstart`, `dtend` (aus `DTEND` oder
  `DTSTART + DURATION` berechnet), `isAllDay`, `transparency`, `status`
- `recurrenceSpanEnd` über `computeRecurrenceSpanEnd` aus der
  Recurrence-Expansion-Utility berechnen
- Läuft in derselben Transaktion wie das Schreiben von
  `CalendarObjectContent` (Konsistenz zwischen Index und Inhalt)

## Akzeptanzkriterien
- [ ] Nach PUT eines einmaligen Termins sind `dtstart`/`dtend` korrekt
      gesetzt, `recurrenceSpanEnd` gleich `dtend`
- [ ] Nach PUT eines wiederkehrenden Termins mit `COUNT` ist
      `recurrenceSpanEnd` das berechnete Enddatum der letzten Instanz
- [ ] Nach PUT eines unbegrenzt wiederkehrenden Termins ist
      `recurrenceSpanEnd` `null`
- [ ] Ein erneutes PUT (Update) aktualisiert alle Index-Spalten korrekt
      (keine Altwerte)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 21
