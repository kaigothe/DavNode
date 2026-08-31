# Sub-Task: docker-compose.yml

## Kontext
Lokale Entwicklungs-/Referenzumgebung, auch als Grundlage für die
DB-Engine-Testmatrix (Große Aufgabe "TypeORM & Datenbank-Setup").

## Aufgabe
- `docker-compose.yml` im Root mit mindestens: `app`-Service (baut aus
  dem lokalen Dockerfile), `postgres`-Service (als Standard-DB für die
  Compose-Referenzkonfiguration)
- Optionaler zusätzlicher Service `mysql` (für die DB-Engine-Testmatrix)
  — per Compose-Profile so eingebunden, dass er nicht bei jedem
  `docker compose up` zwingend mitläuft
- Named Volumes für Datenbank-Persistenz
- `.env.example` mit den in Sub-Task "TypeORM-DataSource-Konfiguration"
  definierten Umgebungsvariablen

## Akzeptanzkriterien
- [ ] `docker compose up` startet App + Postgres, App-Container verbindet
      sich erfolgreich mit Postgres
- [ ] `.env.example` deckt alle von der App benötigten Umgebungsvariablen
      ab

## Referenzen
- [planning/01-decisions.md](../../../planning/01-decisions.md) — Runde 1, 3
