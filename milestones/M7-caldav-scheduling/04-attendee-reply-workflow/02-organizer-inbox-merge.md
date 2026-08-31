# Sub-Task: Inbox-Merge beim Organizer

## Kontext
Ein zugestelltes `REPLY`-`SchedulingInboxItem` (aus dem vorherigen
Sub-Task) muss automatisch in die Organizer-eigene Kopie des Termins
einfließen, sonst sieht der Organizer die Antwort nur als isolierte
Inbox-Nachricht, nicht als aktualisierten `PARTSTAT` im Termin selbst.

## Aufgabe
- `packages/core/src/scheduling/merge-reply-into-organizer-copy.ts`:
  wird unmittelbar nach dem Einfügen eines `REPLY`-Items in eine Inbox
  aufgerufen (im selben Aufruf wie die Zustellung aus
  [PUT-Hook: PARTSTAT-Diff & Reply-Zustellung](01-put-hook-reply-delivery.md),
  nicht als separater Poll-Mechanismus)
- Findet über die `uid` das Organizer-eigene `CalendarObject`, aktualisiert
  darin die `ATTENDEE`-Zeile des antwortenden Attendees mit dem neuen
  `PARTSTAT`, erhöht `SEQUENCE` **nicht** (ein Reply-Merge ist keine
  inhaltliche Termin-Änderung im iTIP-Sinne), aktualisiert `etag` des
  Organizer-Objekts
- Löst dabei **keine** erneute Zustellung an andere Attendees aus (kein
  Zustellungs-Loop) — der Merge ist ein interner Schreibvorgang, kein
  regulärer PUT durch einen Nutzer
- Das `SchedulingInboxItem` bleibt nach dem Merge in der Inbox bestehen
  (Nachweis/Historie), wird nicht automatisch gelöscht — Löschen bleibt
  eine explizite Client-Aktion (DELETE auf die Inbox-Item-Ressource,
  siehe [Große Aufgabe 7](../../07-scheduling-privileges-and-routes/00-overview.md))

## Akzeptanzkriterien
- [ ] Nach einer Attendee-Zusage zeigt PROPFIND/GET auf den
      Organizer-eigenen Termin den aktualisierten `PARTSTAT` des
      betreffenden Attendees, alle anderen `ATTENDEE`-Zeilen bleiben
      unverändert
- [ ] Der Merge selbst löst **keine** neue `REQUEST`-Zustellung an die
      übrigen Attendees aus (Regressionstest gegen einen
      Zustellungs-Loop)
- [ ] `SchedulingInboxItem` bleibt nach dem Merge weiterhin per PROPFIND
      auf der Inbox sichtbar

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §3.2.2
