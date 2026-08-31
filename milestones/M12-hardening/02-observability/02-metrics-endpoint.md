# Sub-Task: Metrics-Endpoint

## Kontext
Basis-Betriebskennzahlen für Monitoring (z.B. Prometheus). Bewusst
schlank gehalten — kein vollständiges Observability-Stack-Setup.

## Aufgabe
- `GET /admin/{tenantSlug}/metrics` (nutzt dieselbe Rollenprüfung wie
  [M9s Admin-API](../../../M9-admin-api/02-admin-api-scaffold/02-authorization-middleware.md)
  — `server_admin`, da Metriken tenant-übergreifende Informationen
  enthalten können): Prometheus-Text-Exposition-Format
- Kennzahlen: `http_requests_total` (Label: `method`, `status` —
  **bewusst nicht** `tenant`/`user` als Label, um keine
  Kardinalitätsexplosion bei vielen Tenants/Nutzern zu erzeugen),
  `http_request_duration_seconds` (Histogram), `auth_failures_total`
  (Label: `scheme` — `basic`/`digest`/`oauth2`), `quota_used_bytes`
  je Tenant (Label: `tenant_slug` — hier bewusst als Label akzeptiert,
  da die Anzahl Tenants typischerweise deutlich kleiner ist als die
  Anzahl Nutzer/Requests)
- Zähler/Histogramme in-process (kein externes Time-Series-DB-
  Backend) — Prometheus "scraped" den Endpoint periodisch, DavNode hält
  selbst keine Historie vor

## Akzeptanzkriterien
- [ ] `GET /admin/{tenantSlug}/metrics` liefert valides
      Prometheus-Text-Format (mit einem Standard-Parser verifizierbar)
- [ ] `http_requests_total` erhöht sich sichtbar nach Testanfragen
- [ ] Kein `tenant`/`user`-Label auf `http_requests_total`/
      `http_request_duration_seconds` (Kardinalitäts-Check)
- [ ] Zugriff durch einen `member`/`tenant_admin` liefert `403`

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 27
