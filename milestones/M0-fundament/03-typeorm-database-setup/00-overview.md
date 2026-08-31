# Große Aufgabe: TypeORM & Datenbank-Setup

## Ziel
`@davnode/core` kann sich über TypeORM gegen PostgreSQL, SQLite und
MySQL/MariaDB verbinden (DataSource-Konfiguration ist DB-agnostisch, über
Umgebungsvariablen gesteuert), inklusive eines lauffähigen
Migrations-Workflows. Es gibt in M0 noch **keine** fachlichen Entities
(Tenant/User/... folgen in M1) — nur die Infrastruktur.

## Sub-Tasks
1. [TypeORM-DataSource-Konfiguration](01-typeorm-datasource-config.md)
2. [Migrations-Workflow](02-migration-workflow.md)
3. [DB-Engine-Testmatrix](03-db-engine-test-matrix.md)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 1 (TypeORM-Wahl), Runde 3 (DB-Engines)
- [planning/05-data-model.md](../../../planning/05-data-model.md) — Entities folgen erst in M1
