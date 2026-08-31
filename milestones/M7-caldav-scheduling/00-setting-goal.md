# M7 — CalDAV Scheduling (RFC 6638)

## Setting (Kontext)
M6 hat CalDAV-Grundfunktionen (Kalender, Termine, Filter, Frei/Belegt-
Auskunft) gebaut. M7 ergänzt **Scheduling**: Nutzer können sich
gegenseitig zu Terminen einladen und antworten, ohne dass eine E-Mail
im Spiel ist — der CalDAV-Server selbst übernimmt die Zustellung
(iTIP über CalDAV, RFC 6638, im Gegensatz zu iMIP über E-Mail).

**Scope bewusst eingegrenzt** (Runde 22, siehe
[planning/01-decisions.md](../../planning/01-decisions.md)) — ein
vollständiges, mit beliebigen externen Systemen interoperables
Scheduling wäre ein eigenständiges Großprojekt:
- **Nur implizites Scheduling**: erkannt anhand von PUT/DELETE auf
  Kalenderobjekte mit `ORGANIZER`/`ATTENDEE` — kein explizites
  Outbox-POST-Scheduling für Einladungen (nur für `freebusy-request`)
- **Nur Zustellung an Attendees desselben Tenants** — kein iMIP/
  E-Mail-Fallback, keine tenant-/serverübergreifende Zustellung
- **Nur REQUEST/REPLY/CANCEL** — keine iTIP-Verhandlungsmethoden
  (`COUNTER`/`DECLINECOUNTER`/`ADD`)
- **Automatisches Eintragen ohne Opt-out**: eingehende Einladungen
  landen automatisch im `default_calendar_id` des Attendees (neues
  Feld auf `User`, Runde 22)

## Ziel
Am Ende von M7: legt ein Nutzer (Organizer) einen Termin mit
`ATTENDEE`-Properties für andere Nutzer **desselben Tenants** an,
landet automatisch eine Einladung in deren Scheduling-Inbox **und** in
deren Default-Kalender. Ändert ein Attendee seinen `PARTSTAT`
(Annehmen/Ablehnen), erhält der Organizer automatisch eine Antwort, die
in seiner eigenen Kopie des Termins nachgeführt wird. Löscht der
Organizer den Termin, wird er bei allen Attendees automatisch entfernt.

## Große Aufgaben (Übersicht)
1. [Scheduling-Datenmodell](01-scheduling-data-model/00-overview.md)
2. [iTIP-Nachrichten-Erzeugung](02-itip-message-generation/00-overview.md)
3. [Organizer-Workflow: Invite-Zustellung](03-organizer-invite-workflow/00-overview.md)
4. [Attendee-Workflow: Reply-Zustellung](04-attendee-reply-workflow/00-overview.md)
5. [CANCEL-Workflow](05-cancel-workflow/00-overview.md)
6. [Scheduling-Outbox (Freebusy-Request)](06-scheduling-outbox-freebusy/00-overview.md)
7. [Scheduling-Privileges & Inbox/Outbox-Routen](07-scheduling-privileges-and-routes/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→7). Aufgaben 3–5
setzen alle auf 1–2 auf.

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M7-Definition
- [planning/05-data-model.md](../../planning/05-data-model.md) — Scheduling-Domäne, Scheduling-Privileges
- [planning/06-standards-compliance.md](../../planning/06-standards-compliance.md) — RFC 6638, RFC 5546
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 22

## Abgrenzung (nicht Teil von M7)
- iMIP/E-Mail-Fallback für externe Attendees (siehe
  [planning/03-open-questions.md](../../planning/03-open-questions.md))
- `COUNTER`/`DECLINECOUNTER`/`ADD`-iTIP-Methoden
- Explizites Outbox-Scheduling für Einladungen
- Konfigurierbares Triage-Modell (manuelle Annahme statt Auto-Filing)
- Wiederkehrende Termine mit **partieller** Einladungsänderung nur für
  einzelne Instanzen (`RECURRENCE-ID`-scoped Scheduling, RFC 6638
  §5) — v1 behandelt Einladungsänderungen nur auf Ebene des gesamten
  CalendarObject (Master + alle Overrides), nicht pro Einzelinstanz
