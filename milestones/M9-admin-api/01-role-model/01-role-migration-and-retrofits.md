# Sub-Task: Role-Migration & Retrofits

## Kontext
Ersetzt das in M8 (Runde 23) bewusst als Übergangslösung markierte
`User.is_admin`. Zwei bestehende Stellen nutzen das Flag bereits und
müssen umgestellt werden.

## Aufgabe
- Migration: `role`-Spalte (Enum `'member' | 'tenant_admin' |
  'server_admin'`, Default `'member'`) auf `User` ergänzen; bestehende
  `is_admin = true`-Zeilen werden zu `role = 'server_admin'`
  migriert (Backfill-Migration, **vor** dem Entfernen der Spalte); in
  einer zweiten Migration wird `is_admin` entfernt
- **Retrofit M1-Bootstrap-Skript**: setzt für den angelegten Nutzer
  `role = 'server_admin'` statt `is_admin = true` (siehe
  [M1-CLI-Bootstrap-Skript](../../../M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling/01-cli-bootstrap-script.md))
- **Retrofit M8-Quota-Endpoint**: prüft `role` (`tenant_admin` für den
  eigenen Tenant, `server_admin` für jeden Tenant) statt `is_admin`
  (siehe
  [M8-Manueller-Trigger-Endpunkt](../../../M8-quota/05-quota-recompute/02-manual-trigger-endpoint.md)) —
  wird in [Quota-Management](../../06-quota-management/00-overview.md)
  dieser Milestone ohnehin durch den neuen Admin-API-Endpunkt ersetzt,
  hier nur die Rollenprüfung selbst aktualisieren, falls der alte
  Endpunkt vorübergehend parallel bestehen bleibt
- `packages/core/src/services/authorization/require-role.ts`:
  wiederverwendbare Prüf-Funktion `requireRole(user, minimumRole)` mit
  Rangfolge `member < tenant_admin < server_admin`, genutzt von der
  [Admin-API-Autorisierungs-Middleware](../../02-admin-api-scaffold/02-authorization-middleware.md)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite/Postgres/MySQL, bestehende
      `is_admin = true`-Testdaten werden korrekt zu `server_admin`
- [ ] `is_admin`-Spalte existiert nach der zweiten Migration nicht mehr
- [ ] `requireRole(user, 'tenant_admin')` akzeptiert sowohl
      `tenant_admin` als auch `server_admin`, lehnt `member` ab

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 24
