# Sub-Task: Scheduling-Privilege-Erweiterung

## Kontext
[planning/05-data-model.md](../../../planning/05-data-model.md) hat die
Scheduling-Privileges bereits dokumentiert (Runde 22). Diese Aufgabe
erweitert das
[Privilege-Katalog-Enum aus M3](../../../M3-webdav-acl/01-ace-entities-and-privileges/02-privilege-catalog.md)
entsprechend im Code.

## Aufgabe
- `Privilege`-Union-Typ (M3) um `'schedule-deliver'`,
  `'schedule-deliver-invite'`, `'schedule-deliver-reply'`,
  `'schedule-send'`, `'schedule-send-invite'`, `'schedule-send-reply'`,
  `'schedule-send-freebusy'` erweitern
- `expandPrivilege` (M3) entsprechend ergänzen: `schedule-deliver`
  aggregiert `schedule-deliver-invite` + `schedule-deliver-reply`;
  `schedule-send` aggregiert `schedule-send-invite` +
  `schedule-send-reply` + `schedule-send-freebusy` — **kein** Bezug zu
  `DAV:all` (bleiben eigenständig, wie bereits bei
  `CALDAV:read-free-busy` in M6 begründet)
- Da Inbox/Outbox in v1 **keine** eigenen ACE-Tabellen haben (siehe
  [SchedulingInboxItem-Entity](../../01-scheduling-data-model/01-scheduling-inbox-item-entity.md)):
  diese Privileges werden aktuell **nicht** über die ACL-Engine
  ausgewertet, sondern die Zugriffsregel ist fest "nur der
  `owner_principal_id`" (siehe
  [Inbox/Outbox-Routen](02-inbox-outbox-routes.md)) — die
  Privilege-Werte existieren trotzdem im Katalog, damit
  `supported-privilege-set`/`current-user-privilege-set`-Properties
  (M3) spezifikationskonform auf Inbox/Outbox antworten können, auch
  wenn die tatsächliche Durchsetzung (noch) simpler ist als eine volle
  ACE-Auswertung

## Akzeptanzkriterien
- [ ] Alle sieben neuen Privilege-Werte sind im Enum vorhanden
- [ ] `expandPrivilege('schedule-deliver')` enthält beide Teil-
      Privileges, `expandPrivilege('schedule-send')` alle drei
- [ ] `DAV:all` aggregiert die neuen Privileges **nicht** (Regressions-
      Test gegen den M3-Aggregations-Test)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Scheduling-Privileges
