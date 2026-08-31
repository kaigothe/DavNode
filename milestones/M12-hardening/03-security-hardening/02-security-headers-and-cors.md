# Sub-Task: Security-Header & CORS-Policy

## Kontext
Standard-Absicherung auf HTTP-Ebene, bisher nicht explizit gesetzt.

## Aufgabe
- Globale Middleware in `packages/server/src/app.ts` ergänzt auf jeder
  Antwort: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`
- `Strict-Transport-Security` **nur**, wenn `DAVNODE_BEHIND_TLS_PROXY=true`
  gesetzt ist (siehe
  [Produktions-Docker-Compose](../../01-health-and-production-deployment/02-production-docker-compose.md))
  — HSTS auf einer Nur-HTTP-Verbindung wäre wirkungslos bis
  irreführend, deshalb bewusst konditional
- **CORS**: standardmäßig **deaktiviert** (kein
  `Access-Control-Allow-Origin`-Header) — DAV-Clients sind keine
  Browser-JavaScript-Anwendungen und brauchen kein CORS; dokumentiert
  als bewusste Entscheidung, nicht als Auslassung, für den Fall einer
  künftigen Browser-basierten Admin-Oberfläche

## Akzeptanzkriterien
- [ ] Jede Antwort enthält `X-Content-Type-Options`, `X-Frame-Options`,
      `Referrer-Policy`
- [ ] `Strict-Transport-Security` fehlt, wenn
      `DAVNODE_BEHIND_TLS_PROXY` nicht gesetzt ist; ist vorhanden, wenn
      gesetzt
- [ ] Kein `Access-Control-Allow-Origin`-Header in irgendeiner Antwort

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 27
