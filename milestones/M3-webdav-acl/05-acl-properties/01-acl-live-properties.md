# Sub-Task: ACL-Live-Properties

## Kontext
Registriert sich über den in M2 gebauten Property-Provider-Registry-
Mechanismus (bewusst dafür vorbereitet, siehe
[M2-Property-Provider-Abstraktion](../../M2-webdav-core/03-webdav-xml-property-infrastructure/02-property-provider-abstraction.md)).

## Aufgabe
- `packages/core/src/acl/acl-properties-provider.ts`: registriert einen
  zusätzlichen Property-Provider mit folgenden Properties:
  - `DAV:owner` — Principal-URL des `ownerPrincipalId` der Ressource
  - `DAV:supported-privilege-set` — statische Beschreibung des
    Privilege-Baums aus dem
    [Privilege-Katalog](../01-ace-entities-and-privileges/02-privilege-catalog.md)
    (inkl. Aggregationsstruktur: `DAV:all` enthält `DAV:write` enthält
    `DAV:write-content`/`DAV:write-properties`, ...)
  - `DAV:current-user-privilege-set` — Ergebnis von
    `getCurrentUserPrivilegeSet` aus der
    [ACL-Evaluation-Engine](../03-acl-evaluation-engine/00-overview.md)
    für den anfragenden Principal
  - `DAV:acl` — die vollständige ACE-Liste (direkt + geerbt, aus
    `collect-aces.ts`), inkl. `<D:protected/>`- und
    `<D:inherited>`-Markierung je ACE (RFC3744 §5.5)
  - `DAV:principal-collection-set` — Verweis auf
    `/dav/{tenant}/principals/` (RFC3744 §5.8)
  - `DAV:current-user-principal` — Principal-URL des anfragenden
    Principals (RFC 5397; da jede Route bereits Basic-Auth-geschützt
    ist, wird hier **nie** `<D:unauthenticated/>` zurückgegeben — dieser
    Fall ist für DavNode aktuell nicht erreichbar)
- **Bewusst nicht umgesetzt** (RFC3744, optional): `DAV:group`
  (kein Konzept einer "primären Gruppe" pro Ressource in DavNode),
  `DAV:acl-restrictions`, `DAV:inherited-acl-set` — als Kommentar im
  Code vermerkt, damit klar ist, dass das bewusste Auslassungen sind

## Akzeptanzkriterien
- [ ] PROPFIND mit `prop`-Request für `DAV:owner` liefert die korrekte
      Principal-URL
- [ ] `DAV:current-user-privilege-set` stimmt mit dem Ergebnis der
      Evaluation-Engine überein (Cross-Check-Test)
- [ ] `DAV:acl` enthält sowohl direkte als auch geerbte ACEs mit
      korrekter `<D:protected/>`/`<D:inherited>`-Markierung
- [ ] `DAV:current-user-principal` liefert immer eine konkrete
      Principal-URL, nie `<D:unauthenticated/>`

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 3744 §5, RFC 5397
