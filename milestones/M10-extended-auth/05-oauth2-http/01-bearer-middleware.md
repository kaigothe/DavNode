# Sub-Task: Bearer-Middleware

## Kontext
RFC 6750. Nutzt den
[OAuth2-Provider](../../04-oauth2-core/02-jwt-validation-and-subject-mapping.md).

## Aufgabe
- `packages/server/src/http/oauth2-bearer.middleware.ts`: liest
  `Authorization: Bearer <token>`, ruft den core-seitigen
  `oauth2`-Provider auf
- Fehlender Header → `401` mit
  `WWW-Authenticate: Bearer realm="davnode"` (kein `error`-Parameter,
  RFC6750 §3.1 — nur bei einem tatsächlich **vorhandenen**, aber
  ungültigen Token wird `error` gesetzt)
- Vorhandener, aber ungültiger/abgelaufener Token → `401` mit
  `WWW-Authenticate: Bearer realm="davnode", error="invalid_token"`
- Erfolg: `req.principal` gesetzt

## Akzeptanzkriterien
- [ ] Gültiger Bearer-Token authentifiziert erfolgreich
- [ ] Fehlender `Authorization`-Header liefert `401` ohne
      `error`-Parameter
- [ ] Abgelaufener/ungültiger Token liefert `401` mit
      `error="invalid_token"`
- [ ] Ein `Authorization: Basic ...`-Header wird von dieser Middleware
      ignoriert (nicht fälschlich als ungültiges Bearer-Token behandelt
      — Schema-Erkennung anhand des Präfixes)

## Referenzen
- [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md) — RFC 6750
