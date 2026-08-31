# Sub-Task: Health-Check-Endpoint

## Kontext
Wird von Docker/Orchestratoren genutzt, um zu erkennen, ob der
Container tatsächlich funktionsfähig ist (nicht nur "der Prozess
läuft"). Erweitert
[M2s Express-App & Server-Entrypoint](../../../M2-webdav-core/02-express-server-bootstrap/01-express-app-and-entrypoint.md).

## Aufgabe
- `GET /healthz`: **kein** Tenant-Präfix, **keine** Authentifizierung
  (Orchestrator-Probes haben keine Credentials) — läuft daher
  **außerhalb** der regulären Tenant-Resolution-/Auth-Middleware-Kette,
  ähnlich wie
  [M11s Well-Known-Route](../../../M11-client-compatibility/01-well-known-discovery/01-well-known-redirect-handler.md)
- Prüft aktive DB-Verbindung mit einer leichtgewichtigen Query (z.B.
  `SELECT 1`); erfolgreich → `200 OK` mit knappem JSON-Body
  (`{ "status": "ok" }`); DB nicht erreichbar → `503 Service
  Unavailable`
- Response **niemals** gecached (`Cache-Control: no-store`)

## Akzeptanzkriterien
- [ ] `GET /healthz` liefert `200` bei laufender DB-Verbindung, ganz
      ohne `Authorization`-Header
- [ ] Simulierter DB-Ausfall (z.B. Verbindung im Test getrennt) liefert
      `503`
- [ ] Endpoint ist nicht unter `/dav/{tenant}/...` erreichbar
      (bewusst außerhalb des Tenant-Präfixes)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 27
