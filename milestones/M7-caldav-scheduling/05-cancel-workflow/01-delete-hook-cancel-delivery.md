# Sub-Task: DELETE-Hook — Cancel-Zustellung

## Kontext
**Retrofit von M6s CalendarObject-DELETE-Handler**: erweitert
[M6 CalendarObject-CRUD](../../../M6-caldav/04-calendar-object-crud/01-calendar-object-crud-handlers.md)
um Scheduling-Logik. Nutzt dieselbe Rollenerkennung wie die PUT-Hooks
aus den Großen Aufgaben 3/4.

## Aufgabe
- Vor dem eigentlichen Löschen: `detectSchedulingRole` aufrufen
- **Rolle `'organizer'`** (Organizer löscht seinen eigenen Termin):
  jeder lokal auflösbare Attendee bekommt eine `CANCEL`-Nachricht
  (`buildCancelMessage` ohne Adressliste = alle), seine
  auto-eingetragene Kopie im `defaultCalendarId` wird automatisch mit
  gelöscht
- **Rolle `'attendee'`** (Attendee löscht seine eigene, auto-
  eingetragene Kopie, ohne vorher `PARTSTAT` explizit geändert zu
  haben): wird als implizites `DECLINED` behandelt — eine
  `REPLY`-Nachricht mit `PARTSTAT: DECLINED` wird an den (lokalen)
  Organizer zugestellt und dort gemäß
  [Inbox-Merge](../../04-attendee-reply-workflow/02-organizer-inbox-merge.md)
  eingepflegt, **bevor** die lokale Kopie tatsächlich gelöscht wird
- **Rolle `'none'`**: normales Löschen ohne Scheduling-Nebeneffekte
  (bestehendes M6-Verhalten unverändert)

## Akzeptanzkriterien
- [ ] Organizer löscht Termin mit zwei lokalen Attendees → beide
      erhalten `CANCEL`, ihre Kopien werden automatisch entfernt
- [ ] Attendee löscht seine eigene, noch nicht beantwortete Einladung →
      Organizer erhält eine `REPLY` mit `PARTSTAT: DECLINED`, dessen
      eigene Kopie zeigt danach den entsprechenden `PARTSTAT` für diesen
      Attendee
- [ ] Löschen eines gewöhnlichen (nicht Scheduling-relevanten) Termins
      verhält sich exakt wie in M6 beschrieben (Regressionstest)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §3.2.3
