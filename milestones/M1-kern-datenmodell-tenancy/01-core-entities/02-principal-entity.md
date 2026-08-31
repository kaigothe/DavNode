# Sub-Task: Principal-Entity

## Kontext
Dediziertes `principals`-Table als Grundlage für alle ACL-Referenzen
(RFC 3744) — siehe
[planning/01-decisions.md](../../../planning/01-decisions.md) Runde 10.
User **und** Group referenzieren jeweils einen Principal; Sonder-
Principals (`DAV:authenticated`, `DAV:all`, `DAV:unauthenticated`,
`DAV:owner`, `DAV:self`) sind ebenfalls Principal-Zeilen, aber ohne
zugehörige User-/Group-Zeile.

## Aufgabe
- `Principal`-Entity in `packages/core/src/entities/principal.entity.ts`:
  `id` (UUID), `tenantId` (FK → Tenant), `kind` (Enum:
  `'user' | 'group' | 'special'`), `specialKind` (nullable Enum:
  `'authenticated' | 'unauthenticated' | 'all' | 'owner' | 'self'`,
  nur gesetzt wenn `kind = 'special'`)
- DB-Constraint (Check-Constraint oder Anwendungslogik + Test):
  `specialKind` ist **nur** gesetzt, wenn `kind = 'special'`, sonst
  `null`
- Migration für `principals`-Tabelle mit FK auf `tenants` und Index auf
  `(tenant_id, kind)`
- Wichtig: **Special-Principals sind pro Tenant eigene Zeilen**, keine
  globalen Singletons — jeder Tenant bekommt bei seiner Anlage eigene
  `all`/`authenticated`/`unauthenticated`-Principal-Zeilen (wird in
  [Seed-/Bootstrap-Tooling](../05-seed-bootstrap-tooling/00-overview.md)
  tatsächlich befüllt, hier nur das Schema/die Entity)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite
- [ ] Ein Principal mit `kind = 'user'` und gesetztem `specialKind` wird
      von einem Test/einer Anwendungsvalidierung als ungültig erkannt
- [ ] FK auf `Tenant` vorhanden, Index auf `(tenant_id, kind)` vorhanden

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Core/Tenancy
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 10
