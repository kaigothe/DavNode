# Sub-Task: Tenant-Entity

## Kontext
Multi-Tenancy läuft über Shared Schema mit `tenant_id`
([planning/01-decisions.md](../../../planning/01-decisions.md) Runde 3).
Tenants werden über einen Pfad-Präfix adressiert (`/dav/{slug}/...`,
Runde 15).

## Aufgabe
- `Tenant`-Entity in `packages/core/src/entities/tenant.entity.ts` anlegen
  gemäß [planning/05-data-model.md](../../../planning/05-data-model.md):
  `id` (UUID, Primary Key), `slug` (string, unique, URL-sicher — nur
  `[a-z0-9-]`, validiert), `name`, `quotaLimitBytes` (nullable = kein
  Limit), `quotaUsedBytes` (default 0), `createdAt`
- Migration erzeugen, die die `tenants`-Tabelle anlegt, inkl. Unique-Index
  auf `slug`
- Kurzer Vitest-Test: Tenant anlegen und per `slug` wiederfinden

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite (aus M0-Testmatrix)
- [ ] `slug` ist unique und wird bei Verletzung mit einem DB-Fehler
      abgelehnt (Test dafür vorhanden)
- [ ] `quotaUsedBytes` hat einen Default von `0`, `quotaLimitBytes` ist
      nullable (kein Limit = `null`, nicht `0`)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Core/Tenancy
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 15
