# Sub-Task: Tenant-CRUD

## Kontext
Nutzt
[TenantService aus M1](../../../M1-kern-datenmodell-tenancy/04-repository-service-layer/01-tenant-service.md)
(bereits inkl. Sonder-Principal-Erzeugung in einer Transaktion). Nur
`server_admin` (siehe
[Autorisierungs-Middleware](../../02-admin-api-scaffold/02-authorization-middleware.md)).

## Aufgabe
- `POST /admin/{tenantSlug}/tenants` — legt einen **neuen** Tenant an
  (`{tenantSlug}` in der URL ist der Auth-Anker, **nicht** der neue
  Tenant — dessen `slug`/`name` kommen aus dem Request-Body); nutzt
  `TenantService.createTenant`
- `GET /admin/{tenantSlug}/tenants` — listet **alle** Tenants der
  Instanz (nicht nur den eigenen)
- `GET /admin/{tenantSlug}/tenants/{targetSlug}` — Details eines
  einzelnen Tenants (inkl. `quotaLimitBytes`/`quotaUsedBytes`)
- `PATCH /admin/{tenantSlug}/tenants/{targetSlug}` — aktualisiert
  `name`, `quotaLimitBytes` (nutzt `TenantService.updateTenantQuota`)
  — **wichtig**: diese Route ist bewusst nur für `server_admin`
  erreichbar, damit ein Tenant sein eigenes Quota-Limit nicht selbst
  anheben kann (Sicherheitsaspekt, siehe
  [Autorisierungs-Middleware](../../02-admin-api-scaffold/02-authorization-middleware.md))

## Akzeptanzkriterien
- [ ] `POST` legt einen neuen Tenant inkl. Sonder-Principals an (Cross-
      Check mit M1-Verhalten)
- [ ] `GET`-Liste enthält Tenants unabhängig vom Tenant des
      anfragenden `server_admin`
- [ ] `PATCH` aktualisiert `quotaLimitBytes` korrekt, ein `tenant_admin`
      bekommt bei diesem Endpunkt durchgängig `403` (auch für den
      eigenen Tenant)
- [ ] Duplicate-Slug bei `POST` liefert einen sprechenden Fehler
      (`409`), kein roher DB-Fehler

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 24
