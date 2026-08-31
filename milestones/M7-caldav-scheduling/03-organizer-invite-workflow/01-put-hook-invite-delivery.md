# Sub-Task: PUT-Hook — Invite-Diff & Zustellung

## Kontext
**Retrofit von M6s CalendarObject-PUT-Handler**: erweitert
[M6 CalendarObject-CRUD](../../../M6-caldav/04-calendar-object-crud/01-calendar-object-crud-handlers.md)
um Scheduling-Logik, die nach erfolgreichem Schreiben ausgeführt wird.
Nutzt
[Scheduling-Object-Resource-Erkennung](../02-itip-message-generation/01-scheduling-object-detection.md)
und den [iTIP-Message-Builder](../02-itip-message-generation/02-itip-message-builder.md).

## Aufgabe
- Nach jedem erfolgreichen PUT eines `CalendarObject`:
  `detectSchedulingRole` aufrufen; bei Ergebnis `'organizer'` greift
  diese Aufgabe
- **Neuanlage** (kein vorheriger Zustand): jeder lokal auflösbare
  Attendee bekommt eine `REQUEST`-Nachricht in seiner Inbox **und**
  wird automatisch als `CalendarObject` in seinem `defaultCalendarId`
  angelegt (eigener `PARTSTAT` des jeweiligen Attendees initial
  `NEEDS-ACTION`, Rest des Events unverändert übernommen)
- **Update** (Diff gegen den vorherigen Zustand, `SEQUENCE` wird dabei
  erhöht):
  - Neu hinzugekommene Attendees → `REQUEST` wie bei Neuanlage
  - Entfernte Attendees → `CANCEL` nur an sie (nutzt
    `buildCancelMessage` mit Adressliste), ihre auto-eingetragene Kopie
    im `defaultCalendarId` wird entfernt
  - Unverändert weiter eingeladene Attendees → aktualisiertes
    `REQUEST` (z.B. bei geänderter Zeit), ihre auto-eingetragene Kopie
    wird aktualisiert, **ihr eigener** `PARTSTAT` bleibt dabei erhalten
    (ein Zeit-Update setzt eine bereits erfolgte Zusage nicht
    automatisch zurück — RFC5546-übliches Verhalten)
- Kein lokal auflösbarer Attendee (alle extern) → keine Zustellung,
  Event wird trotzdem normal gespeichert (kein Fehler)

## Akzeptanzkriterien
- [ ] Neuer Termin mit zwei lokalen Attendees erzeugt zwei
      `SchedulingInboxItem`s und zwei automatisch eingetragene
      Kalendereinträge (`PARTSTAT: NEEDS-ACTION`)
- [ ] Entfernen eines Attendees aus einem bestehenden Termin sendet ihm
      ein `CANCEL` und entfernt seine auto-eingetragene Kopie; die
      übrigen Attendees behalten ihren Eintrag
- [ ] Verschieben der Uhrzeit eines Termins mit bereits zugesagtem
      Attendee aktualisiert dessen Kopie, sein `PARTSTAT` bleibt
      `ACCEPTED`
- [ ] Ein Termin mit ausschließlich externen (nicht auflösbaren)
      Attendees wird normal gespeichert, ohne Fehler, ohne
      Inbox-Zustellung

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §3.2.1
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 22
