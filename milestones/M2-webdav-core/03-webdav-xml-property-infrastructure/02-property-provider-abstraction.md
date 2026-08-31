# Sub-Task: Property-Provider-Abstraktion

## Kontext
Properties kommen aus zwei Quellen: **Live-Properties** (aus festen
Entity-Spalten abgeleitet, z.B. `getetag` aus `FileResource.etag`) und
**Dead-Properties** (aus den in Runde 18 ergänzten `*_properties`-
Tabellen, siehe
[Dead-Properties-Tabellen](../01-webdav-domain-entities/03-dead-properties-tables.md)).
PROPFIND und PROPPATCH brauchen beide einheitlich — und spätere
Meilensteine (M3 ACL-Properties wie `owner`/`acl`, M5/M6 CalDAV/CardDAV-
Properties) müssen sich hier einklinken können, ohne PROPFIND/PROPPATCH
selbst zu ändern.

## Aufgabe
- `packages/core/src/webdav/properties/property-provider.interface.ts`:
  Interface mit z.B. `listLiveProperties(resource): PropertyValue[]` und
  `isLiveProperty(namespace, name): boolean` (um in PROPPATCH zu
  erkennen: Live-Properties sind nicht per PROPPATCH änderbar → `403
  Forbidden` mit `cannot-modify-protected-property`-Fehler laut RFC4918)
- Konkrete Implementierung für die WebDAV-Domäne
  (`packages/core/src/webdav/properties/webdav-live-properties.ts`):
  liefert `creationdate`, `displayname`, `getcontentlength`,
  `getcontenttype`, `getetag`, `getlastmodified`, `resourcetype`
  (`<D:collection/>` für Collections, leer für FileResources) sowie —
  für Class-1-Konformität ohne echtes Locking —
  `supportedlock` (leer, keine Lock-Typen) und `lockdiscovery` (leer)
- Ein Registry-Mechanismus (analog zur Auth-Provider-Registry aus M1),
  über den spätere Meilensteine zusätzliche Property-Provider
  (ACL-Properties in M3, CalDAV/CardDAV-Properties in M5/M6) registrieren
  können, ohne diesen Code zu ändern

## Akzeptanzkriterien
- [ ] Für eine `Collection` liefert `listLiveProperties` u.a.
      `resourcetype = <D:collection/>`, für eine `FileResource` ein
      leeres `resourcetype`
- [ ] `isLiveProperty('DAV:', 'getetag')` liefert `true`,
      `isLiveProperty('http://example.com/custom', 'foo')` liefert
      `false`
- [ ] Ein zusätzlicher Property-Provider lässt sich registrieren und
      seine Properties tauchen in `listLiveProperties` mit auf (Test mit
      einem Dummy-Provider, als Nachweis der Erweiterbarkeit für M3+)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md)
