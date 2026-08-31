# Sub-Task: SchedulingInboxItem-Entity

## Kontext
Siehe [planning/05-data-model.md](../../../planning/05-data-model.md),
Abschnitt "Scheduling-Domäne". Die Outbox bekommt **keine** eigene
Tabelle (reines POST-Ziel, siehe
[Große Aufgabe 6](../../06-scheduling-outbox-freebusy/00-overview.md)).

## Aufgabe
- `SchedulingInboxItem`-Entity
  (`packages/core/src/entities/scheduling-inbox-item.entity.ts`): `id`
  (UUID), `tenantId` (FK → Tenant), `ownerPrincipalId` (FK → Principal,
  dessen Inbox), `icsData` (Blob/Text, rohe iTIP-Nachricht), `method`
  (Enum `'REQUEST' | 'REPLY' | 'CANCEL'`), `uid` (zugehörige
  Event-`UID`, für Korrelation mit dem Original-Termin), `etag`,
  `createdAt`
- Migration; Index auf `(tenant_id, owner_principal_id)` (Listing der
  eigenen Inbox), Index auf `uid` (Korrelation beim Reply-Merge, siehe
  [Attendee-Workflow](../../04-attendee-reply-workflow/00-overview.md))
- **Kein** ACE/Lock/Change-Tabellen-Set für diese Domäne — Zugriff ist
  implizit auf `owner_principal_id` beschränkt (kein RFC3744-ACL-Bedarf
  für ein rein persönliches Postfach), siehe
  [Scheduling-Privileges & Inbox/Outbox-Routen](../../07-scheduling-privileges-and-routes/00-overview.md)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite/Postgres/MySQL
- [ ] Mehrere Inbox-Items mit derselben `uid` (z.B. ein REQUEST gefolgt
      von einem CANCEL für dasselbe Event) können nebeneinander
      existieren

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Scheduling-Domäne
