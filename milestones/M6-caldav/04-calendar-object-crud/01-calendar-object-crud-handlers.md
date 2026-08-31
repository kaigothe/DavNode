# Sub-Task: CalendarObject-CRUD-Handler

## Kontext
Strukturell identisch zu
[M5 AddressObject-CRUD](../../M5-carddav/04-address-object-crud/01-address-object-crud-handlers.md),
angewendet auf `CalendarObject`/`CalendarObjectContent`. Diese Aufgabe
beschreibt **nur die Unterschiede** — ETag-Erzeugung, `If-Match`/
`If-None-Match`, `calendar_changes`-Äquivalent, `409` bei fehlendem
Kalender verhalten sich wie beim WebDAV-/CardDAV-Vorbild.

## Aufgabe
- `packages/server/src/http/routes/caldav/{get,put,delete}.route.ts`
- **GET**: `Content-Type: text/calendar; charset=utf-8`
- **PUT**:
  - Request-Body muss über den
    [iCalendar-Parser-Wrapper](../02-icalendar-parsing-and-time-range-index/01-icalendar-parser-wrapper.md)
    valide sein (inkl. der dortigen Precondition-Prüfungen: einheitliche
    `UID`, genau ein Master, kein `VTODO`) — Fehler → `400 Bad Request`,
    kein Schreibvorgang
  - `supported-calendar-component`-Precondition (RFC4791 §5.3.2.1): der
    `componentType` des Objekts muss im
    `supportedComponentSet` des Ziel-Kalenders enthalten sein, sonst
    `403` mit `<CALDAV:supported-calendar-component/>`
  - `UID` muss **innerhalb des Kalenders** eindeutig sein (analog zu
    M5s vCard-`UID`-Regel, RFC4791 §5.3.2.1
    `no-uid-conflict`-Precondition) → `409`
  - Bei Neuanlage: Default-Owner-ACE (parametrisiert für
    `calendar_object_aces`, siehe
    [Große Aufgabe 5](../05-acl-lock-sync-reuse/00-overview.md))
  - Nach erfolgreichem Schreiben:
    [CalendarObject-Index-Befüllung](../02-icalendar-parsing-and-time-range-index/03-calendar-object-index-population.md)
    wird aufgerufen
  - Ziel-Kalender existiert nicht → `409`
- **DELETE**: entfernt `CalendarObject` + `CalendarObjectContent` +
  Dead-Properties transaktional (kein separater Index zu bereinigen, da
  die Time-Range-Spalten direkt auf `CalendarObject` liegen und mit der
  Zeile selbst verschwinden)

## Akzeptanzkriterien
- [ ] PUT eines validen, einmaligen Termins legt ihn an, GET liefert ihn
      mit `Content-Type: text/calendar`
- [ ] PUT eines wiederkehrenden Termins mit einem `RECURRENCE-ID`-
      Override wird als **ein** CalendarObject gespeichert (nicht als
      mehrere Ressourcen)
- [ ] PUT mit nicht unterstütztem Component-Type (z.B. `VTODO` gegen
      einen nur-`VEVENT`-Kalender) liefert `403`
- [ ] PUT mit einer im Kalender bereits vorhandenen `UID` unter anderer
      URL liefert `409`
- [ ] DELETE entfernt Content und Dead-Properties vollständig

## Nachtrag (Runde 22, sobald M7 existiert)
Sobald [M7 — CalDAV Scheduling](../../M7-caldav-scheduling/00-setting-goal.md)
existiert, bekommen PUT und DELETE hier je einen Scheduling-Hook: PUT
löst je nach Rolle (Organizer/Attendee) eine Invite- oder
Reply-Zustellung aus (siehe
[M7-Organizer-Workflow](../../M7-caldav-scheduling/03-organizer-invite-workflow/00-overview.md)/
[M7-Attendee-Workflow](../../M7-caldav-scheduling/04-attendee-reply-workflow/00-overview.md)),
DELETE löst eine Cancel-Zustellung aus (siehe
[M7-CANCEL-Workflow](../../M7-caldav-scheduling/05-cancel-workflow/00-overview.md)).
Termine ohne `ORGANIZER`/`ATTENDEE` sind davon **nicht** betroffen — die
Hooks greifen nur bei erkannten Scheduling-Object-Resources. Bis M7
existiert, verhält sich PUT/DELETE exakt wie hier beschrieben.

## Nachtrag (sobald M8 existiert)
Sobald [M8 — Quota](../../M8-quota/00-setting-goal.md) existiert, rufen
PUT und DELETE `applyQuotaDelta` auf (siehe
[M8-CalendarObject-Retrofit](../../M8-quota/03-carddav-caldav-quota-integration/02-calendar-object-retrofit.md)) —
das gilt auch für die in M7 automatisch beim Attendee eingetragenen
Kalenderkopien, sofern diese denselben internen Write-Pfad nutzen. Bis
M8 existiert, gibt es keinen Quota-Check.

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 4791 §5.3.2
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 22
