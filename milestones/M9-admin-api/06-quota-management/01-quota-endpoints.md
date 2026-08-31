# Sub-Task: Quota-Endpunkte

## Kontext
Löst
[M8s Übergangs-Endpunkt](../../../M8-quota/05-quota-recompute/02-manual-trigger-endpoint.md)
ab. Nutzt `recomputeQuotaForTenant` aus
[M8-Rekonziliations-Job](../../../M8-quota/05-quota-recompute/01-reconciliation-job.md).

## Aufgabe
- `GET /admin/{tenantSlug}/quota` — Tenant-weites Limit/Nutzung plus
  eine Liste aller Nutzer mit ihren jeweiligen Limit/Nutzung-Werten
  (`tenant_admin` des eigenen Tenants oder `server_admin`)
- `PATCH /admin/{tenantSlug}/quota` — aktualisiert das Tenant-Limit
  (`quotaLimitBytes`) — **nur `server_admin`**, konsistent mit der
  Begründung aus
  [Tenant-CRUD](../../03-tenant-management/01-tenant-crud.md) (ein
  Tenant darf sein eigenes Limit nicht selbst anheben); Nutzer-Limits
  werden weiterhin über
  [User-CRUD](../../04-user-management/01-user-crud.md) gepflegt
  (`tenant_admin` darf das für Nutzer des eigenen Tenants)
- `POST /admin/{tenantSlug}/quota/recompute` — löst
  `recomputeQuotaForTenant` synchron aus, `tenant_admin` (eigener
  Tenant) oder `server_admin` (jeder Tenant)

## Akzeptanzkriterien
- [ ] `GET` liefert korrekte Tenant- und Pro-Nutzer-Werte
- [ ] `PATCH` des Tenant-Limits durch `tenant_admin` liefert `403`
- [ ] `POST .../recompute` liefert nach künstlich verursachtem Drift die
      korrigierten Werte (Cross-Check mit M8-Verhalten)
- [ ] Alter M8-Endpunkt (`/dav/{tenant}/admin/quota/recompute`) kann
      entfernt werden, ohne dass Funktionalität verloren geht
      (Äquivalenz-Test)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 24
