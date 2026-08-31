# Sub-Task: FileResource- & FileContent-Entity

## Kontext
Content-Split (Metadaten vs. Blob) gemäß
[planning/01-decisions.md](../../../planning/01-decisions.md) Runde 10 —
PROPFIND/Property-Queries sollen keine großen Blobs mitladen.

## Aufgabe
- `FileResource`-Entity in
  `packages/core/src/entities/file-resource.entity.ts`: `id` (UUID),
  `tenantId` (FK → Tenant), `collectionId` (FK → Collection, die
  Eltern-Collection), `name` (Dateiname, eindeutig **innerhalb** der
  Eltern-Collection), `contentType`, `etag`, `sizeBytes`,
  `ownerPrincipalId` (FK → Principal), `createdAt`, `updatedAt`
- `FileContent`-Entity in
  `packages/core/src/entities/file-content.entity.ts`: `id` (UUID),
  `fileResourceId` (FK → FileResource, **unique**), `data` (Blob-Spalte
  — konkreter TypeORM-Spaltentyp je DB-Treiber, siehe offene Frage in
  [planning/03-open-questions.md](../../../planning/03-open-questions.md))
- Migration für beide Tabellen; Unique-Index auf
  `(collection_id, name)` bei `FileResource` (kein doppelter Dateiname
  in derselben Collection)
- `FileResource` und `FileContent` werden **immer gemeinsam**
  angelegt/gelöscht (Service-Ebene, siehe
  [PUT](../06-resource-crud/03-put.md)/[DELETE](../06-resource-crud/04-delete.md)) —
  hier nur das Schema, keine Cascade-Delete auf DB-Ebene nötig, wenn die
  Service-Schicht das transaktional sauber macht (im Zweifel zusätzlich
  `ON DELETE CASCADE` auf der FK setzen als Sicherheitsnetz)

## Akzeptanzkriterien
- [ ] Migration läuft sauber gegen SQLite/Postgres/MySQL
- [ ] `(collection_id, name)` ist unique (Test: zweiter Versuch mit
      gleichem Namen in derselben Collection schlägt fehl)
- [ ] Löschen eines `FileResource` hinterlässt keine verwaiste
      `FileContent`-Zeile (Test)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
