# Sub-Task: CalendarCollection-Entity

## Kontext
Kein selbstreferenzierendes `parent_collection_id` — Kalender
verschachteln sich nicht (Runde 21, gleiches Muster wie
`AddressbookCollection` aus M5).

## Aufgabe
- `CalendarCollection`-Entity
  (`packages/core/src/entities/calendar-collection.entity.ts`): `id`
  (UUID), `tenantId` (FK → Tenant), `ownerPrincipalId` (FK → Principal),
  `displayName`, `description` (nullable, Text —
  `CALDAV:calendar-description`), `supportedComponentSet` (String-Array/
  JSON-Spalte, v1-Default `['VEVENT']`, bewusst erweiterbar angelegt),
  `timezone` (nullable, Text — rohes `VTIMEZONE` oder TZID,
  `CALDAV:calendar-timezone`), `icsFeedToken` (nullable, String, unique
  wenn gesetzt — siehe
  [ICS-Feed-Export](../../07-ics-feed-export/00-overview.md)),
  `syncSeq` (Integer, Default `0`), `createdAt`, `updatedAt`
- Migration mit FK auf `tenants`, `principals`; Index auf
  `(tenant_id, owner_principal_id)` (analog zu
  [M5-AddressbookCollection](../../M5-carddav/01-addressbook-domain-entities/01-addressbook-collection-entity.md));
  Unique-Index auf `ics_feed_token` (falls nicht `null`)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite/Postgres/MySQL
- [ ] Ein Nutzer kann mehrere Kalender besitzen (kein Unique-Constraint
      auf `owner_principal_id`)
- [ ] `ics_feed_token` ist `null` per Default (Feed deaktiviert, bis
      erstmals generiert)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Calendar-Domäne
