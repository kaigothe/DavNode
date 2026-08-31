# Große Aufgabe: WebDAV-Domänen-Entities

## Ziel
Die WebDAV-Domäne aus
[planning/05-data-model.md](../../../planning/05-data-model.md)
existiert als TypeORM-Entities: `Collection`, `FileResource`,
`FileContent`, plus die bei der M2-Detailplanung ergänzten
Dead-Properties-Tabellen (`CollectionProperty`, `FileProperty`, Runde
18). Außerdem wird sichergestellt, dass jeder Tenant nach dem Bootstrap
eine Root-Collection hat.

## Sub-Tasks
1. [Collection-Entity](01-collection-entity.md)
2. [FileResource- & FileContent-Entity](02-file-resource-and-content-entity.md)
3. [Dead-Properties-Tabellen](03-dead-properties-tables.md)
4. [Root-Collection-Bootstrap](04-root-collection-bootstrap.md)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — WebDAV-Domäne
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 10, 11 (Domänentrennung), Runde 18 (Dead Properties)
