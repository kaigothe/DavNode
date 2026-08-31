# M1 — Kern-Datenmodell & Multi-Tenancy-Fundament

## Setting (Kontext)
M0 hat das technische Fundament gelegt (Monorepo, TypeScript/Lint/Test,
TypeORM-Infrastruktur ohne Entities, Docker, CI) — siehe
[milestones/M0-fundament](../M0-fundament/00-setting-goal.md). M1 füllt
`@davnode/core` jetzt mit den ersten fachlichen Entities: Tenant,
Principal, User, Group. Diese Entities sind die Grundlage für **alle**
späteren Meilensteine (WebDAV-Ressourcen, ACL, CalDAV, CardDAV hängen alle
an `owner_principal_id`/`tenant_id`) — siehe
[planning/05-data-model.md](../../planning/05-data-model.md).

Multi-Tenancy ist von Anfang an im Schema verankert (Pfad-Präfix-Tenancy,
`tenant_id`-Spalten, shared Schema — siehe
[planning/01-decisions.md](../../planning/01-decisions.md) Runde 3, 15),
auch wenn ein einzelnes Deployment oft nur einen Tenant nutzen wird.

## Ziel
Am Ende von M1 existieren in `@davnode/core`:
- Die Entities `Tenant`, `Principal`, `User`, `Group`, `GroupMembership`,
  `Credential` inkl. Migrationen (aufbauend auf dem Migrations-Workflow
  aus M0)
- Ein pluggables Auth-Provider-Interface plus eine funktionierende
  Basic-Auth-Implementierung (Credential-Verifikation, kein HTTP — das
  folgt in M2)
- Ein Principal-URL-Mapping-Modul (inkl. Sonder-Principals wie
  `DAV:authenticated`/`DAV:all`)
- Ein Service-/Repository-Layer für Tenant/User/Group/Membership, den
  spätere Meilensteine (Server, Admin-API) direkt wiederverwenden
- Ein Bootstrap-/Seed-Mechanismus, mit dem sich ein erster Tenant + Admin-
  User anlegen lässt (nötig, da die Admin-API erst in M9 entsteht)

Es gibt weiterhin **keine** HTTP-Routen und **keine** WebDAV/CalDAV/
CardDAV-Ressourcen (Collection/FileResource/... folgen ab M2).

## Große Aufgaben (Übersicht)
1. [Core-Domänen-Entities](01-core-entities/00-overview.md) — Tenant, Principal, User, Group, GroupMembership
2. [Credential-Entity & Auth-Provider-Interface](02-credential-auth-interface/00-overview.md) — Basic Auth als erster Provider
3. [Principal-URL-Schema](03-principal-url-schema/00-overview.md)
4. [Repository-/Service-Layer](04-repository-service-layer/00-overview.md)
5. [Seed-/Bootstrap-Tooling](05-seed-bootstrap-tooling/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→5) — jede Aufgabe
baut auf der Entity-Struktur der vorherigen auf.

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M1-Definition
- [planning/05-data-model.md](../../planning/05-data-model.md) — Entity-Felder, URL-Schema
- [planning/04-architecture.md](../../planning/04-architecture.md) — Auth-Interface-Split (core vs. server)
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runden 3, 9–12, 15 (Tenancy, Principals, Domänentrennung, Digest-Hinweis)

## Abgrenzung (nicht Teil von M1)
- Keine HTTP-Routen/Express-Middleware (auch nicht für Basic Auth — die
  HTTP-seitige `WWW-Authenticate`-Mechanik ist Teil von `server` und
  kommt mit M2, siehe [planning/04-architecture.md](../../planning/04-architecture.md))
- Kein Digest- oder OAuth2-Auth-Provider (M10) — `Credential`-Entity
  bekommt dafür erst dann eigene Spalten, um jetzt keine ungenutzten
  Felder mitzuschleppen
- Keine WebDAV/CalDAV/CardDAV-Ressourcen-Entities (M2/M5/M6)
- Keine Admin-API (M9) — Seed-Tooling in M1 ist ein reines CLI-Skript,
  kein HTTP-Endpoint
