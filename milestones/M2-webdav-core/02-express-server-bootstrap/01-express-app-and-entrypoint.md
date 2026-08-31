# Sub-Task: Express-App & Server-Entrypoint

## Kontext
Erster echter Server-Start des Projekts. M0 hat im Dockerfile
([milestones/M0-fundament/04-docker-setup/01-dockerfile.md](../../M0-fundament/04-docker-setup/01-dockerfile.md))
bewusst nur einen Platzhalter-Entrypoint angelegt, der jetzt durch den
echten Server ersetzt wird.

## Aufgabe
- `packages/server/src/app.ts`: erstellt und konfiguriert die
  Express-App (Middleware-Kette, Routen-Mounting — Routen selbst kommen
  in den folgenden Großen Aufgaben dazu), exportiert die App **ohne**
  sie zu starten (wichtig für Tests: App importierbar, ohne Port zu
  binden)
- `packages/server/src/index.ts`: Server-Entrypoint, liest Port/Host aus
  Umgebungsvariablen (z.B. `DAVNODE_HTTP_PORT`, Default `8080`),
  initialisiert die TypeORM-DataSource (aus M0/`core`) und startet erst
  danach `app.listen(...)` — Server darf nicht "hochfahren", bevor die
  DB-Verbindung steht
- Sauberes Shutdown-Handling (`SIGTERM`/`SIGINT`): laufende Requests
  abschließen lassen, DataSource schließen, dann Prozess beenden —
  wichtig für Docker/Kubernetes-Deployments
- Das Platzhalter-Entrypoint-Script aus dem M0-Dockerfile durch den
  echten Aufruf von `packages/server/src/index.ts` ersetzen

## Akzeptanzkriterien
- [ ] `docker compose up` (aus M0) startet jetzt den echten Server statt
      des Platzhalters; ein einfacher `curl` auf einen noch nicht
      existierenden Pfad liefert eine HTTP-Antwort (kein Crash)
- [ ] Server startet **nicht**, wenn die DB-Verbindung fehlschlägt
      (klarer Fehler + Exit-Code ≠ 0, kein "Zombie"-Prozess ohne DB)
- [ ] `SIGTERM` beendet den Prozess sauber (Test/manuelle Verifikation:
      kein erzwungenes Kill nötig)

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 1
