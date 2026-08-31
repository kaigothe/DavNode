# Sub-Task: Restore-Smoke-Test

## Kontext
Ein dokumentiertes, aber nie getestetes Backup-Verfahren ist im
Ernstfall wertlos. Diese Aufgabe beweist, dass das
[Backup-Runbook](01-backup-runbook.md) tatsächlich funktioniert —
automatisiert, wiederholbar, nicht nur einmalig manuell verifiziert.

## Aufgabe
- Neuer GitHub-Actions-Workflow (zeitgesteuert, z.B. wöchentlich, plus
  manuell auslösbar): startet eine DavNode-Instanz mit Postgres, seedet
  über das
  [M1-CLI-Bootstrap-Skript](../../../M1-kern-datenmodell-tenancy/05-seed-bootstrap-tooling/01-cli-bootstrap-script.md)
  Testdaten in allen drei Domänen (Datei, Kontakt, Termin), erstellt ein
  Backup nach dem dokumentierten Runbook, **zerstört** die Instanz
  vollständig, stellt aus dem Backup eine **frische** Instanz wieder
  her
- Verifiziert nach dem Restore: Bootstrap-Nutzer kann sich anmelden,
  die zuvor angelegte Datei/der Kontakt/der Termin sind über GET
  abrufbar und inhaltlich identisch (Checksum-Vergleich), Quota-Zähler
  stimmen
- Workflow schlägt sichtbar fehl, wenn irgendein Verifikationsschritt
  nicht passt — dieser CI-Job ist **kein** Anwendungscode, sondern
  reine Infrastruktur-Verifikation (bewusst nicht mit dem
  node-cron-Mechanismus aus M0/M8 verwechseln, der Laufzeit-Jobs **in**
  der Anwendung betrifft)

## Akzeptanzkriterien
- [ ] Workflow läuft manuell auslösbar erfolgreich durch
- [ ] Ein absichtlich fehlerhaftes Restore (z.B. Backup einer älteren,
      unvollständigen Sicherung) lässt den Workflow sichtbar
      fehlschlagen (Regressionstest der Verifikationslogik selbst)
- [ ] Alle drei Ressourcen-Domänen werden im Verifikationsschritt
      tatsächlich geprüft, nicht nur eine stellvertretend

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 27
