# Sub-Task: Autorisierungs-Middleware

## Kontext
Nutzt `requireRole` aus
[Role-Migration & Retrofits](../../01-role-model/01-role-migration-and-retrofits.md).
**Wichtig**: dies ist eine **andere** Autorisierung als die WebDAV-ACL-
Engine (M3) — Admin-Operationen (Nutzer anlegen, Tenant löschen, ...)
sind keine DAV-Ressourcenzugriffe und werden **nicht** über ACEs
geprüft, sondern rein über `User.role`.

## Aufgabe
- `packages/admin-api/src/require-admin-role.middleware.ts`:
  Express-Middleware-Factory `requireAdminRole(minimumRole: 'tenant_admin' | 'server_admin')`
- Für Routen mit `{tenantSlug}` als **Ziel**-Tenant (User-/Gruppen-/
  Quota-Management, Große Aufgaben 4–6): `tenant_admin` reicht, **aber
  nur wenn** `req.principal`s `User.tenantId` dem `{tenantSlug}` aus
  der URL entspricht (ein `tenant_admin` darf **nicht** einen fremden
  Tenant verwalten); ein `server_admin` darf **jeden** `{tenantSlug}`
  verwalten, unabhängig vom eigenen Tenant
- Für Tenant-Management-Routen (Große Aufgabe 3, `{tenantSlug}` ist nur
  Auth-Anker, siehe [00-setting-goal.md](../../00-setting-goal.md)):
  ausschließlich `server_admin` — hier greift die
  Tenant-Übereinstimmungs-Prüfung **nicht** (per Definition
  tenant-übergreifend)
- Fehlende Berechtigung → `403` mit JSON-Envelope, klarer `code` (z.B.
  `"insufficient_role"`)

## Akzeptanzkriterien
- [ ] `tenant_admin` kann Nutzer im **eigenen** Tenant verwalten, bekommt
      `403` beim Versuch, einen **fremden** Tenant zu verwalten
- [ ] `server_admin` kann jeden Tenant verwalten
- [ ] `member` bekommt bei jeder Admin-Route `403`
- [ ] Tenant-Management-Routen sind für `tenant_admin` (auch im eigenen
      Tenant) grundsätzlich gesperrt, nur `server_admin` kommt durch

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 24
