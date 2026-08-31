# Große Aufgabe: Quota-Rekonziliation

## Ziel
Ein periodischer Cron-Job (node-cron, in-process — siehe
[planning/01-decisions.md](../../../planning/01-decisions.md) Runde 16)
sowie ein manuell auslösbarer Endpunkt berechnen `quota_used_bytes`
unabhängig vom laufenden Zähler neu und korrigieren Drift.

## Sub-Tasks
1. [Rekonziliations-Job](01-reconciliation-job.md)
2. [Manueller Trigger-Endpunkt](02-manual-trigger-endpoint.md)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 12, 16
