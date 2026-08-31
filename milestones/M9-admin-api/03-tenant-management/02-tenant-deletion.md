# Sub-Task: Tenant-Löschung

## Kontext
**Größter Blast-Radius im gesamten Projekt**: ein Tenant hat Zeilen in
praktisch jeder Tabelle (Users, Groups, alle drei Ressourcen-Domänen
inkl. ACE/Lock/Change/Property-Tabellen, Scheduling-Inbox, Credentials,
...). Eine unvollständige Löschung hinterlässt Datenleichen; eine
versehentliche Löschung ist katastrophal (kompletter Datenverlust einer
Organisation).

## Aufgabe
- **Cascade-Strategie**: statt in Anwendungscode dutzende Tabellen
  einzeln zu leeren, alle `tenant_id`-Fremdschlüssel projektweit auf
  `ON DELETE CASCADE` prüfen/nachziehen (Audit-Migration über alle seit
  M1 entstandenen Entities — Tenant, Principal, User, Group,
  Collection, FileResource, CalendarCollection, CalendarObject,
  AddressbookCollection, AddressObject, alle `*_aces`/`*_locks`/
  `*_changes`/`*_properties`-Tabellen, `SchedulingInboxItem`, ...): ein
  einzelnes `DELETE FROM tenants WHERE id = :id` löscht dann die
  gesamte Kette automatisch, DB-seitig garantiert vollständig
- `DELETE /admin/{tenantSlug}/tenants/{targetSlug}` — erfordert im
  Request-Body ein Bestätigungsfeld: `{ "confirmSlug": "{targetSlug}" }`
  — stimmt es nicht exakt mit `{targetSlug}` überein, `400`, **keine**
  Löschung
- Antwort: `204 No Content` bei Erfolg
- Root-Collection-Löschungs-Sperre aus M2 (DELETE einer Root-Collection
  liefert normalerweise `403`) greift hier **nicht** — die
  Tenant-Löschung ist der einzige Weg, wie eine Root-Collection
  tatsächlich verschwindet

## Akzeptanzkriterien
- [ ] Löschung eines Tenants mit Daten in allen drei Ressourcen-Domänen
      hinterlässt **keine** Zeile mit dessen `tenant_id` in irgendeiner
      Tabelle (Test: nach Löschung alle relevanten Tabellen auf
      verwaiste Zeilen prüfen)
- [ ] Request ohne oder mit falschem `confirmSlug` liefert `400`, Tenant
      bleibt vollständig erhalten
- [ ] Löschung eines **anderen** Tenants als des eigenen durch einen
      `tenant_admin` ist ohnehin unmöglich (Route nur für
      `server_admin`, siehe
      [Autorisierungs-Middleware](../../02-admin-api-scaffold/02-authorization-middleware.md))

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 24
