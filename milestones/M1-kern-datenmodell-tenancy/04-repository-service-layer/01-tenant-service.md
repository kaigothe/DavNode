# Sub-Task: TenantService

## Kontext
Erster Service im Repository-/Service-Layer — Muster für die folgenden
Sub-Tasks (UserService, GroupService, GroupMembershipService).

## Aufgabe
- `packages/core/src/services/tenant.service.ts` mit:
  - `createTenant({ slug, name, quotaLimitBytes? }): Promise<Tenant>` —
    legt den Tenant an **und** erzeugt in derselben Transaktion die
    tenant-eigenen Sonder-Principals (`all`, `authenticated`,
    `unauthenticated`) aus
    [Sonder-Principals-Handling](../03-principal-url-schema/02-special-principals.md)
  - `findTenantBySlug(slug: string): Promise<Tenant | null>`
  - `updateTenantQuota(tenantId, { quotaLimitBytes }): Promise<Tenant>`
- Alle DB-Zugriffe über TypeORM-Repository, gekapselt hinter dem
  Service — kein direkter Repository-Zugriff von außerhalb (Vorbereitung
  auf `server`/`admin-api`, die nur den Service kennen sollen)
- Transaktions-Handling: `createTenant` schlägt komplett fehl (kein
  Teil-Zustand), wenn die Sonder-Principal-Erzeugung scheitert

## Akzeptanzkriterien
- [ ] `createTenant` legt Tenant + 3 Sonder-Principals in einer
      Transaktion an (Test: bei simuliertem Fehler nach Tenant-Insert
      existiert am Ende weder Tenant noch Principal)
- [ ] `findTenantBySlug` liefert `null` bei unbekanntem Slug, keine
      Exception
- [ ] Duplicate-Slug führt zu einem klaren, aufrufbaren Fehler (nicht nur
      einer rohen DB-Exception)

## Referenzen
- [planning/04-architecture.md](../../../planning/04-architecture.md)
