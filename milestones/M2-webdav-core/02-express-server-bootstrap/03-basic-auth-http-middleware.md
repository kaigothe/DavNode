# Sub-Task: HTTP-Basic-Auth-Middleware

## Kontext
M1 hat den HTTP-unabhängigen Basic-Auth-Provider gebaut
([core/auth](../../M1-kern-datenmodell-tenancy/02-credential-auth-interface/04-basic-auth-provider.md)).
Diese Aufgabe baut die **HTTP-seitige** Hälfte gemäß dem
Auth-Schnittstellen-Split
([planning/04-architecture.md](../../../planning/04-architecture.md)):
Header-Parsing, `WWW-Authenticate`-Challenge.

## Aufgabe
- `packages/server/src/http/basic-auth.middleware.ts`: liest den
  `Authorization`-Header, dekodiert `Basic base64(username:password)`,
  ruft den core-seitigen Basic-Auth-Provider (`verify`) mit
  `{ tenantSlug: req.tenant.slug, username, password }` auf
- Fehlender/ungültiger Header oder fehlgeschlagene Verifikation →
  `401 Unauthorized` mit `WWW-Authenticate: Basic realm="davnode"`-
  Header (Realm-Name konfigurierbar, Default `davnode`)
- Bei Erfolg: authentifizierter `Principal` wird als `req.principal` am
  Request angehängt (typsicher, siehe Tenant-Resolution-Middleware)
- Läuft **nach** der Tenant-Resolution-Middleware (Sub-Task 2), da der
  Tenant-Kontext für die Verifikation gebraucht wird
- Kein Klartext-Passwort in Logs (auch nicht in Fehlermeldungen)

## Akzeptanzkriterien
- [ ] Request ohne `Authorization`-Header → `401` mit korrektem
      `WWW-Authenticate`-Header
- [ ] Request mit falschem Passwort → `401` (keine Unterscheidung zur
      "User existiert nicht"-Antwort, siehe Timing-Schutz aus M1)
- [ ] Request mit korrekten Credentials → Route wird erreicht,
      `req.principal` ist gesetzt
- [ ] Kein Passwort (auch nicht base64-kodiert) taucht in Server-Logs auf

## Referenzen
- [planning/04-architecture.md](../../../planning/04-architecture.md)
