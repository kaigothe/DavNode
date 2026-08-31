# Große Aufgabe: Express-Server-Bootstrap

## Ziel
`@davnode/server` wird von einem Platzhalter-Package (nur `VERSION`-
Export seit M0) zu einem tatsächlich laufenden HTTP-Server: Express-App,
Tenant-Auflösung aus der URL, HTTP-Basic-Auth, eine
Platzhalter-Autorisierung (Owner-only, bis M3) und einheitliches
Error-Handling.

## Sub-Tasks
1. [Express-App & Server-Entrypoint](01-express-app-and-entrypoint.md)
2. [Tenant-Resolution-Middleware](02-tenant-resolution-middleware.md)
3. [HTTP-Basic-Auth-Middleware](03-basic-auth-http-middleware.md)
4. [Platzhalter-Autorisierung & Error-Handling](04-placeholder-authorization-and-error-handling.md)

## Referenzen
- [planning/04-architecture.md](../../../planning/04-architecture.md) — Auth-Schnittstellen-Split
- [planning/05-data-model.md](../../../planning/05-data-model.md) — URL-Schema
