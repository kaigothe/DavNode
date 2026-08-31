# Sub-Task: freebusy-request-Handler

## Kontext
RFC 6638 §3.4.3. Anders als die übrigen Scheduling-Workflows (implizit
über PUT/DELETE) ist dies der **eine** Fall, in dem der Client aktiv an
die Outbox postet. Nutzt die Frei/Belegt-Berechnung aus
[M6 free-busy-query](../../../M6-caldav/06-caldav-reports/03-free-busy-query-report.md).

## Aufgabe
- `packages/server/src/http/routes/scheduling/outbox-post.route.ts`:
  `POST /dav/{tenant}/calendars/{userId}/outbox/` mit einem
  `VCALENDAR`/`METHOD:REQUEST`-Body, der eine `VFREEBUSY`-Komponente
  mit `ORGANIZER`, einer oder mehreren `ATTENDEE`-Zeilen und
  `DTSTART`/`DTEND` (der angefragte Zeitraum) enthält
- Für jeden `ATTENDEE`:
  - lokal auflösbar (`resolveLocalPrincipalForAddress` aus
    [Große Aufgabe 2](../../02-itip-message-generation/01-scheduling-object-detection.md)):
    berechnet dessen Frei/Belegt-Status im angefragten Zeitraum über
    alle seine Kalender (dieselbe Phase-1/Phase-2-Logik wie
    `free-busy-query`, erfordert `CALDAV:read-free-busy` **oder**
    `DAV:read` auf mindestens einem Kalender des Attendees — ansonsten
    `request-status` = "Zugriff verweigert")
  - nicht lokal auflösbar: `request-status` = "3.7;Invalid Calendar
    User" (RFC5546-Statuscode für unbekannten Empfänger), kein
    `calendar-data`
- Antwort: `200 OK`, `Content-Type: text/xml`, Body = ein
  `<C:schedule-response>`-Element (RFC6638 §3.4.3.2) mit einem
  `<C:response>` pro `ATTENDEE`: `<C:recipient>`,
  `<C:request-status>`, bei Erfolg zusätzlich `<C:calendar-data>` mit
  der `VFREEBUSY`-Antwort für genau diesen Attendee

## Akzeptanzkriterien
- [ ] Anfrage mit zwei lokalen Attendees liefert für beide je einen
      `<C:response>`-Block mit korrekter `VFREEBUSY`-`calendar-data`
- [ ] Ein externer (nicht auflösbarer) Attendee liefert
      `request-status` "3.7", kein `calendar-data`, **ohne** die
      übrigen Responses zu beeinträchtigen
- [ ] Anfrage für einen Attendee ohne erteiltes
      `CALDAV:read-free-busy`/`DAV:read` liefert einen
      Zugriffsverweigert-`request-status`, keine Daten

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §3.4
