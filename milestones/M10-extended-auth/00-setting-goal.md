# M10 — Erweiterte Auth-Provider

## Setting (Kontext)
Seit M1/M2 ist Basic Auth der einzige Auth-Provider, aber die
Architektur ist von Anfang an pluggable ausgelegt (siehe
[planning/04-architecture.md](../../planning/04-architecture.md),
Auth-Schnittstellen-Split). M10 ist der eigentliche Härtetest dieser
Abstraktion: Digest Auth und OAuth2/Bearer-Token werden ergänzt, **ohne**
das core-seitige Auth-Provider-Interface oder die HTTP-seitige
Middleware-Struktur aus M1/M2 zu ändern — nur neue Provider zu
registrieren.

Das M1-`Credential`-Entity hat digest-/oauth2-spezifische Spalten
bewusst **nicht** angelegt ("um jetzt keine ungenutzten Felder
anzulegen") — M10 holt das jetzt nach.

## Scope-Entscheidungen für diese Milestone
- **Digest Auth**: SHA-256 als einziger unterstützter Algorithmus in
  v1 (RFC 7616) — **kein** MD5. Der Sicherheits-Trade-off des
  gespeicherten HA1-Werts (schwächer als der bcrypt/argon2-Hash für
  Basic Auth) wurde bereits in
  [planning/01-decisions.md](../../planning/01-decisions.md) Runde 12
  akzeptiert. MD5-Digest-Unterstützung für ältere Clients ist eine
  mögliche M11-Kompatibilitätsergänzung, siehe
  [planning/03-open-questions.md](../../planning/03-open-questions.md).
- **OAuth2**: DavNode ist ausschließlich **Resource Server**, **keine**
  eigene Authorization-Server-Implementierung (kein Ausstellen eigener
  Tokens, kein Login-Screen). Tokens müssen JWTs eines extern
  konfigurierten, vertrauenswürdigen OIDC-Identity-Providers sein
  (Validierung über dessen JWKS-Endpunkt).
- **Kein JIT-Provisioning**: ein gültiges OAuth2-Token authentifiziert
  nur Principals, die bereits als lokaler `User` existieren **und**
  deren externe Identität (Issuer + Subject) explizit über die
  Admin-API (M9) mit diesem `User` verknüpft wurde. Kein automatisches
  Anlegen neuer Nutzer beim ersten Login — bewusst zurückgestellt.
- **Nonce-Store in-process** (wie der node-cron-Scheduler aus M0,
  Runde 16) — funktioniert für Single-Instance-Deployments, bei
  künftiger horizontaler Skalierung müsste er extern (z.B. Redis)
  liegen.
- **Mehrere gleichzeitig aktive Schemes**: sind Basic, Digest und
  OAuth2 alle aktiviert, sendet der Server bei fehlender/ungültiger
  Authentifizierung **mehrere separate** `WWW-Authenticate`-Header
  (einen je Schema, nicht kommagetrennt in einer Zeile — Digest-Header
  enthalten selbst Kommas, was sonst mehrdeutig wäre).

## Ziel
Am Ende von M10 können Clients wahlweise Basic, Digest oder
OAuth2/Bearer nutzen (je nach Server-Konfiguration), alle drei über
dasselbe core-seitige Interface aus M1 — als Nachweis, dass die
Auth-Architektur tatsächlich erweiterbar ist, ohne bestehenden Code
anzufassen.

## Große Aufgaben (Übersicht)
1. [Credential-Entity-Retrofit](01-credential-entity-retrofit/00-overview.md)
2. [Digest-Auth-Core](02-digest-auth-core/00-overview.md)
3. [Digest-Auth-HTTP](03-digest-auth-http/00-overview.md)
4. [OAuth2-Core](04-oauth2-core/00-overview.md)
5. [OAuth2-HTTP](05-oauth2-http/00-overview.md)
6. [Provider-Verwaltung](06-provider-management/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→6).

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M10-Definition
- [planning/04-architecture.md](../../planning/04-architecture.md) — Auth-Schnittstellen-Split
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 2, 12, 25
- [planning/03-open-questions.md](../../planning/03-open-questions.md) — konkrete OAuth2/OIDC-Provider-Tests

## Abgrenzung (nicht Teil von M10)
- MD5-Digest (nur SHA-256)
- JIT-Provisioning für OAuth2-Nutzer
- Eigener OAuth2-Authorization-Server/Login-UI
- Token-Introspection (RFC 7662) als Alternative zu JWT/JWKS — v1 setzt
  ausschließlich signierte JWTs voraus
