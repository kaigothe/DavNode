# Sub-Task: URL-Mapping für User-/Gruppen-Principals

## Kontext
URL-Schema mit Pfad-Präfix-Tenancy, festgelegt in
[planning/05-data-model.md](../../../planning/05-data-model.md),
Abschnitt "URL-Schema":
`/dav/{tenant}/principals/users/{userId}` und
`/dav/{tenant}/principals/groups/{groupId}`.

## Aufgabe
- `packages/core/src/principals/principal-url.ts` mit zwei Funktionen:
  - `toPrincipalUrl(principal: Principal, tenant: Tenant): string` —
    baut die URL für einen User- oder Gruppen-Principal
  - `parsePrincipalUrl(url: string): { tenantSlug: string; kind: 'user' | 'group'; id: string } | null`
    — zerlegt eine URL wieder in ihre Bestandteile, `null` bei
    ungültigem Format
- Funktionen sind reine, zustandslose String-Transformationen (kein
  DB-Zugriff, kein HTTP) — Auflösung von URL zu tatsächlichem
  `Principal`-Datensatz ist Aufgabe des Service-Layers (Große Aufgabe 4)
  bzw. später der `server`-Routen (M2/M3)
- Tests: Hin- und Rücktransformation ist verlustfrei (Roundtrip-Test),
  ungültige URLs liefern `null` statt zu werfen

## Akzeptanzkriterien
- [ ] Roundtrip-Test (`parsePrincipalUrl(toPrincipalUrl(p, t))` ergibt
      wieder `{tenantSlug: t.slug, kind, id: p.id}`) ist grün
- [ ] Ungültige/fremde URLs (falsches Präfix, fehlendes Segment) liefern
      `null`, werfen keine Exception

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — URL-Schema
