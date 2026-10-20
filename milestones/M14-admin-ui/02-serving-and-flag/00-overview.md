# Große Aufgabe: Auslieferung & Flag

## Ziel
Der Express-Server liefert das gebaute UI-Bundle unter `/admin-ui` aus —
aber nur, wenn es ausdrücklich eingeschaltet ist.

## Sub-Tasks
1. **Konfiguration**: `DAVNODE_ADMIN_UI_ENABLED` (Default `false`) und
   `DAVNODE_ADMIN_UI_CONTENT_VIEW` (Default `false`, wirkt nur mit dem
   ersten). Parsing nach dem Muster von
   [auth-config.ts](../../../packages/server/src/auth-config.ts) inkl. Test.
2. **Statisches Serving**: `express.static` auf das Build-Verzeichnis,
   SPA-Fallback auf `index.html` für Client-Routen, korrekte Cache-Header
   (gehashte Assets `immutable`, `index.html` `no-cache`). Das Mount liegt
   **vor** der DAV-Auth-Kette, da die Login-Seite unauthentifiziert
   erreichbar sein muss; die UI-Dateien enthalten keine Geheimnisse.
3. **Security-Header**: CSP nur für `/admin-ui` anpassen (kein Inline-Script;
   ggf. `style-src 'self' 'unsafe-inline'` wegen Ant Design CSS-in-JS, alternativ
   Nonce/`cssinjs`-Extraktion prüfen), `frame-ancestors 'none'` bleibt.
   Der Kommentar in `security-headers.middleware.ts` zu „CORS bleibt aus“
   wird aktualisiert (gleicher Origin ⇒ weiter kein CORS).
4. **Docker/Compose**: Dockerfile baut `admin-ui` mit; Image enthält das
   Bundle immer, das Flag entscheidet zur Laufzeit. `docker-compose*.yml`
   und `.env`-Beispiele dokumentieren das Flag.
5. **Pfadkollision prüfen**: `/admin-ui` vs. `/admin/:tenantSlug` (Router
   matcht nur `/admin/…`), `/.well-known`, Tenant-Auflösung per Slug.

## Akzeptanzkriterien
- [ ] Flag aus: `GET /admin-ui/` → 404, Server startet ohne Build-Verzeichnis
- [ ] Flag an: `GET /admin-ui/` liefert die App, Deep-Link `/admin-ui/users`
      liefert `index.html`
- [ ] CSP-Test: keine Lockerung außerhalb von `/admin-ui`
- [ ] Startlog nennt, ob UI und Content-View aktiv sind
- [ ] Docker-Smoke-Test (CI) deckt beide Flag-Zustände ab
