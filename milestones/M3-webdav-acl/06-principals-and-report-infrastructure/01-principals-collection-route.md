# Sub-Task: Principals-Collection-Route

## Kontext
`/dav/{tenant}/principals/` ist selbst PROPFIND-fähig (RFC3744 §5.8,
Principal-Collection). Nutzt das
[Principal-URL-Schema aus M1](../../M1-kern-datenmodell-tenancy/03-principal-url-schema/01-principal-url-mapping.md).

## Aufgabe
- `packages/server/src/http/routes/principals.route.ts`: beantwortet
  PROPFIND auf `/dav/{tenant}/principals/`, `/dav/{tenant}/principals/users/`
  und `/dav/{tenant}/principals/groups/` mit den jeweils enthaltenen
  Principal-Ressourcen (Depth 0/1 wie bei regulärem PROPFIND, siehe M2)
- Jeder einzelne User-/Gruppen-Principal ist selbst per PROPFIND
  adressierbar (`/dav/{tenant}/principals/users/{id}`) und liefert
  Basis-Properties: `DAV:displayname` (Username bzw. Gruppenname),
  `DAV:resourcetype` (`<D:principal/>`)
- Principal-Properties werden über denselben Property-Provider-Registry-
  Mechanismus wie WebDAV-Ressourcen (M2) ausgeliefert, **nicht** fest
  verdrahtet — Grund: spätere Meilensteine registrieren zusätzliche
  Principal-Properties, ohne diese Datei zu ändern (M5:
  `CARD:addressbook-home-set`, M6: `CALDAV:calendar-home-set`)
- Zugriff auf die Principals-Collection erfordert **keine**
  ressourcenspezifische ACL-Prüfung über die WebDAV-ACL-Engine (jeder
  authentifizierte Nutzer des Tenants darf die Principal-Liste sehen,
  um z.B. Rechte vergeben zu können) — bewusste Vereinfachung, im Code
  als solche kommentiert

## Akzeptanzkriterien
- [ ] PROPFIND `Depth: 1` auf `/dav/{tenant}/principals/users/` listet
      alle User-Principals des Tenants
- [ ] PROPFIND auf einen einzelnen Principal liefert `resourcetype`
      `<D:principal/>`
- [ ] Principals eines **anderen** Tenants sind über diesen Pfad nicht
      erreichbar (Tenant-Isolation-Test)

## Referenzen
- [planning/05-data-model.md](../../../planning/05-data-model.md) — URL-Schema
