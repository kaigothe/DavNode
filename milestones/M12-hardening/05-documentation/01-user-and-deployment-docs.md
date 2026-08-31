# Sub-Task: Nutzer- & Deployment-Dokumentation

## Kontext
[M0s README](../../../M0-fundament/01-monorepo-scaffold/03-license-readme.md)
war bewusst ein Stub, der auf `planning/` verweist ("Quelle der
Wahrheit für Architektur/Roadmap während der Planungsphase"). Jetzt,
am Ende der Roadmap, braucht das Projekt eine eigenständige Doku.

## Aufgabe
- README.md substanziell erweitern: Quick-Start
  (`docker compose up`), Übersicht über unterstützte Standards
  (Kurzfassung von
  [planning/06-standards-compliance.md](../../../planning/06-standards-compliance.md),
  auf Englisch neu formuliert — nicht die deutsche Tabelle 1:1
  übersetzt/verlinkt)
- **Konsolidierte Umgebungsvariablen-Referenz**: eine einzige Tabelle
  mit **allen** seit M0 eingeführten `DAVNODE_*`-Variablen (DB-
  Verbindung, `HTTP_PORT`, `AUTH_PROVIDERS`, `OAUTH2_ISSUERS`,
  `DEFAULT_TENANT`, `QUOTA_RECONCILE_CRON`, `LOG_LEVEL`,
  `BEHIND_TLS_PROXY`, `AUTH_RATE_LIMIT_MAX`/`_WINDOW_MINUTES`, ...) —
  bisher über zwölf Meilensteine verstreut, hier erstmals an **einer**
  Stelle gesammelt
- Client-Einrichtungs-Anleitungen: Apple Calendar/Contacts und
  Thunderbird/DAVx5 über
  [RFC-6764-Discovery (M11)](../../../M11-client-compatibility/01-well-known-discovery/00-overview.md),
  Outlook über den [ICS-Feed (M6)](../../../M6-caldav/07-ics-feed-export/00-overview.md)
- Verweis auf
  [Backup-Runbook](../../04-backup-restore/01-backup-runbook.md) und
  Produktions-Deployment
  ([M12 Große Aufgabe 1](../../01-health-and-production-deployment/00-overview.md))

## Akzeptanzkriterien
- [ ] Ein neuer Leser kann anhand des README allein (ohne `planning/`
      zu öffnen) eine lokale Instanz starten und einen Client verbinden
- [ ] Umgebungsvariablen-Tabelle ist vollständig (Cross-Check: jede in
      den Milestone-Dateien M0–M12 referenzierte `DAVNODE_*`-Variable
      taucht auf)
- [ ] Alle Beispielbefehle sind copy-paste-lauffähig

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 17, 27
