# Sub-Task: Produktions-Docker-Compose

## Kontext
[M0s docker-compose.yml](../../../M0-fundament/04-docker-setup/02-docker-compose.md)
ist auf lokale Entwicklung ausgelegt (exponierte Ports, kein TLS). Diese
Aufgabe ergänzt eine produktionsnahe Variante, ohne die Dev-Variante zu
ersetzen.

## Aufgabe
- `docker-compose.prod.yml` (oder ein Compose-Profil in derselben
  Datei): ergänzt einen Caddy-Reverse-Proxy-Service vor `app` —
  automatisches Let's-Encrypt-Zertifikatsmanagement über eine
  `DOMAIN`-Umgebungsvariable, `app`-Service selbst bindet **nicht**
  mehr direkt an einen öffentlichen Port (nur intern für Caddy
  erreichbar)
- `app`-Service bekommt `healthcheck:`-Direktive, die
  [den Health-Check-Endpoint](01-health-check-endpoint.md) abfragt;
  `restart: unless-stopped`
- Sinnvolle Default-Resource-Limits (`mem_limit`/`cpus`, als
  dokumentierte, überschreibbare Startwerte, keine harten Grenzen "für
  alle Ewigkeit")
- `.env.prod.example` mit allen zu diesem Zeitpunkt existierenden
  produktionsrelevanten Umgebungsvariablen (aus M0–M11 angesammelt:
  DB-Verbindung, `DAVNODE_HTTP_PORT`, `DAVNODE_AUTH_PROVIDERS`,
  `DAVNODE_OAUTH2_ISSUERS`, `DAVNODE_DEFAULT_TENANT`,
  `DAVNODE_QUOTA_RECONCILE_CRON`, `DOMAIN` für Caddy, ...) — vollständige
  Liste wird in
  [Dokumentation](../../05-documentation/00-overview.md) noch einmal
  strukturiert aufbereitet

## Akzeptanzkriterien
- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml up`
      startet App + Caddy + DB, App ist **nur** über Caddy (HTTPS)
      erreichbar, nicht direkt
- [ ] Mit einer lokal auflösbaren Test-Domain (z.B. über `/etc/hosts`
      oder einen lokalen ACME-Test-Server) stellt Caddy erfolgreich ein
      Zertifikat aus
- [ ] `healthcheck:` lässt Docker den Container als "unhealthy"
      markieren, wenn `/healthz` fehlschlägt (Test: DB-Container
      stoppen, App-Container wird als unhealthy erkannt)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 27
