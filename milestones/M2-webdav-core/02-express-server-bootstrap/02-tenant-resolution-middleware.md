# Sub-Task: Tenant-Resolution-Middleware

## Kontext
Pfad-Präfix-Tenancy: `/dav/{tenantSlug}/...`
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 15).
Jede DAV-Route braucht Zugriff auf den aufgelösten Tenant, bevor
irgendeine Ressourcen-Logik läuft.

## Aufgabe
- `packages/server/src/http/tenant-resolution.middleware.ts`: liest das
  `{tenantSlug}`-Segment aus der URL, lädt den `Tenant` über
  `TenantService.findTenantBySlug` (aus M1), hängt ihn als
  `req.tenant` an das Request-Objekt (typsicher über eine erweiterte
  Express-`Request`-Typdeklaration, kein `any`)
- Unbekannter `tenantSlug` → `404 Not Found` (nicht `403`, um nicht zu
  verraten, ob der Slug grundsätzlich reserviert ist — Standard-
  Praxis für Multi-Tenant-Systeme)
- Middleware wird **vor** der Auth-Middleware (nächster Sub-Task)
  eingehängt, da der Tenant-Kontext für die Basic-Auth-Verifikation
  gebraucht wird (Username ist nur innerhalb eines Tenants eindeutig,
  siehe M1 [User-Entity](../../M1-kern-datenmodell-tenancy/01-core-entities/03-user-entity.md))

## Akzeptanzkriterien
- [ ] Request gegen einen existierenden Tenant-Slug hängt `req.tenant`
      korrekt an
- [ ] Request gegen einen unbekannten Slug liefert `404`, bevor
      irgendeine Auth- oder Ressourcen-Logik läuft
- [ ] Middleware macht keine Annahmen über das Ressourcen-Segment
      danach (funktioniert später auch für `/calendars/`,
      `/addressbooks/` in M5/M6)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — URL-Schema
