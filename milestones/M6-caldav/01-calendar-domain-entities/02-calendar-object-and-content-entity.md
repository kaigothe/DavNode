# Sub-Task: CalendarObject- & CalendarObjectContent-Entity

## Kontext
**Wichtig**: ein `CalendarObject` (eine URL, ein ETag) kann **mehrere**
`VEVENT`-Komponenten mit derselben `UID` in seinem `ics_data` enthalten
— ein Master-Event (mit optionalem `RRULE`) plus beliebig viele
`RECURRENCE-ID`-Overrides für einzelne, individuell geänderte oder
verschobene Instanzen (RFC 4791 §4.1: "a calendar object resource...
contains... the master component and, if applicable, override
components for the recurring instances"). Der Time-Range-Index (siehe
unten) muss beim Schreiben **alle** enthaltenen Komponenten
berücksichtigen, nicht nur die erste.

## Aufgabe
- `CalendarObject`-Entity
  (`packages/core/src/entities/calendar-object.entity.ts`): `id` (UUID),
  `tenantId` (FK → Tenant), `calendarId` (FK → CalendarCollection),
  `uid` (iCal `UID`, unique **innerhalb des Kalenders** — teilen sich
  Master und Overrides), `etag`, `componentType` (Enum, v1 nur
  `'VEVENT'`), `ownerPrincipalId` (FK → Principal)
- **Time-Range-Index-Spalten** (Runde 21 — direkt hier, **keine**
  separate Indextabelle wie `AddressObjectIndex` bei M5: dort waren
  vCard-Properties mehrwertig — z.B. mehrere `EMAIL`-Einträge pro
  Kontakt — hier ist der zeitliche Umfang eines Kalenderobjekts
  einwertig, ein zusätzlicher Join wäre unnötiger Overhead für eine
  1:1-Beziehung):
  - `dtstart` (Timestamp) — `DTSTART` des Master-Events
  - `dtend` (Timestamp, nullable) — `DTEND` des Master-Events (oder aus
    `DURATION` berechnet)
  - `isAllDay` (Boolean) — `DTSTART`/`DTEND` als `DATE` statt
    `DATE-TIME` (ganztägiger Termin)
  - `recurrenceSpanEnd` (Timestamp, nullable = **unbegrenzt**
    wiederkehrend) — bei `RRULE` mit `UNTIL`: direkt übernommen; bei
    `COUNT`: letzte Instanz berechnet (siehe
    [Recurrence-Expansion-Utility](../../02-icalendar-parsing-and-time-range-index/02-recurrence-expansion-utility.md));
    ohne `RRULE`: gleich `dtend`
  - `transparency` (Enum `'opaque' | 'transparent'`, Default `'opaque'`
    — `TRANSP`-Property, relevant für `free-busy-query`)
  - `status` (Enum `'tentative' | 'confirmed' | 'cancelled'`, nullable
    = wie `confirmed` — `STATUS`-Property)
  - `createdAt`, `updatedAt`
- `CalendarObjectContent`-Entity: `id` (UUID), `calendarObjectId` (FK,
  unique), `icsData` (Blob/Text, **vollständiger** VCALENDAR-Wrapper
  inkl. aller Komponenten)
- Migrationen; Unique-Index auf `(calendar_id, uid)`; Index auf
  `(calendar_id, dtstart, recurrence_span_end)` für die
  Time-Range-Vorfilterung in
  [calendar-query](../../06-caldav-reports/02-calendar-query-report.md)

## Akzeptanzkriterien
- [ ] Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] `(calendar_id, uid)` ist unique
- [ ] `recurrence_span_end` ist `null` bei einem `RRULE` ohne
      `UNTIL`/`COUNT` (Test)
- [ ] `dtend` ist `null` erlaubt (z.B. bei reinen `DURATION`-losen
      Terminen — Anwendungslogik in Große Aufgabe 2 muss `DURATION` in
      `dtend` umrechnen, nicht `null` durchreichen, sofern im iCal
      vorhanden)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Calendar-Domäne
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 21
