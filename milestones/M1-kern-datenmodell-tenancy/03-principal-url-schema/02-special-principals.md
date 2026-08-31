# Sub-Task: Sonder-Principals-Handling

## Kontext
`DAV:authenticated`, `DAV:all`, `DAV:unauthenticated`, `DAV:owner`,
`DAV:self` haben laut RFC 3744 **keine** eigene URL — sie werden als
spezielle XML-Elemente innerhalb von `<D:principal>` dargestellt (z.B.
`<D:all/>`), sind in der DB aber trotzdem `Principal`-Zeilen mit
`kind = 'special'` (siehe
[planning/05-data-model.md](../../../planning/05-data-model.md) und
[Principal-Entity](../01-core-entities/02-principal-entity.md)).

## Aufgabe
- `packages/core/src/principals/special-principals.ts` mit:
  - Einer Konstanten-Liste der unterstützten `specialKind`-Werte
  - `toSpecialPrincipalXmlElement(specialKind): string` — liefert den
    XML-Elementnamen (`'all'`, `'authenticated'`, ...) für die spätere
    ACL-Serialisierung (M3), hier nur als reine Mapping-Funktion ohne
    tatsächliche XML-Bibliothek
  - `isSpecialPrincipal(principal: Principal): boolean`
- Klarstellen (Code-Kommentar + kurzer Abschnitt in
  `packages/core/README.md`), dass Sonder-Principals **pro Tenant**
  angelegt werden (nicht global) — Bootstrap-Erzeugung erfolgt in
  [Seed-/Bootstrap-Tooling](../05-seed-bootstrap-tooling/00-overview.md)

## Akzeptanzkriterien
- [ ] Alle fünf Sonder-Kinds sind abgedeckt (Test pro Kind)
- [ ] `isSpecialPrincipal` liefert `false` für reguläre User-/
      Gruppen-Principals

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — URL-Schema
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 10
