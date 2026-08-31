# Sub-Task: IdP-Konfiguration & JWKS-Client

## Kontext
DavNode validiert JWTs eines oder mehrerer extern konfigurierter,
vertrauenswürdiger OIDC-Provider — kein eigener Authorization-Server.

## Aufgabe
- Konfigurationsformat (Umgebungsvariablen oder Config-Datei, z.B.
  `DAVNODE_OAUTH2_ISSUERS` als JSON-Array): je Eintrag `issuer`
  (erwarteter `iss`-Claim), `audience` (erwarteter `aud`-Claim),
  `jwksUri` (Endpunkt für die Public Keys) — **explizite** JWKS-URL,
  **keine** automatische OIDC-Discovery (`/.well-known/openid-
  configuration`) in v1, hält die Konfiguration einfach und
  nachvollziehbar
- `packages/core/src/auth/jwks-client.ts`: lädt und cached die JWKS
  eines Issuers (Key-Set nach `kid` indiziert); bei einer JWT-Signatur
  mit unbekanntem `kid` (z.B. nach Schlüsselrotation beim IdP): **ein**
  erneuter Fetch, **rate-limited** (z.B. max. 1 Refresh pro Minute je
  Issuer), um nicht durch gezielt manipulierte `kid`-Werte in einen
  Fetch-Loop gezwungen zu werden
- Mehrere konfigurierte Issuer werden parallel unterstützt (ein Token
  muss zu **genau einem** der konfigurierten Issuer passen)

## Akzeptanzkriterien
- [ ] JWKS eines konfigurierten Issuers wird geladen und für
      nachfolgende Validierungen gecached (kein Netzwerk-Call pro
      Request bei bekanntem `kid`)
- [ ] Unbekannter `kid` löst genau einen Refresh-Versuch aus
- [ ] Mehrfache Anfragen mit demselben unbekannten `kid` innerhalb der
      Rate-Limit-Frist lösen **keinen** weiteren Fetch aus
- [ ] Ein Token mit `iss`, der zu keinem konfigurierten Issuer passt,
      wird gar nicht erst gegen JWKS geprüft (frühzeitiger Abbruch)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 25
