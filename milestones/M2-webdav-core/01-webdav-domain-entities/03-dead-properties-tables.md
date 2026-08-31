# Sub-Task: Dead-Properties-Tabellen

## Kontext
Bei der M2-Detailplanung entdeckte Lücke im Datenmodell (siehe
[planning/01-decisions.md](../../../planning/01-decisions.md) Runde 18):
PROPPATCH (RFC 4918) erlaubt Clients, beliebige, vom Server nicht
vordefinierte Properties zu setzen ("dead properties") — dafür fehlte
bisher ein Speicherort.

## Aufgabe
- `CollectionProperty`-Entity
  (`packages/core/src/entities/collection-property.entity.ts`): `id`
  (UUID), `collectionId` (FK → Collection), `namespace` (XML-Namespace-
  URI, z.B. `DAV:` oder ein Custom-Namespace), `name` (lokaler
  Property-Name), `value` (Text/XML-Fragment als String)
- `FileProperty`-Entity analog für `FileResource`
- Migrationen für beide Tabellen; Unique-Index auf
  `(collection_id, namespace, name)` bzw.
  `(file_resource_id, namespace, name)`
- Kurzer Kommentar/Doku-Hinweis, dass **live properties**
  (`displayname`, `getcontentlength`, `getcontenttype`, `getetag`,
  `getlastmodified`, `creationdate`, `resourcetype`) **nicht** hier
  gespeichert werden, sondern aus den festen Entity-Spalten abgeleitet
  werden (siehe
  [Property-Provider-Abstraktion](../03-webdav-xml-property-infrastructure/02-property-provider-abstraction.md))

## Akzeptanzkriterien
- [ ] Migrationen laufen sauber gegen SQLite/Postgres/MySQL
- [ ] `(collection_id, namespace, name)` bzw.
      `(file_resource_id, namespace, name)` sind unique
- [ ] Test: dieselbe Property zweimal für dieselbe Ressource setzen
      **überschreibt** den Wert (kein Duplikat), siehe späteres
      PROPPATCH-Verhalten

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — WebDAV-Domäne
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 18
