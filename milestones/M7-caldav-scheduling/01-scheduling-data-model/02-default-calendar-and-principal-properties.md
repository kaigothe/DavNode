# Sub-Task: Default-Kalender & Scheduling-Principal-Properties

## Kontext
`User.default_calendar_id` (Runde 22) ist das Ziel für automatisch
eingetragene Einladungen. Clients müssen außerdem Inbox/Outbox-URLs und
die "Kalender-Adresse" eines Nutzers auffinden können.

## Aufgabe
- `User`-Entity (M1) um `defaultCalendarId` (nullable FK →
  CalendarCollection) erweitern, Migration ergänzen
- **Retrofit von M6s MKCALENDAR-Handler**: legt ein Nutzer seinen
  **ersten** Kalender an (`User.defaultCalendarId` ist noch `null`), wird
  dieser automatisch als `defaultCalendarId` gesetzt (siehe Nachtrag in
  [M6-MKCALENDAR-Handler](../../../M6-caldav/03-calendar-home-and-mkcalendar/02-mkcalendar-handler.md))
- Neue Principal-Properties über den seit M3 etablierten Property-
  Provider-Mechanismus registrieren:
  - `CALDAV:schedule-inbox-URL` → `/dav/{tenant}/calendars/{userId}/inbox/`
  - `CALDAV:schedule-outbox-URL` → `/dav/{tenant}/calendars/{userId}/outbox/`
  - `CALDAV:calendar-user-address-set` → mindestens die eigene
    Principal-URL **und** `mailto:{User.email}` (RFC6638 §2.4.1 — dient
    dem Abgleich von `ORGANIZER`/`ATTENDEE`-Adressen in eingehenden
    iTIP-Nachrichten mit lokalen Nutzern)

## Akzeptanzkriterien
- [ ] Erster Kalender eines Nutzers wird automatisch
      `defaultCalendarId`; ein zweiter, später angelegter Kalender
      ändert das **nicht**
- [ ] PROPFIND auf einen User-Principal liefert `schedule-inbox-URL`,
      `schedule-outbox-URL` und `calendar-user-address-set` korrekt
- [ ] `calendar-user-address-set` enthält die `mailto:`-Adresse aus
      `User.email`

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 22
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §2
