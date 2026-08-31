# Sub-Task: PUT-Hook — PARTSTAT-Diff & Reply-Zustellung

## Kontext
Weiterer Retrofit von
[M6s CalendarObject-PUT-Handler](../../../M6-caldav/04-calendar-object-crud/01-calendar-object-crud-handlers.md),
diesmal für den Attendee-Fall. Nutzt
[Scheduling-Object-Resource-Erkennung](../../02-itip-message-generation/01-scheduling-object-detection.md)
und [iTIP-Message-Builder](../../02-itip-message-generation/02-itip-message-builder.md).

## Aufgabe
- Nach jedem erfolgreichen PUT: `detectSchedulingRole` liefert
  `'attendee'` → diese Aufgabe greift
- Vergleicht den `PARTSTAT` der **eigenen** `ATTENDEE`-Zeile vor/nach
  dem PUT; nur bei tatsächlicher Änderung (z.B.
  `NEEDS-ACTION` → `ACCEPTED`) wird eine `REPLY`-Nachricht gebaut und —
  falls der Organizer lokal auflösbar ist — in dessen Inbox zugestellt
- Änderungen an anderen Feldern durch den Attendee (z.B. eine private
  Notiz, falls das Datenmodell das später erlaubt) lösen **keine**
  Zustellung aus — nur `PARTSTAT`-Änderungen sind Reply-relevant
- Organizer nicht lokal auflösbar → keine Zustellung, `PARTSTAT`-
  Änderung wird trotzdem gespeichert (kein Fehler)

## Akzeptanzkriterien
- [ ] Ändert ein Attendee `PARTSTAT` von `NEEDS-ACTION` auf `ACCEPTED`,
      erhält der (lokale) Organizer ein `REPLY`-`SchedulingInboxItem`
- [ ] Eine PUT-Anfrage ohne `PARTSTAT`-Änderung (z.B. nur Beschreibung
      angepasst) löst **keine** Reply-Zustellung aus
- [ ] Attendee mit externem (nicht auflösbarem) Organizer: Änderung wird
      gespeichert, keine Zustellung, kein Fehler

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §3.2.2
