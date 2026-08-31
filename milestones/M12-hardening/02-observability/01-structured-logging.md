# Sub-Task: Structured-Logging & Request-Tracing

## Kontext
Bisher gibt es nur ad-hoc-Konsolenausgaben (z.B. im
[Error-Handling aus M2](../../../M2-webdav-core/02-express-server-bootstrap/04-placeholder-authorization-and-error-handling.md)).
Für produktiven Betrieb braucht es strukturierte, maschinenlesbare Logs
mit Request-Korrelation — besonders relevant bei kaskadierenden
Operationen wie M7s Scheduling-Zustellungen, die über mehrere interne
Schritte laufen.

## Aufgabe
- Eine etablierte strukturierte Logging-Bibliothek für Node/TypeScript
  wählen (aktuellen Ökosystem-Stand bei Umsetzung prüfen, z.B. eine
  `pino`-artige Bibliothek — JSON-Output, geringer Overhead)
- `packages/server/src/http/request-logging.middleware.ts`: generiert
  pro Request eine `requestId` (UUID), loggt `method`, `path`,
  `status`, `durationMs`, `tenantSlug`, `principalId` (falls
  authentifiziert) strukturiert; `requestId` wird an alle
  nachgelagerten Log-Aufrufe innerhalb desselben Requests weitergereicht
  (z.B. via `AsyncLocalStorage` oder gleichwertigem Mechanismus)
- **Log-Level** über `DAVNODE_LOG_LEVEL` konfigurierbar
  (`error`/`warn`/`info`/`debug`)
- **Redaction-Liste**: Passwörter, Digest-HA1-Werte, OAuth2-Tokens,
  Basic-Auth-Header werden **nie** geloggt, auch nicht auf `debug`-Level
  — konsistent mit den bereits in M1/M2/M10 etablierten
  Klartext-Vermeidungs-Regeln, hier als zentrale, durchgesetzte
  Redaction statt verstreuter Einzelmaßnahmen

## Akzeptanzkriterien
- [ ] Jeder Log-Eintrag ist valides JSON mit mindestens `timestamp`,
      `level`, `requestId`, `message`
- [ ] Zwei Log-Zeilen desselben Requests (z.B. Start und Abschluss)
      teilen dieselbe `requestId`
- [ ] `DAVNODE_LOG_LEVEL=error` unterdrückt `info`/`debug`-Zeilen
- [ ] Ein absichtlicher Testfall mit Passwort im Request loggt dieses
      **nirgends**, auch nicht auf `debug`-Level (Grep-Test über
      Log-Output)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 27
