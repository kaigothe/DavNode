# Sub-Task: iTIP-Message-Builder

## Kontext
RFC 5546 definiert den Inhalt von `METHOD:REQUEST`/`REPLY`/`CANCEL`-
Nachrichten. Baut auf der internen `ParsedCalendarObject`-Repräsentation
aus M6 auf.

## Aufgabe
- `packages/core/src/scheduling/build-itip-message.ts` mit drei
  Funktionen:
  - `buildRequestMessage(parsedObject): string` — vollständiges
    `VCALENDAR` mit `METHOD:REQUEST`, enthält Master + alle Overrides
    unverändert, `SEQUENCE` wie im Original (Erhöhung passiert **vor**
    dem Aufruf, beim Schreiben des Organizer-Events selbst)
  - `buildReplyMessage(parsedObject, respondingAttendeeAddress): string` —
    **reduziertes** `VCALENDAR` mit `METHOD:REPLY`: nur `UID`,
    `ORGANIZER`, **eine** `ATTENDEE`-Zeile (die des antwortenden
    Nutzers, mit seinem aktuellen `PARTSTAT`), `DTSTAMP` (RFC5546
    §3.2.3 — REPLY enthält nicht das komplette Event, nur die
    Antwort-relevanten Felder)
  - `buildCancelMessage(parsedObject, cancelledAttendeeAddresses?): string` —
    `VCALENDAR` mit `METHOD:CANCEL`, `STATUS:CANCELLED`; optionaler
    zweiter Parameter für den Fall "nur bestimmte Attendees wurden
    entfernt" (nicht das ganze Event storniert) —
    `SEQUENCE` erhöht

## Akzeptanzkriterien
- [ ] `buildRequestMessage` enthält alle Original-Komponenten
      unverändert
- [ ] `buildReplyMessage` enthält **genau eine** `ATTENDEE`-Zeile, nicht
      die vollständige Attendee-Liste
- [ ] `buildCancelMessage` ohne zweiten Parameter erzeugt eine
      Komplett-Stornierung (`STATUS:CANCELLED` auf dem gesamten Event);
      mit Adressliste eine auf die genannten Attendees beschränkte
      Nachricht
- [ ] Alle drei erzeugen valides, mit dem
      [iCalendar-Parser-Wrapper](../../../M6-caldav/02-icalendar-parsing-and-time-range-index/01-icalendar-parser-wrapper.md)
      wieder einlesbares iCalendar (Roundtrip-Test)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 5546
