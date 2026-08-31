# Sub-Task: Rekonziliations-Job

## Kontext
Der laufende Zähler aus [applyQuotaDelta](../../01-quota-counter-utility/01-apply-quota-delta.md)
kann durch Bugs, manuelle DB-Eingriffe oder nicht abgedeckte Codepfade
driften. Der Job berechnet die Wahrheit direkt aus den Content-Tabellen
neu.

## Aufgabe
- `packages/core/src/quota/recompute-quota.ts`: Funktion
  `recomputeQuotaForTenant(tenantId): Promise<void>`
  1. Für jeden `User` des Tenants: Summe der Byte-Längen aus
     `FileContent` (via `FileResource.owner_principal_id`),
     `AddressObjectContent` (via `AddressObject.owner_principal_id`)
     und `CalendarObjectContent` (via
     `CalendarObject.owner_principal_id`) — drei `SUM`-Queries,
     addiert, in `User.quotaUsedBytes` geschrieben (direktes Setzen,
     nicht `applyQuotaDelta` — hier wird der Wahrheitswert festgelegt,
     nicht ein Delta angewendet)
  2. `Tenant.quotaUsedBytes` = Summe aller `User.quotaUsedBytes` des
     Tenants (nach Schritt 1)
- `packages/core/src/cli/quota-reconciliation-cron.ts`: registriert
  `recomputeQuotaForTenant` für **alle** Tenants als node-cron-Job
  (Default: täglich, konfigurierbar über Umgebungsvariable, z.B.
  `DAVNODE_QUOTA_RECONCILE_CRON`)
- Job läuft **sequenziell** über Tenants (nicht parallel) — vermeidet
  DB-Last-Spitzen bei vielen Tenants; Laufzeit wird geloggt

## Akzeptanzkriterien
- [ ] Nach künstlich verursachtem Drift (z.B. `quota_used_bytes`
      manuell in der Test-DB verändert) korrigiert der Job den Wert auf
      die tatsächliche Summe
- [ ] Rekonziliation über mehrere Nutzer mit Inhalten in allen drei
      Domänen (Datei, Kontakt, Termin) summiert korrekt über alle drei
- [ ] Cron-Zeitplan ist über Umgebungsvariable konfigurierbar
- [ ] Ein Fehler bei einem Tenant lässt die Rekonziliation der übrigen
      Tenants nicht abbrechen (Fehler pro Tenant isoliert behandelt,
      geloggt)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 12, 16
