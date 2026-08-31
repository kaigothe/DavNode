# Sub-Task: Manueller Trigger-Endpunkt

## Kontext
Analog zum
[M6-Feed-Token-Endpoint](../../../M6-caldav/07-ics-feed-export/01-feed-token-management.md):
ein einfacher, Basic-Auth-geschützter Endpunkt, bis eine komfortablere
Verwaltung über die Admin-API (M9) existiert.

## Aufgabe
- `POST /dav/{tenant}/admin/quota/recompute` (oder vergleichbarer,
  klar als administrativ erkennbarer Pfad): ruft
  `recomputeQuotaForTenant` synchron für den aktuellen Tenant auf,
  liefert die neuen Zahlen als Antwort
- Erfordert `req.principal`s zugehöriger `User.isAdmin === true` (neues
  Platzhalter-Flag, Runde 23 — siehe
  [planning/01-decisions.md](../../../planning/01-decisions.md)), sonst
  `403`. Bewusst pragmatische Übergangslösung ohne echtes Rollenmodell,
  im Code klar als solche markiert (`// TODO(M9): durch Rollenmodell
  ersetzen`), wird in M9 durch die Admin-API-Berechtigungslogik ersetzt

## Akzeptanzkriterien
- [ ] Aufruf durch einen Nutzer mit `isAdmin = true` löst die
      Rekonziliation aus und liefert aktualisierte Werte
- [ ] Aufruf durch einen regulären (`isAdmin = false`) Nutzer liefert
      `403`
- [ ] Response enthält die aktualisierten `quota_used_bytes`-Werte

## Nachtrag (Runde 24, sobald M9 existiert)
Sobald [M9 — Admin-API](../../M9-admin-api/00-setting-goal.md) existiert,
wird dieser Endpunkt durch
`POST /admin/{tenantSlug}/quota/recompute` (siehe
[M9-Quota-Management](../../M9-admin-api/06-quota-management/00-overview.md))
ersetzt — gleiche zugrundeliegende `recomputeQuotaForTenant`-Funktion,
aber mit echter Rollenprüfung (`role`) statt `isAdmin`. Wird die
Roadmap linear umgesetzt, kann dieser Übergangs-Endpunkt übersprungen
und direkt der M9-Endpunkt gebaut werden (wie bereits beim
[M1-Bootstrap-Nachtrag](../../M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling/01-cli-bootstrap-script.md)
vermerkt).

## Referenzen
- [planning/02-roadmap.md](../../../planning/02-roadmap.md) — M8/M9-Abgrenzung
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 24
