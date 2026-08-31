# Sub-Task: principal-property-search-REPORT

## Kontext
RFC 3744 §9.4: Clients suchen Principals anhand von Property-Werten
(z.B. "finde den User-Principal mit `displayname` enthält 'Alice'"),
typischerweise genutzt, um beim Rechte-Vergeben einen Principal
auszuwählen. Registriert sich beim
[Generischen REPORT-Dispatcher](02-generic-report-dispatcher.md).

## Aufgabe
- `packages/core/src/acl/principal-property-search-report.ts`: parst den
  Request-Body (`<D:property-search>`-Elemente mit
  `<D:prop>`/`<D:match>`-Paaren), sucht unter den `User`- und
  `Group`-Principals des aktuellen Tenants nach Substring-Treffern auf
  den angefragten Properties (in M3 reicht `displayname`, weitere
  Properties können später ergänzt werden)
- Antwort: `207 Multi-Status` mit den Treffern, im selben Format wie
  PROPFIND-Antworten (nutzt den Multistatus-Builder aus M2)
- Ergebnis auf den aktuellen Tenant beschränkt (keine
  Tenant-übergreifende Principal-Suche)

## Akzeptanzkriterien
- [ ] Suche nach einem Teilstring des `displayname` findet den
      passenden User-Principal
- [ ] Suche liefert keine Treffer aus einem anderen Tenant
- [ ] Leeres Suchergebnis liefert einen validen, leeren
      `207`-Multistatus-Body (kein Fehler)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 3744 §9.4
