# M12 — Hardening & Produktionsreife

## Setting (Kontext)
M0–M11 haben einen vollständigen, standards-konformen und
client-kompatiblen WebDAV/CalDAV/CardDAV-Server gebaut. M12 ist der
**letzte** Meilenstein der ursprünglichen Roadmap
([planning/02-roadmap.md](../../planning/02-roadmap.md)) und macht ihn
tatsächlich betreibbar: Health-Checks, Observability, Security-Härtung,
Backup-Fähigkeit und Dokumentation — keine neue Protokoll-Funktionalität
mehr, sondern Betriebsreife.

**Wichtigster Fund bei der Detailplanung** (Runde 27, siehe
[planning/01-decisions.md](../../planning/01-decisions.md)): es gab
bislang **keinerlei Drosselung fehlgeschlagener Auth-Versuche** — ein
Angreifer könnte Passwörter unbegrenzt durchprobieren. Wird hier
nachgerüstet.

## Scope-Entscheidungen (Runde 27)
- **TLS**: DavNode terminiert kein TLS selbst — Referenz-Deployment
  nutzt einen Reverse-Proxy (Caddy) davor
- **Backup**: da alle Inhalte in der DB liegen (Runde 15), ist ein
  DB-Backup automatisch vollständig — dokumentiertes Runbook statt
  eigenem Backup-Scheduler im Server
- **Rate-Limiting**: In-Memory, pro IP, Single-Instance (wie
  Nonce-Store/Cron) — kein Schutz vor verteilten Angriffen
- **Dokumentation**: eigenständige englische Nutzer-/Contributor-Doku,
  unabhängig von `planning/` (das intern und deutsch bleibt)

## Ziel
Am Ende von M12 lässt sich DavNode mit einer produktionsnahen
Docker-Compose-Konfiguration (inkl. automatischem HTTPS) betreiben,
liefert strukturierte Logs und Metriken, wehrt Brute-Force-Login-
Versuche ab, hat ein getestetes Backup/Restore-Runbook, und Nutzer wie
Contributor finden eigenständige, vollständige Dokumentation ohne
`planning/` lesen zu müssen.

## Große Aufgaben (Übersicht)
1. [Health-Checks & Produktions-Deployment](01-health-and-production-deployment/00-overview.md)
2. [Observability](02-observability/00-overview.md)
3. [Security-Härtung](03-security-hardening/00-overview.md)
4. [Backup & Restore](04-backup-restore/00-overview.md)
5. [Dokumentation](05-documentation/00-overview.md)

Empfohlene Bearbeitungsreihenfolge: wie nummeriert (1→5) — Aufgabe 5
fasst u.a. die in 1–4 entstandenen Konfigurationsoptionen zusammen und
sollte daher zuletzt kommen.

## Referenzen
- [planning/02-roadmap.md](../../planning/02-roadmap.md) — M12-Definition (letzter Meilenstein)
- [planning/01-decisions.md](../../planning/01-decisions.md) — Runde 15, 16, 17, 27

## Abgrenzung (nicht Teil von M12)
- Kein eigener Backup-Scheduler im Server (siehe oben)
- Kein Schutz vor verteilten (Multi-IP-)Brute-Force-Angriffen
- Keine Kubernetes-Manifeste — nur Docker Compose (konsistent mit
  Runde 1)
- Kein eigenes TLS-Zertifikatsmanagement im Server-Code
