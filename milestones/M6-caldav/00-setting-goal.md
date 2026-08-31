# M6 — CalDAV-Grundfunktion (RFC 4791)

## Setting (Kontext)
M5 hat die zweite Ressourcen-Domäne (CardDAV) gebaut und dabei die
ACL-/Lock-/Sync-Infrastruktur aus M3/M4 domänenübergreifend
wiederverwendbar gemacht. M6 ist die **dritte** Domäne (Kalender) und
gleichzeitig die fachlich komplexeste bisher: wiederkehrende Termine
(RRULE/RDATE/EXDATE) und Zeitbereichs-Filter (`calendar-query`
REPORT) erfordern eine eigene Recurrence-Expansion-Logik, die es bei
CardDAV nicht gab.

**Wichtige Klarstellungen aus der M6-Detailplanung** (Runde 21, siehe
[planning/01-decisions.md](../../planning/01-decisions.md)):
- `CalendarCollection` verschachtelt sich wie `AddressbookCollection`
  nicht — flache Kalender unter einer virtuellen
  Calendar-Home-Collection `/dav/{tenant}/calendars/{userId}/`.
- Kalender werden über die von RFC 4791 **eigens definierte**
  HTTP-Methode `MKCALENDAR` erzeugt — **nicht** über Extended MKCOL wie
  bei CardDAV (RFC 5689). Kein Retrofit von M2s MKCOL nötig.
- Der Time-Range-Index (`dtstart`/`dtend`/`recurrence_span_end`/...)
  liegt als direkte Spalten auf `CalendarObject`, nicht als separate
  Tabelle wie `AddressObjectIndex` — bewusste Abweichung, da einwertig.
- Ein `CalendarObject` (eine URL, ein ETag) kann **mehrere**
  VEVENT-Komponenten mit derselben `UID` enthalten: ein Master-Event
  plus `RECURRENCE-ID`-Overrides für einzelne, individuell geänderte
  Instanzen. Das prägt Parsing, Indexierung und Time-Range-Auswertung
  in dieser gesamten Milestone.
- Die ICS-Feed-Frage aus Runde 14 ist jetzt vollständig gelöst:
  Token als Pfadsegment (`.../feed/{token}.ics`), nicht Query-Parameter.

**Wiederverwendung**: anders als bei M5 mussten die ACL-/Lock-/Sync-
Engines diesmal **nicht** mehr genericized werden — das ist seit M5
bereits erledigt. M6 instanziiert sie nur noch für die neuen Tabellen
(Große Aufgabe 5).

## Ziel
Am Ende von M6 können CalDAV-fähige Clients (Apple Calendar,
Thunderbird, DAVx5) Kalender anlegen (MKCALENDAR), Termine per
GET/PUT/DELETE verwalten (inkl. wiederkehrender Termine mit Ausnahmen),
per `calendar-query`/`calendar-multiget` REPORT filtern/abrufen, eine
`free-busy-query` stellen, und zusätzlich jeden Kalender als einfachen,
schreibgeschützten ICS-Feed abonnieren (z.B. in Outlook).

## Große Aufgaben (Übersicht)
1. [Calendar-Domänen-Entities](01-calendar-domain-entities/00-overview.md)
2. [iCalendar-Parsing & Time-Range-Index](02-icalendar-parsing-and-time-range-index/00-overview.md)
3. [Calendar-Home & MKCALENDAR](03-calendar-home-and-mkcalendar/00-overview.md)
4. [CalendarObject-CRUD](04-calendar-object-crud/00-overview.md)
5. [ACL-/Lock-/Sync-Wiederverwendung](05-acl-lock-sync-reuse/00-overview.md)
6. [CalDAV-REPORTs](06-caldav-reports/00-overview.md)
7. [ICS-Feed-Export](07-ics-feed-export/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→7).

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M6-Definition
- [planning/05-data-model.md](../../planning/05-data-model.md) — Calendar-Domäne, URL-Schema
- [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md) — RFC 4791, RFC 5545
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 14, 21

## Abgrenzung (nicht Teil von M6)
- Kein Scheduling (RFC 6638, Einladungen/iTIP, Scheduling-Inbox/-Outbox)
  — das ist M7
- Kein `VTODO`/`VJOURNAL` — nur `VEVENT` (siehe
  [planning/03-open-questions.md](../../planning/03-open-questions.md))
- Keine CalDAV-Scheduling-Privileges (`CALDAV:schedule-*`) — erst M7
- `CALDAV:read-free-busy`-Privilege wird zwar für
  `free-busy-query` eingeführt (Große Aufgabe 6), aber ohne die vollen
  Scheduling-Privileges aus M7
