# Sub-Task: Inbox/Outbox-Routen

## Kontext
`/dav/{tenant}/calendars/{userId}/inbox/` und `.../outbox/` (siehe
[planning/05-data-model.md](../../../planning/05-data-model.md)
URL-Schema). Zugriffsregel bewusst simpel gehalten (siehe vorherige
Aufgabe): nur der Owner selbst.

## Aufgabe
- `packages/server/src/http/routes/scheduling/inbox.route.ts`:
  PROPFIND listet die `SchedulingInboxItem`s des anfragenden Nutzers
  (Depth 0/1 wie üblich); `resourcetype` der Collection selbst enthält
  `<C:schedule-inbox/>` (RFC6638 §2.2.1)
- GET auf ein einzelnes Inbox-Item liefert `ics_data` als
  `text/calendar`
- DELETE auf ein einzelnes Inbox-Item entfernt es (Client "quittiert"
  eine Benachrichtigung — unabhängig davon, ob sie bereits in die
  Kalenderkopie gemergt wurde, siehe
  [Inbox-Merge](../../04-attendee-reply-workflow/02-organizer-inbox-merge.md))
- `packages/server/src/http/routes/scheduling/outbox.route.ts`:
  PROPFIND liefert eine **leere** Collection (`resourcetype` enthält
  `<C:schedule-outbox/>`, RFC6638 §2.2.2) — keine persistenten
  Ressourcen, siehe
  [SchedulingInboxItem-Entity](../../01-scheduling-data-model/01-scheduling-inbox-item-entity.md);
  POST wird an den
  [freebusy-request-Handler](../../06-scheduling-outbox-freebusy/01-freebusy-request-handler.md)
  weitergereicht
- Zugriffsregel für **beide**: `req.principal.id` muss `{userId}` im
  Pfad entsprechen, sonst `403` (kein ACE-basierter Zugriff Dritter in
  v1 — konsistent mit der Einschränkung aus der vorherigen Aufgabe)

## Akzeptanzkriterien
- [ ] PROPFIND auf die eigene Inbox listet alle eigenen
      `SchedulingInboxItem`s
- [ ] GET auf ein Inbox-Item liefert dessen `ics_data`
- [ ] DELETE auf ein Inbox-Item entfernt es dauerhaft
- [ ] Zugriff auf die Inbox/Outbox eines anderen Nutzers liefert `403`
- [ ] PROPFIND auf die eigene Outbox liefert eine leere Collection mit
      korrektem `resourcetype`

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6638 §2.2
